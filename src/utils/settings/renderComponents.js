import { ComponentType, ButtonStyle, MessageFlags, SeparatorSpacingSize } from "discord.js";
import { Settings } from "../settings.js";
import { checkPermission } from "../permissions.js";
import { emojis } from "../emojis.js"

export async function buildComponentsV2(client, user, currentPage, itemsPerPage) {
  const startIndex = currentPage * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, Settings.settingsDefinitions.length);
  const userSettings = Settings.settingsDefinitions.filter(setting => !setting.global || checkPermission(user, "staff"));
  const currentSettings = userSettings.slice(startIndex, endIndex);
  
  const container = {
    type: ComponentType.Container,
    components: [
      {
        type: ComponentType.TextDisplay,
        content: `-# ${emojis.settings} **Settings**`
      },
    ]
  };

  for (const setting of currentSettings) {
    const value = await Settings.get(client.db, user.id, setting.key) ?? null;

    container.components.push({
      type: ComponentType.TextDisplay,
      content: `### ${setting.name ?? setting.key}\n${setting.description}`
    });

    const actionRow = {
      type: ComponentType.ActionRow,
      components: []
    };

    if (setting.type === "bool") {
      actionRow.components.push({
        type: ComponentType.Button,
        custom_id: `toggle_${setting.key}`,
        label: value ? "Enabled" : "Disabled",
        style: value ? ButtonStyle.Success : ButtonStyle.Danger
      });
    } else if (setting.type === "channel") {
      actionRow.components.push({
        type: ComponentType.ChannelSelect,
        custom_id: `select_${setting.key}`,
        placeholder: "Select channels...",
        min_values: 0,
        max_values: 25,
        default_values: Array.isArray(value) ? value.map(id => ({ id, type: 'channel' })) : []
      });
    } else if (setting.type === "role") {
      actionRow.components.push({
        type: ComponentType.RoleSelect,
        custom_id: `select_${setting.key}`,
        placeholder: "Select roles...",
        min_values: 0,
        max_values: 25,
        default_values: Array.isArray(value) ? value.map(id => ({ id, type: 'role' })) : []
      });
    } else if (setting.type === "user") {
      actionRow.components.push({
        type: ComponentType.UserSelect,
        custom_id: `select_${setting.key}`,
        placeholder: "Select users...",
        min_values: 0,
        max_values: 25,
        default_values: Array.isArray(value) ? value.map(id => ({ id, type: 'user' })) : []
      });
    } else if (setting.type === "string" && Array.isArray(setting.enum)) {
      actionRow.components.push({
        type: ComponentType.StringSelect,
        custom_id: `enum_${setting.key}`,
        placeholder: "Change value...",
        options: setting.enum.map(opt => ({
          label: String(opt),
          value: String(opt),
          default: value === opt
        }))
      });
    } else {
      actionRow.components.push(
        {
          type: ComponentType.Button,
          custom_id: `edit_${setting.key}`,
          label: "Edit Value",
          style: ButtonStyle.Secondary
        },
        {
          type: ComponentType.Button,
          custom_id: `view_${setting.key}`,
          label: "View Value",
          style: ButtonStyle.Secondary
        }
      );
    }

    container.components.push(actionRow);
    
    if (currentSettings.indexOf(setting) != currentSettings.length - 1) {
      container.components.push({
        type: ComponentType.Separator,
        spacing: SeparatorSpacingSize.Large
      });
    }
  }

  if (userSettings.length > itemsPerPage) {
    container.components.push({
      type: ComponentType.Separator,
      spacing: SeparatorSpacingSize.Large
    });
    
    container.components.push({
      type: ComponentType.TextDisplay,
      content: `-# Page **${currentPage + 1}** of **${Math.ceil(userSettings.length / itemsPerPage)}**${checkPermission(user, "staff") ? " • including staff global options" : ""}`
    });

    container.components.push({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          custom_id: "prev_page",
          emoji: emojis.left,
          style: ButtonStyle.Secondary,
          disabled: currentPage === 0
        },
        {
          type: ComponentType.Button,
          custom_id: "next_page",
          emoji: emojis.right,
          style: ButtonStyle.Secondary,
          disabled: endIndex >= userSettings.length
        }
      ]
    });
  }
  
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}
