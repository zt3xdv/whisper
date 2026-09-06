import { MessageFlags, ComponentType } from "discord.js";
import { buildAuditLogComponents } from "../utils/auditLogs/renderComponents.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "auditlogs",
  description: "View server audit logs",
  permissions: ["staff"],
  
  async execute(interaction) {
    const itemsPerPage = 5;
    
    const logs = ((await interaction.client.db.get(`auditlogs_${interaction.guildId}`)) || []).reverse();
    const totalPages = Math.ceil(logs.length / itemsPerPage);
    
    if (logs.length === 0) {
      return interaction.reply({
        content: `${emojis.exclamation} No audit logs available`,
        flags: MessageFlags.Ephemeral
      });
    }
    
    const components = buildAuditLogComponents(0, itemsPerPage, logs, totalPages);
    
    await interaction.reply({
      components: components.components,
      flags: MessageFlags.IsComponentsV2
    });
  }
};
