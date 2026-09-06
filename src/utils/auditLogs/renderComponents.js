import { MessageFlags, ComponentType, ButtonStyle, SeparatorSpacingSize } from "discord.js";
import { emojis } from "../emojis.js";

export function buildAuditLogComponents(currentPage, itemsPerPage, logs, totalPages) {
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  const startIndex = currentPage * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, sortedLogs.length);
  const currentLogs = sortedLogs.slice(startIndex, endIndex);
  
  const container = {
    type: ComponentType.Container,
    components: [
      {
        type: ComponentType.TextDisplay,
        content: `-# ${emojis.list} **Audit Logs**`
      }
    ]
  };

  for (const log of currentLogs) {
    const timestamp = new Date(log.timestamp).toLocaleString('en-US');
    
    container.components.push({
      type: ComponentType.TextDisplay,
      content: `**${log.author}** • ${timestamp}\n${log.description}`
    });
    
    if (currentLogs.indexOf(log) !== currentLogs.length - 1) {
      container.components.push({
        type: ComponentType.Separator,
        spacing: SeparatorSpacingSize.Large
      });
    }
  }

  container.components.push({
    type: ComponentType.Separator,
    spacing: SeparatorSpacingSize.Large
  });

  container.components.push({
    type: ComponentType.TextDisplay,
    content: `-# Page **${currentPage + 1}** of **${totalPages}** • **${logs.length}** logs`
  });

  container.components.push({
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        custom_id: `auditlog_prev_${currentPage}`,
        emoji: emojis.left,
        style: ButtonStyle.Secondary,
        disabled: currentPage === 0
      },
      {
        type: ComponentType.Button,
        custom_id: `auditlog_next_${currentPage}`,
        emoji: emojis.right,
        style: ButtonStyle.Secondary,
        disabled: endIndex >= sortedLogs.length
      }
    ]
  });

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}
