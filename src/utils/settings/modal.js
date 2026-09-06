import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";

export function createEditModal(modalCustomId, setting, currentValue) {
  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Edit ${setting.name}`.slice(0, 45));

  const components = [];

  switch (setting.type) {
    case "number": {
      const input = new TextInputBuilder()
        .setCustomId("new_value")
        .setLabel("New value (Number)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(String(setting.defaultValue ?? ""))
        .setRequired(setting.required)
        .setValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : "");
      components.push(new ActionRowBuilder().addComponents(input));
      break;
    }

    case "string": {
      if (!setting.enum) {
        const input = new TextInputBuilder()
          .setCustomId("new_value")
          .setLabel("New value")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(String(setting.defaultValue ?? ""))
          .setRequired(setting.required)
          .setValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : "");
        if (typeof setting.min === "number") input.setMinLength(setting.min);
        if (typeof setting.max === "number") input.setMaxLength(setting.max);
        components.push(new ActionRowBuilder().addComponents(input));
      }
      break;
    }
  }

  if (components.length > 0) modal.addComponents(...components);
  return modal;
}
