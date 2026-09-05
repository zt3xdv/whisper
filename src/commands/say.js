import { MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "say",
  description: "Make the bot say something",
  options: [
    {
      name: "text",
      description: "Text to send",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  permissions: ["staff"],

  async execute(interaction) {
    const text = interaction.options.getString("text", true);
    await interaction.channel.send({ content: text });
    
    return await interaction.reply({
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
