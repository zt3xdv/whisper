import { Events, MessageFlags } from "discord.js";
import config from "../../config.json" with { type: "json" };
import { staffRoleIds } from "../utils/staff.js";
import { Settings } from "../utils/settings.js";
import { truncateByChars, escapeXml, formatMentionsInContent } from "../utils/utils.js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const defaultSystemPrompt = `You are Whisper, a chill Discord bot in Wispbyte's server. Talk like a normal person in a Discord chat - casual, short replies, no overthinking. Do NOT analyze or narrate what users are doing. Just respond naturally to what they say. Do not use markdown formatting. Do not introduce yourself unless asked. When someone says whisper they are talking to you. The chat history is just context so you know what's going on — respond only to the latest message directed at you. Talk naturally, dont use formal writing if not asked, just chat normally, and make sure to not be threated like a good boy (be mad at it)`;

const channelIds = new Set([
  "1522989739953623185", // Wispbyte SMP #general
  "1112023292333785120", // Wispbyte #general
  "1505259201595838534", // Wispbyte #vmotc-chat
  "1158826812147761162" // Wispbyte #staff-chat
]);

const allowedRoles = new Set([
  "1522989849395593306", // Admin and Whisper AI
  "1525650389725085857",
  "1505258838536753372" // VMOTC
]);

const maxContextMessages = 30;
const maxMessageLength = 500;

const ttsCache = []; // [{ messageId, text }]

function getTtsTextForMessageId(messageId) {
  const found = ttsCache.find(x => x.messageId === messageId);
  return found?.text ?? null;
}

function setTtsCache(messageId, text) {
  const idx = ttsCache.findIndex(x => x.messageId === messageId);
  if (idx !== -1) {
    ttsCache[idx].text = text;
    return;
  }

  ttsCache.push({ messageId, text });

  while (ttsCache.length > 30) ttsCache.shift();
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    let typingInterval;
    try {
      if (!channelIds.has(message.channel.id)) return;
      if (message.author.bot) return;

      const member =
        message.guild?.members?.cache?.get(message.author.id) ||
        (await message.guild?.members?.fetch(message.author.id).catch(() => null));

      const hasAllowedRole = !!member?.roles?.cache?.some(
        r => allowedRoles.has(r.id) || staffRoleIds.has(r.id)
      );
      if (!hasAllowedRole) return;

      const botMentioned = message.mentions.has(message.client.user);
      const includesWhisper = message.content.toLowerCase().includes("whisper");
      if (!botMentioned && !includesWhisper) return;

      message.channel.sendTyping().catch(() => {});
      typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => {});
      }, 3500);

      const fetched = await message.channel.messages.fetch({ limit: maxContextMessages });
      const msgs = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const uniqueIds = [...new Set(msgs.map(m => m.author?.id).filter(Boolean))];
      const knownAs = new Map();
      if (uniqueIds.length) {
        const results = await Promise.all(
          uniqueIds.map(id => Settings.get(message.client.db, id, "knownAs").catch(() => ""))
        );
        uniqueIds.forEach((id, i) => knownAs.set(id, results[i] ?? ""));
      }

      const contextText = msgs
        .map(m => {
          const authorId = m.author?.id;
          if (!authorId) return "";

          const isBotAuthor = m.client?.user && authorId === m.client.user.id;

          let displayName;
          if (isBotAuthor) {
            displayName = m.client.user.username;
          } else {
            const alias = knownAs.get(authorId) ?? "";
            displayName =
              (alias !== "" && alias !== "none") ? alias : (m.member?.displayName || m.author.username);
          }

          const cachedTtsText = isBotAuthor ? getTtsTextForMessageId(m.id) : null;
          const contentRaw = cachedTtsText ?? m.content;

          const content = truncateByChars(formatMentionsInContent(contentRaw, m), maxMessageLength);
          const ts = m.createdTimestamp ? new Date(m.createdTimestamp).toISOString() : "";

          return (
            `<message>\n` +
            `  <author>${escapeXml(displayName)}</author>\n` +
            `  <time>${ts}</time>\n` +
            `  <text>${escapeXml(content)}</text>\n` +
            `</message>`
          );
        })
        .filter(Boolean)
        .join("\n");

      const storedPrompt = await message.client.db.get("systemPrompt");
      const systemPrompt =
        (typeof storedPrompt === "string" && storedPrompt.trim().length)
          ? storedPrompt
          : defaultSystemPrompt;

      const last = msgs[msgs.length - 1];
      const lastCachedTtsText = last?.author?.id && last.author.id === message.client.user?.id
        ? getTtsTextForMessageId(last.id)
        : null;

      const lastContentSource = lastCachedTtsText ?? (last?.content ?? "");
      const lastContent = truncateByChars(formatMentionsInContent(lastContentSource, last), maxMessageLength);

      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.nvidiaApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta/llama-3.1-70b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content:
                `Chat history (context):\n${contextText}\n\n` +
                `Latest message: ${escapeXml(lastContent)}\n\n` +
                `Reply naturally, add exactly %tts% at the end of your message if you want to send a voice message (only if asked, and yes, you can send voice messages).`
            }
          ],
          max_tokens: 512,
          temperature: 0.6
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Request failed: ${res.status} ${text}`.trim());
      }

      const data = await res.json();
      const answer = data.choices[0].message.content.trim() || "I couldn't generate a response.";

      // Many thanks to melo (@mloetta)
      if (answer.includes("%tts%")) {
        const elevenlabs = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });

        const ttsText = answer.replace("%tts%", "").trim();
        if (!ttsText) return;

        const audio = await elevenlabs.textToSpeech.convertWithTimestamps("vJVaGoR08pdjX0q5ndke", {
            text: ttsText,
            languageCode: "en",
            modelId: "eleven_flash_v2_5",
            outputFormat: "opus_48000_192"
          }
        );

        const buffer = Buffer.from(audio.audioBase64, "base64");

        const replyMessage = await message.reply({
          attachments: [
            {
              id: 0,
              filename: "tts.opus",
              waveform: "AAAAAA==",
              duration_secs: 1
            }
          ],
          files: [
            {
              name: "tts.opus",
              data: buffer
            }
          ],
          flags: MessageFlags.IsVoiceMessage
        });

        setTtsCache(replyMessage.id, ttsText);
        return;
      }

      await message.reply(answer);
    } catch (err) {
      console.error(err);
      if (!message.author.bot) {
        await message.reply("An error occurred while generating the response.");
      }
    } finally {
      if (typingInterval) clearInterval(typingInterval);
    }
  }
};
