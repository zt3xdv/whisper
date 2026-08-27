export const ephemeralAiProvider = {
  url: "",
  authorization: "",
  model: "",
  maxTokens: 512,
  isCustom: false,
};

export function truncateByChars(str, max) {
  return str.length > max ? str.substring(0, max) + "..." : str;
}

export function escapeXml(unsafe) {
  return unsafe.replace(/[<>&"']/g, (m) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  }[m]));
}

export function formatMentionsInContent(content, message) {
  let text = content;
  message.mentions.users.forEach(u => {
    text = text.replace(new RegExp(`<@!?${u.id}>`, 'g'), `@${u.username}`);
  });
  return text;
}

export async function getTtsFromDb(db, id) {
  const cache = await db.get("tts_cache") || {};
  return cache[id] ?? null;
}

export async function setTtsInDb(db, id, text) {
  if (!text) return;
  let cache = await db.get("tts_cache") || {};
  let order = await db.get("tts_order") || [];

  cache[id] = text;
  order.push(id);

  while (order.length > 30) {
    const firstKey = order.shift();
    delete cache[firstKey];
  }

  await db.set("tts_cache", cache);
  await db.set("tts_order", order);
}

export async function fetchAiCompletion(systemPrompt, context, lastMessage) {
  const body = {
    model: ephemeralAiProvider.model,
    messages: [
      { role: "system", content: systemPrompt || "" },
      {
        role: "user",
        content:
          `Chat history (context):\n${context}\n\n` +
          `Latest message: ${lastMessage}\n\n` +
          `Reply naturally, add exactly %tts% at the end of your message if you want to send a voice message (TTS of you original text)`
      }
    ],
    max_tokens: ephemeralAiProvider.maxTokens,
    temperature: 0.6
  };

  const headers = { "Content-Type": "application/json" };
  if (ephemeralAiProvider.authorization) {
    headers["Authorization"] = `Bearer ${ephemeralAiProvider.authorization}`;
  }

  try {
    const response = await fetch(ephemeralAiProvider.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok && ephemeralAiProvider.isCustom) return { fallback: true };
    return response;
  } catch (error) {
    if (ephemeralAiProvider.isCustom || error.name === 'TimeoutError') return { fallback: true };
    throw error;
  }
}

export async function buildXml(m, knownAs, maxLen, msgsById) {
  const author = m.author ?? {};
  const authorId = author.id ?? "";
  const alias = knownAs.get(authorId) ?? "";
  const displayName = m.client?.user && authorId === m.client.user.id
    ? m.client.user.username
    : (alias && alias !== "none" ? alias : (m.member?.displayName || author.username || ""));
  
  let raw = m.content ?? "";
  if (m.client?.user && authorId === m.client.user.id) {
    const cached = await getTtsFromDb(m.client.db, m.id);
    if (cached) raw = cached;
  }

  const text = truncateByChars(formatMentionsInContent(raw, m), maxLen);
  const time = m.createdTimestamp ? new Date(m.createdTimestamp).toISOString() : "";
  const username = author.username ?? "";
  const avatar = author.displayAvatarURL ? author.displayAvatarURL({ dynamic: true }) : "";

  let replyXml = "";
  const refId = m.reference?.messageId ?? m.referencedMessage?.id;
  if (refId) {
    let ref = msgsById.get(refId) || await m.channel.messages.fetch(refId).catch(() => null);
    if (ref) {
      const rAuth = ref.author ?? {};
      const rId = rAuth.id ?? "";
      let rRaw = ref.content ?? "";
      if (ref.client?.user && rId === ref.client.user.id) {
        const rCached = await getTtsFromDb(ref.client.db, ref.id);
        if (rCached) rRaw = rCached;
      }
      const rText = truncateByChars(formatMentionsInContent(rRaw, ref), maxLen);
      const rTime = ref.createdTimestamp ? new Date(ref.createdTimestamp).toISOString() : "";
      const rUser = rAuth.username ?? "";
      const rAvatar = rAuth.displayAvatarURL ? rAuth.displayAvatarURL({ dynamic: true }) : "";

      replyXml =
        `  <replyTo>\n` +
        `    <authorId>${escapeXml(rId)}</authorId>\n` +
        `    <username>${escapeXml(rUser)}</username>\n` +
        `    <displayName>${escapeXml(ref.member?.displayName || rUser)}</displayName>\n` +
        `    <avatarUrl>${escapeXml(rAvatar)}</avatarUrl>\n` +
        `    <time>${rTime}</time>\n` +
        `    <text>${escapeXml(rText)}</text>\n` +
        `  </replyTo>\n`;
    } else {
      replyXml = `  <replyTo>\n    <missing>true</missing>\n  </replyTo>\n`;
    }
  }

  return (
    `<message>\n` +
    `  <authorId>${escapeXml(authorId)}</authorId>\n` +
    `  <username>${escapeXml(username)}</username>\n` +
    `  <displayName>${escapeXml(displayName)}</displayName>\n` +
    `  <avatarUrl>${escapeXml(avatar)}</avatarUrl>\n` +
    `  <time>${time}</time>\n` +
    `  <text>${escapeXml(text)}</text>\n` +
    (replyXml ? `\n${replyXml}` : "") +
    `</message>`
  );
}

export function getRandomWaveform(numPoints = 100) {
  const bytes = new Uint8Array(numPoints);
  let lastValue = 128;

  for (let i = 0; i < numPoints; i++) {
    const change = (Math.random() * 60) - 30; 
    lastValue = Math.max(20, Math.min(255, lastValue + change));
    bytes[i] = Math.round(lastValue);
  }

  return Buffer.from(bytes).toString('base64');
}
