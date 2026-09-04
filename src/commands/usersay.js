import { MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { readFileSync } from 'node:fs';

const permittedUsers = new Set(['1545475466046083082', '1203255977437044750']);
// Utilises the profanity list found in minecraft bedrock because yes
const profanity = Buffer.from(readFileSync('./utils/profanity'), 'base64').toString('utf8').split('\n').map(word => word.toLowerCase());

export default {
  name: "usersay",
  description: "Make the bot say something",
  options: [
    {
      name: "text",
      description: "Text to send",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  async execute(interaction) {
    if (!permittedUsers.has(interaction.user.id)) {
      return interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.wrong} You do not have permission to use this command.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }

    const text = interaction.options.getString("text", true);
    const lowerCaseText = text.toLowerCase();
    if (profanity.some(word => lowerCaseText.includes(word))) {
      return interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.wrong} You're not allowed to send that. Profanity is blocked with whisper.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }

    interaction.channel.send({ content: `${interaction.user.username}: ${text}`, allowedMentions: { parse: 'users' } });

    interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emojis.correct} Message sent!`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  },
};
