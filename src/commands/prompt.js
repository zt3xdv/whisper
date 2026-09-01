import { MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "prompt",
  description: "Set or view the system prompt used by the AI",
  options: [
    {
      name: "prompt",
      description: "The new system prompt",
      type: ApplicationCommandOptionType.String,
      required: false,
    },
  ],
  staff: true,

  async execute(interaction) {
    const prompt = interaction.options.getString("prompt");

    try {
      if (prompt) {
        await interaction.client.db.set("systemPrompt", prompt);

        return await interaction.reply({
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emojis.correct} System prompt updated successfully to\n${prompt}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      } else {
        const systemPrompt = await interaction.client.db.get("systemPrompt");
        
        return await interaction.reply({
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emojis.exclamation} The actual system prompt is\n${systemPrompt}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
    } catch (err) {
      console.error("Failed to set system prompt:", err);
      return await interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.wrong} Failed to update system prompt.`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    }
  },
};
