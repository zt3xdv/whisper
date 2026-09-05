import { MessageFlags, ComponentType } from "discord.js";
import { Events } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { checkPermission } from "../utils/permissions.js";

export default {
  id: "interactionCreate",
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    
    try {
      if (command.permissions) {
        const hasPermission = command.permissions.some(permission => 
          checkPermission(interaction.member, permission)
        );

        if (!hasPermission) {
          return await interaction.reply({
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `${emojis.exclamation} You don't have permission to run this command`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          });
        }
      }

      await command.execute(interaction);
    } catch (e) {
      console.error(e);
    }
  }
};
