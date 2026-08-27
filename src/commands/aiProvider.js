import { MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { isStaff } from "../utils/staff.js";
import { resetEphemeralAiProvider, setEphemeralAiProvider } from '../events/messageCreate.js';

export default {
  name: "aiprovider",
  description: "Change the ephemeral custom AI provider for whisper",
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
  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        components: [{
          type: ComponentType.Container, components:
            [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} You do not have permission to use this command.` }],
        }], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'set') {
      const url = interaction.options.getString('url');
      const model = interaction.options.getString('model');
      const auth = interaction.options.getString('authorization') ?? null;
      const maxTokens = interaction.options.getInteger('maxtokens');

      setEphemeralAiProvider(url, auth, model, maxTokens);

      interaction.reply({ content: 'Changed AI provider. This will reset on restart or failed response', flags: 'Ephemeral' });
    }
    else if (subcommand === 'reset') {
      resetEphemeralAiProvider();
      interaction.reply({ content: 'Reset AI provider to default', flags: 'Ephemeral' });
    }
    else {
      console.error('What....');
      interaction.reply({ content: 'tf did you do dawg', flags: 'Ephemeral' });
    }
  }
};
