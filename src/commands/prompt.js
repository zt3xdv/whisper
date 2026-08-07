import { MessageFlags, ComponentType } from "discord.js";
import { isStaff } from "../utils/staff.js";

export default {
  name: "prompt",
  description: "Set the system prompt used by the AI responder",
  options: [
    {
      name: "prompt",
      description: "The new system prompt",
      type: 3,
      required: true,
    },
  ],

  async execute(interaction) {
    if (!interaction.guild || !isStaff(interaction.member)) {
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

    const prompt = interaction.options.getString("prompt", true);

    try {
      await interaction.client.db.set("systemPrompt", prompt);

      return await interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `System prompt updated successfully.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error("Failed to set system prompt:", err);
      return await interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `Failed to update system prompt.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }
  },
};
