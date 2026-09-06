import { MessageFlags, ComponentType } from "discord.js";
import { buildAuditLogComponents } from "../utils/auditLogs/renderComponents.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "auditlogs",
  description: "View server audit logs",
  permissions: ["staff"],
  
  async execute(interaction) {
    const itemsPerPage = 5;
    
    const logs = (await interaction.client.db.get(`auditlogs_${interaction.guildId}`)) || []
    const totalPages = Math.ceil(logs.length / itemsPerPage);
    
    if (logs.length === 0) {
      return interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.exclamation} There are not any audit logs`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }
    
    const components = buildAuditLogComponents(0, itemsPerPage, logs, totalPages);
    
    await interaction.reply({
      components: components.components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
  }
};
