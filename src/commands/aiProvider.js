import { MessageFlags, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "ai-provider",
  description: "Change the ephemeral custom AI provider for Whisper",
  options: [
    {
      name: 'set',
      description: 'Set the provider',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "url",
          description: "URL to the provider",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: "model",
          description: "Model to use",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: "authorization",
          description: "Authorization token to authenticate with the provider if needed",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: "maxtokens",
          description: "Maximum amount of tokens to use in each request, defaults to 512",
          type: ApplicationCommandOptionType.Integer,
          required: false,
        },
      ]
    },
    {
      name: 'reset',
      description: 'Reset to default',
      type: ApplicationCommandOptionType.Subcommand,
    }
  ],
  permissions: ["staff"],
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'set') {
      const url = interaction.options.getString('url');
      const model = interaction.options.getString('model');
      const auth = interaction.options.getString('authorization') ?? null;
      const maxTokens = interaction.options.getInteger('maxtokens');

      // client.events.eventId is the event default export
      interaction.client.events.messageCreate.setEphemeralAiProvider(url, auth, model, maxTokens);
      interaction.reply({
        content: `${emojis.correct} Changed AI provider. This will reset on restart or failed response`,
        flags: MessageFlags.Ephemeral
      });
    } else if (subcommand === 'reset') {
      interaction.client.events.messageCreate.resetEphemeralAiProvider();
      interaction.reply({
        content: `${emojis.correct} Reseted AI provider to default`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
