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

    let currentPage = 0;

    const getPayload = () => {
      return {
        components: buildAuditLogComponents(currentPage, itemsPerPage, logs, totalPages),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      };
    };

    const response = await interaction.reply(await getPayload());
    const collector = response.createMessageComponentCollector({ time: 120_000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) return;

      collector.resetTimer();

      if (i.customId.startsWith("auditlog_prev")) {
        if (currentPage > 0) currentPage--;
      } else if (i.customId.startsWith("auditlog_next")) {
        if (currentPage < totalPages - 1) currentPage++;
      }

      await i.update(await getPayload());
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time") {
        const disabledPayload = buildAuditLogComponents(currentPage, itemsPerPage, logs, totalPages);
        disabledPayload[0].components[disabledPayload[0].components.length - 1].components.forEach(btn => {
          btn.disabled = true;
        });

        await interaction.editReply({
          components: disabledPayload,
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        }).catch(() => {});
      }
    });
  }
};
