import { MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { isStaff } from "../utils/staff.js";
import config from "../../config.json" with { type: "json" };
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Messy command recoding soon
export default {
  name: "tts",
  description: "Manage ElevenLabs voices",
  options: [
    { name: "create", type: ApplicationCommandOptionType.Subcommand, description: "Create a voice", options: [
      { name: "name", type: ApplicationCommandOptionType.String, description: "Voice display name", required: true },
      { name: "prompt", type: ApplicationCommandOptionType.String, description: "Design prompt", required: true },
    ]},
    { name: "list", type: ApplicationCommandOptionType.Subcommand, description: "List voices" },
    { name: "set", type: ApplicationCommandOptionType.Subcommand, description: "Set primary voice", options: [
      { name: "id", type: ApplicationCommandOptionType.String, description: "Voice id", required: true }
    ]},
    { name: "delete", type: ApplicationCommandOptionType.Subcommand, description: "Delete a voice", options: [
      { name: "id", type: ApplicationCommandOptionType.String, description: "Voice id", required: true }
    ]},
    { name: "send", type: ApplicationCommandOptionType.Subcommand, description: "Send a TTS message", options: [
      { name: "id", type: ApplicationCommandOptionType.String, description: "Voice id", required: false },
      { name: "text", type: ApplicationCommandOptionType.String, description: "Text to speak", required: true },
    ]},
  ],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const db = interaction.client.db;
    const replyCmp = (c, f = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) =>
      interaction.reply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: c }] }], flags: f });
    if (!isStaff(interaction.member)) return replyCmp(`${emojis.wrong} You do not have permission to use this command.`);

    const eleven = new ElevenLabsClient({ apiKey: config.elevenLabsApiKey });

    try {
      if (sub === "create") {
        const name = interaction.options.getString("name", true).slice(0,64);
        const prompt = interaction.options.getString("prompt", true);
        await interaction.deferReply({ ephemeral: true });
        try {
          const existing = await eleven.voices.search();
          const total = (existing.voices || []).length;
          if (total >= 3) return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.exclamation} I can only have up to 3 voices` }] }], flags: MessageFlags.IsComponentsV2 });

          const preview = await eleven.textToVoice.design({ voice_description: prompt, text: "Sample for voice design" });
          const created = await eleven.textToVoice.create({ voice_name: name, generated_voice_id: preview.generated_voice_id });
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.correct} Voice created: **${name}** - id: \`${created.voice_id}\`` }] }], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
          console.error(err);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} Failed to create voice.` }] }], flags: MessageFlags.IsComponentsV2 });
        }
      }

      if (sub === "list") {
        try {
          const res = await eleven.voices.search();
          const voices = res.voices || [];
          if (!voices.length) return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.exclamation} No voices found.` }] }], flags: MessageFlags.IsComponentsV2 });
          const primary = await db.get("tts.primary");
          const lines = voices.map(v => `- **${v.name || v.voice_name || "Unnamed"}** - id: \`${v.voice_id}\`${primary === v.voice_id ? " • primary" : ""}\n  ${String(v.description || "").slice(0,120).replace(/\n/g," ")}${(v.description||"").length>120?"…":""}`);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `-# ${emojis.person} **Voices** (total: ${voices.length})\n\n${lines.join("\n")}` }] }], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
          console.error(err);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} Failed to list voices` }] }], flags: MessageFlags.IsComponentsV2 });
        }
      }

      if (sub === "set") {
        const id = interaction.options.getString("id", true);
        await interaction.deferReply({ ephemeral: true });
        try {
          const res = await eleven.voices.search();
          const found = (res.voices || []).some(v => v.voice_id === id);
          if (!found) return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.exclamation} Voice not found: \`${id}\`` }] }], flags: MessageFlags.IsComponentsV2 });
          await db.set("tts.primary", id);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.correct} Primary voice set to \`${id}\`` }] }], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
          console.error(err);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} Failed to set primary voice.` }] }], flags: MessageFlags.IsComponentsV2 });
        }
      }

      if (sub === "delete") {
        const id = interaction.options.getString("id", true);
        await interaction.deferReply({ ephemeral: true });
        try {
          await eleven.voices.delete(id);
          const primary = await db.get("tts.primary");
          if (primary === id) await db.set("tts.primary", null);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.correct} Deleted voice \`${id}\`` }] }], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
          console.error(err);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} Failed to delete voice \`${id}\`.` }] }], flags: MessageFlags.IsComponentsV2 });
        }
      }

      if (sub === "send") {
        const text = interaction.options.getString("text", true).trim();
        let id = interaction.options.getString("id") ?? await db.get("tts.primary");
        if (!id) return replyCmp(`${emojis.exclamation} No voice selected and no primary set`);
        await interaction.deferReply();
        try {
          const audio = await eleven.textToSpeech.convert(id, { text, languageCode: "en", modelId: "eleven_flash_v2_5", outputFormat: "opus_48000_192" });
          const buffer = Buffer.from(audio.audioBase64, "base64");
          await interaction.editReply({ content: undefined, components: [], flags: MessageFlags.IsComponentsV2, files: [{ attachment: buffer, name: "tts.opus" }] });
          return;
        } catch (err) {
          console.error(err);
          return interaction.editReply({ components: [{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} Failed to generate TTS.` }] }], flags: MessageFlags.IsComponentsV2 });
        }
      }
    } catch (err) {
      console.error(err);
      return replyCmp(`${emojis.wrong} An error occurred`);
    }
  },
};
