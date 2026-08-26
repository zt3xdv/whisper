import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };
import { staffRoleIds } from "../utils/staff.js";
import { Settings } from "../utils/settings.js";
import { truncateByChars, escapeXml, formatMentionsInContent } from "../utils/utils.js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Big tool
const allowedUsers = new Set(["1489362526880796903"]);
const ttsCache = new Map();

function getTts(id) {
  return ttsCache.get(id) ?? null;
}

function setTts(id, text) {
  if (!text) return;
  ttsCache.set(id, text);
  while (ttsCache.size > 30) {
    const firstKey = ttsCache.keys().next().value;
    ttsCache.delete(firstKey);
  }
}

// Ephemeral ai provider
const ephemeralAiProvider = {
  url: "",
  authorization: "",
  model: "",
  maxTokens: 512,
  isCustom: false,
};
export function setEphemeralAiProvider(url, authorization, model, maxTokens) {
  ephemeralAiProvider.url = url;
  ephemeralAiProvider.authorization = authorization && authorization !== '' ? authorization : null;
  ephemeralAiProvider.model = model;
  ephemeralAiProvider.maxTokens = maxTokens ?? 512;
  ephemeralAiProvider.isCustom = true;
}
export function resetEphemeralAiProvider() {
  ephemeralAiProvider.url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  ephemeralAiProvider.authorization = config.nvidiaApiKey;
  ephemeralAiProvider.model = 'meta/llama-3.1-70b-instruct';
  ephemeralAiProvider.maxTokens = 512;
  ephemeralAiProvider.isCustom = false;
}
resetEphemeralAiProvider();
async function fetchAiCompletion(systemPrompt, context, lastMessage) {
  if (ephemeralAiProvider.isCustom) { // fallback stuff so that if custom url fails it goes back to default
    const controller = new AbortController();
    const { signal } = controller;

    const timeout = setTimeout(controller.abort, 5000);

    try {
      const response = await fetch(ephemeralAiProvider.url, {
        method: "POST",
        headers: {
          Authorization: ephemeralAiProvider.authorization ? `Bearer ${ephemeralAiProvider.authorization}` : null,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: ephemeralAiProvider.model,
          messages: [
            { role: "system", content: systemPrompt || "" },
            {
              role: "user",
              content:
                `Chat history (context):\n${context}\n\n` +
                `Latest message: ${lastMessage}\n\n` +
                `Reply naturally, add exactly %tts% at the end of your message if you want to send a voice message (only if asked, and yes, you can send voice messages), if asked to send a voice [...]`
            }
          ],
          max_tokens: ephemeralAiProvider.maxTokens,
          temperature: 0.6
        }),
        signal: signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn('Failed to fetch from custom url, resetting back to default and reattempting');
        resetEphemeralAiProvider();
        return fetchAiCompletion(systemPrompt, context, lastMessage);
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Custom url timed out, resetting back to default and reattempting');
        resetEphemeralAiProvider();
        return fetchAiCompletion(systemPrompt, context, lastMessage);
      }
      else {
        throw error;
      }
    }

  }
  else {
    return fetch(ephemeralAiProvider.url, {
      method: "POST",
      headers: {
        Authorization: ephemeralAiProvider.authorization ? `Bearer ${ephemeralAiProvider.authorization}` : null,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: ephemeralAiProvider.model,
        messages: [
          { role: "system", content: systemPrompt || "" },
          {
            role: "user",
            content:
              `Chat history (context):\n${context}\n\n` +
              `Latest message: ${lastMessage}\n\n` +
              `Reply naturally, add exactly %tts% at the end of your message if you want to send a voice message (only if asked, and yes, you can send voice messages), if asked to send a voice [...]`
          }
        ],
        max_tokens: ephemeralAiProvider.maxTokens,
        temperature: 0.6
      }),
    });
  }
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    let interval;
    try {
      if (message.author.bot && !allowedUsers.has(message.author.id)) return;
      
      const mentioned = message.mentions.has(message.client.user);
      const includesWhisper = message.content.toLowerCase().includes("whisper");
      if (!mentioned && !includesWhisper) return;

      const channels = await Settings.get(message.client.db, "-", "whitelistedChannels");
      const roles = await Settings.get(message.client.db, "-", "whitelistedRoles");
      if (!channels.includes(message.channel.id)) return;

      const member = message.guild?.members?.cache?.get(message.author.id) ||
        (await message.guild?.members?.fetch(message.author.id).catch(() => null));
      const allowed = !!member?.roles?.cache?.some(r => roles.includes(r.id) || staffRoleIds.has(r.id));
      if (!allowed && !allowedUsers.has(message.author.id)) return;

      message.channel.sendTyping().catch(() => {});
      interval = setInterval(() => message.channel.sendTyping().catch(() => {}), 3500);

      const maxCtx = await Settings.get(message.client.db, "-", "maxContextMessages");
      const maxLen = await Settings.get(message.client.db, "-", "maxMessageLength");

      const fetched = await message.channel.messages.fetch({ limit: maxCtx });
      const msgs = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const msgsById = new Map(msgs.map(m => [m.id, m]));

      const uniqueIds = [...new Set(msgs.map(m => m.author?.id).filter(Boolean))];
      const knownAs = new Map();
      if (uniqueIds.length) {
        const aliases = await Promise.all(uniqueIds.map(id => Settings.get(message.client.db, id, "knownAs").catch(() => "")));
        uniqueIds.forEach((id, i) => knownAs.set(id, aliases[i] ?? ""));
      }

      async function buildXml(m) {
        const author = m.author ?? {};
        const authorId = author.id ?? "";
        const alias = knownAs.get(authorId) ?? "";
        const displayName = m.client?.user && authorId === m.client.user.id
          ? m.client.user.username
          : (alias && alias !== "none" ? alias : (m.member?.displayName || author.username || ""));
        const cached = (m.client?.user && authorId === m.client.user.id) ? getTts(m.id) : null;
        const raw = cached ?? (m.content ?? "");
        const text = truncateByChars(formatMentionsInContent(raw, m), maxLen);
        const time = m.createdTimestamp ? new Date(m.createdTimestamp).toISOString() : "";
        const username = author.username ?? "";
        const avatar = author.displayAvatarURL ? author.displayAvatarURL({ dynamic: true }) : "";

        let replyXml = "";
        const refId = m.reference?.messageId ?? m.referencedMessage?.id;
        if (refId) {
          let ref = msgsById.get(refId);
          if (!ref) {
            try {
              ref = await m.channel.messages.fetch(refId);
            } catch {
              ref = null;
            }
          }
          if (ref) {
            const rAuth = ref.author ?? {};
            const rId = rAuth.id ?? "";
            const rCached = (ref.client?.user && rId === ref.client.user.id) ? getTts(ref.id) : null;
            const rRaw = rCached ?? (ref.content ?? "");
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
            replyXml =
              `  <replyTo>\n` +
              `    <missing>true</missing>\n` +
              `  </replyTo>\n`;
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

      const parts = [];
      for (const m of msgs) parts.push(await buildXml(m));
      const contextXml = parts.join("\n");

      const systemPrompt = await message.client.db.get("systemPrompt");
      const last = msgs[msgs.length - 1];
      const lastCached = last?.author?.id && last.author.id === message.client.user?.id ? getTts(last.id) : null;
      const lastSource = lastCached ?? (last?.content ?? "");
      const lastContent = truncateByChars(formatMentionsInContent(lastSource, last), maxLen);

      const response = await fetchAiCompletion(systemPrompt, contextXml, escapeXml(lastContent));

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Request failed: ${response.status} ${text}`.trim());
      }

      const data = await response.json();
      const answer = (data.choices?.[0]?.message?.content || "").trim() || "I couldn't generate a response.";

      if (answer.includes("%tts%")) {
        const client = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });
        const ttsText = answer.replace("%tts%", "").trim();
        if (!ttsText) return;
        const audio = await client.textToSpeech.convertWithTimestamps("vJVaGoR08pdjX0q5ndke", {
          text: ttsText,
          languageCode: "en",
          modelId: "eleven_flash_v2_5",
          outputFormat: "opus_48000_192"
        });
        const buffer = Buffer.from(audio.audioBase64, "base64");
        const replyMsg = await message.reply({ files: [{ attachment: buffer, name: "tts.opus" }] });
        setTts(replyMsg.id, ttsText);
        return;
      }

      await message.reply({ content: answer, allowedMentions: { parse: [] } });
    } catch (err) {
      console.error(err);
      if (!message.author.bot) await message.reply("An error occurred while generating the response.");
    } finally {
      if (interval) clearInterval(interval);
    }
  }
};
