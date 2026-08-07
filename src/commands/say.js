import { PermissionFlagsBits, MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";

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

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return await interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `You do not have permission to use this command.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }

    const text = interaction.options.getString("text", true);
    await interaction.channel.send({ content: text });
    
    return await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `Message sent!`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  },
};
