import { MessageFlags, ComponentType } from "discord.js";
import { Events } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  id: "interactionCreate",
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    
    try {
      if (command.staff && !isStaff(interaction.member)) {
        return await interaction.reply({
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emojis.exclamation} This command is staff only, you cannot run it`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
      await command.execute(interaction);
    } catch (e) {
      console.error(e);
    }
  }
};
