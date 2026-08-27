import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };
import { staffRoleIds } from "../utils/staff.js";
import { Settings } from "../utils/settings.js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import * as Utils from "../utils/utils.js";

const allowedUsers = new Set(["1489362526880796903"]);

export default {
  name: Events.MessageCreate,

  setEphemeralAiProvider(url, authorization, model, maxTokens) {
    Utils.ephemeralAiProvider.url = url;
    Utils.ephemeralAiProvider.authorization = authorization && authorization !== '' ? authorization : null;
    Utils.ephemeralAiProvider.model = model;
    Utils.ephemeralAiProvider.maxTokens = maxTokens ?? 512;
    Utils.ephemeralAiProvider.isCustom = true;
  },

  resetEphemeralAiProvider() {
    Utils.ephemeralAiProvider.url = 'https://integrate.api.nvidia.com/v1/chat/completions';
    Utils.ephemeralAiProvider.authorization = config.nvidiaApiKey;
    Utils.ephemeralAiProvider.model = 'deepseek-ai/deepseek-v4-flash-0731';
    Utils.ephemeralAiProvider.maxTokens = 512;
    Utils.ephemeralAiProvider.isCustom = false;
  },

  async execute(message) {
    if (!Utils.ephemeralAiProvider.url) this.resetEphemeralAiProvider();
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

      const parts = [];
      for (const m of msgs) parts.push(await Utils.buildXml(m, knownAs, maxLen, msgsById));
      const contextXml = parts.join("\n");

      const systemPrompt = await message.client.db.get("systemPrompt");
      const last = msgs[msgs.length - 1];
      let lastRaw = last?.content ?? "";
      if (last?.author?.id && last.author.id === message.client.user?.id) {
        const lastCached = await Utils.getTtsFromDb(message.client.db, last.id);
        if (lastCached) lastRaw = lastCached;
      }
      const lastContent = Utils.truncateByChars(Utils.formatMentionsInContent(lastRaw, last), maxLen);

      let response = await Utils.fetchAiCompletion(systemPrompt, contextXml, Utils.escapeXml(lastContent));

      if (response.fallback) {
        this.resetEphemeralAiProvider();
        response = await Utils.fetchAiCompletion(systemPrompt, contextXml, Utils.escapeXml(lastContent));
      }

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
        const replyMsg = await message.reply({
          attachments: [
            {
              id: 0,
              filename: "tts.opus",
              waveform: Utils.getRandomWaveform(),
              duration_secs: 10,
            },
          ],
          files: [
            {
              attachment: buffer,
              name: "tts.opus"
            }
          ] 
        });
        await Utils.setTtsInDb(message.client.db, replyMsg.id, ttsText);
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
