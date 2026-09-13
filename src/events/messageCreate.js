import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };
import { Settings } from "../utils/settings.js";
import { truncateByChars, formatMentionsInContent } from "../utils/utils.js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const ttsCache = new Map();
const maxRetries = 2;

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

export default {
  id: "messageCreate",
  name: Events.MessageCreate,

  actions: [
    {
      name: "react",

      async execute({ channel, meta }) {
        const { messageId, emoji } = meta ?? {};

        if (!messageId || !emoji) {
          throw new Error("Action react requires meta.messageId and meta.emoji.");
        }

        const targetMessage = await channel.messages.fetch(messageId);
        await targetMessage.react(emoji);
      }
    }
  ],

  extractActions(answer) {
    const actions = [];
    const textLines = [];

    for (const line of answer.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed);

          if (parsed?.action) {
            actions.push(parsed);
            continue;
          }
        } catch { /* invalid json thing */ }
      }

      textLines.push(line);
    }

    return {
      text: textLines.join("\n").trim(),
      actions
    };
  },

  async executeActions(actions, message) {
    for (const actionCall of actions) {
      const action = this.actions.find(
        item => item.name === actionCall?.action
      );

      if (!action) {
        continue;
      }

      try {
        await action.execute({
          client: message.client,
          channel: message.channel,
          message,
          meta: actionCall.meta ?? {}
        });
      } catch (error) {
        console.error(`Error executing action "${actionCall.action}":`, error);
      } finally {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  },

  defaultEphemeralConfig: {
    url: config.ai.url,
    authorization: config.ai.token,
    model: config.ai.model,
    maxTokens: 512,
  },

  ephemeralAiProvider: {
    url: config.ai.url,
    authorization: config.ai.token,
    model: config.ai.model,
    maxTokens: 512,
  },

  setEphemeralAiProvider(url, authorization, model, maxTokens) {
    this.ephemeralAiProvider = {
      url,
      authorization: (authorization?.trim?.()) || null,
      model,
      maxTokens: maxTokens ?? 512,
      isCustom: true
    };
  },

  resetEphemeralAiProvider() {
    this.ephemeralAiProvider = this.defaultEphemeralConfig;
  },

  async fetchAiCompletion(systemPrompt, context, lastMessage) {
    const requestBody = {
      model: this.ephemeralAiProvider.model,
      messages: [
        { role: "system", content: systemPrompt || "" },
        {
          role: "user",
          content:
            `Chat history (context):\n${context}\n\n` +
            `Latest message: ${lastMessage}\n\n` +
            `Messages are compact JSON: id=author ID, mid=messageId, u=username, n=display name, t=ISO 8601 timestamp, x=message content, r=replied message; r uses the same fields. Fields may be missing; r=null means no reply. Use x as the current message and r.x as quoted context.\n` +
            `You may react to messages using this action. Choose an emoji yourself based on the conversation.\n` +
            `Output each action as one JSON object on its own line, after your normal response.\n` +
            `Use this format: {"action":"react","meta":{"messageId":"1234567891234","emoji":"😭"}} message id SHOULD be a valid message id and the emoji SHOULD always be a unicode emoji\n` +
            `Only react when necessary and not everytime\n` +
            `Reply naturally, add exactly %tts% at the end of your message if you want to send a voice message (only if asked, you can send voice messages), if asked to send a voice message always add %tts%.`
        }
      ],
      max_tokens: this.ephemeralAiProvider.maxTokens,
      temperature: 0.6
    };

    const fetchOptions = {
      method: "POST",
      headers: {
        ...(this.ephemeralAiProvider.authorization && { Authorization: `Bearer ${this.ephemeralAiProvider.authorization}` }),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60_000),
    };

    if (!this.ephemeralAiProvider.isCustom) {
      return fetch(this.ephemeralAiProvider.url, fetchOptions);
    }

    try {
      const response = await fetch(this.ephemeralAiProvider.url, fetchOptions);

      if (response.ok) return response;

      console.warn('Failed to fetch from custom url, resetting back to default and reattempting');
      this.resetEphemeralAiProvider();
      return this.fetchAiCompletion(systemPrompt, context, lastMessage);
    } catch (error) {
      if (error.name === 'TimeoutError') {
        console.warn('Custom url timed out, resetting back to default and reattempting');
        this.resetEphemeralAiProvider();
        return this.fetchAiCompletion(systemPrompt, context, lastMessage);
      }
      throw error;
    }
  },

  async buildMessage(m, msgsById, knownAs, maxLen) {
    const getData = (msg, useAlias = true) => {
      const author = msg.author ?? {};
      const id = author.id ?? "";
      const isOwn = msg.client?.user && id === msg.client.user.id;
      const alias = useAlias ? knownAs.get(id) : "";

      const name = isOwn
        ? msg.client.user.username
        : alias && alias !== "none"
          ? alias
          : msg.member?.displayName || author.username || "";

      const cached = isOwn ? getTts(msg.id) : null;
      const text = truncateByChars(
        formatMentionsInContent(cached ?? msg.content ?? "", msg),
        maxLen
      );

      return {
        id,
        mid: msg.id,
        ...(author.username ? { u: author.username } : {}),
        ...(name ? { n: name } : {}),
        ...(msg.createdTimestamp
          ? { t: new Date(msg.createdTimestamp).toISOString() }
          : {}),
        ...(text ? { x: text } : {})
      };
    };

    const result = getData(m);
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

      result.r = ref ? getData(ref, false) : null;
    }

    return JSON.stringify(result);
  },

  async execute(message) {
    let interval;
    let retryCount = 0;

    const executeWithRetry = async () => {
      try {
        if (interval) clearInterval(interval);
        
        const mentioned = message.mentions.has(message.client.user);
        const includesWhisper = message.content.toLowerCase().includes("whisper");
        if (!mentioned && !includesWhisper) return;
        
        const users = await Settings.get(message.client.db, null, "whitelistedUsers");
        if (message.author.bot && !users.includes(message.author.id)) return;
        
        const channels = await Settings.get(message.client.db, null, "whitelistedChannels");
        const roles = await Settings.get(message.client.db, null, "whitelistedRoles");
        if (!channels.includes(message.channel.id)) return;

        const member = message.guild?.members?.cache?.get(message.author.id) ||
          (await message.guild?.members?.fetch(message.author.id).catch(() => null));
        const allowed = !!member?.roles?.cache?.some(r => roles.includes(r.id));
        if (!allowed && !users.includes(message.author.id)) return;

        message.channel.sendTyping().catch(() => {});
        interval = setInterval(() => message.channel.sendTyping().catch(() => {}), 3500);

        const maxCtx = await Settings.get(message.client.db, null, "maxContextMessages");
        const maxLen = await Settings.get(message.client.db, null, "maxMessageLength");

        const fetched = await message.channel.messages.fetch({ limit: maxCtx });
        const msgs = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const msgsById = new Map(msgs.map(m => [m.id, m]));

        const uniqueIds = [...new Set(msgs.map(m => m.author?.id).filter(Boolean))];
        const knownAs = new Map();
        if (uniqueIds.length) {
          const aliases = await Promise.all(uniqueIds.map(id => Settings.get(message.client.db, id, "knownAs").catch(() => "")));
          uniqueIds.forEach((id, i) => knownAs.set(id, aliases[i] ?? ""));
        }

        const parts = [];
        for (const m of msgs) {
          parts.push(await this.buildMessage(m, msgsById, knownAs, maxLen, message.client));
        }
        const context = parts.join("\n");

        const systemPrompt = await message.client.db.get("systemPrompt");
        const last = msgs[msgs.length - 1];
        const lastCached = last?.author?.id && last.author.id === message.client.user?.id ? getTts(last.id) : null;
        const lastSource = lastCached ?? (last?.content ?? "");
        const lastContent = truncateByChars(formatMentionsInContent(lastSource, last), maxLen);

        const response = await this.fetchAiCompletion(systemPrompt, context, lastContent);

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`Request failed: ${response.status} ${text}`.trim());
        }

        const data = await response.json();
        const rawAnswer = (data.choices?.[0]?.message?.content || "").trim() || "I couldn't generate a response.";
        const { text: answer, actions } = this.extractActions(rawAnswer);

        await this.executeActions(actions, message);

        if (!answer) return;

        if (answer.includes("%tts%")) {
          const client = new ElevenLabsClient({ apiKey: config.tts.token });
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
        retryCount++;

        if (retryCount <= maxRetries) {
          try {
            const errorMsg = await message.reply(
              "An error occurred while processing the response, retrying...\n-# This message will be deleted after 5 seconds"
            );
            setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            await executeWithRetry();
          } catch (retryErr) {
            console.error("Error during retry:", retryErr);
            if (!message.author.bot) {
              await message.reply("An error occurred while generating the response.").catch(() => {});
            }
          }
        } else {
          if (!message.author.bot) {
            await message.reply("An error occurred while generating the response.").catch(() => {});
          }
        }
      } finally {
        if (interval) clearInterval(interval);
      }
    };

    await executeWithRetry();
  }
};
