import { ComponentType, MessageFlags } from "discord.js";
import { Settings } from "../utils/settings.js";
import { buildComponentsV2 } from "../utils/settings/renderComponents.js";
import { createEditModal } from "../utils/settings/modal.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "settings",
  description: "Manage your settings",

  async execute(interaction) {
    await interaction.deferReply();
    
    const user = interaction.member ?? interaction.user;
    const itemsPerPage = 3;
    let currentPage = 0;
    let lastReply;
    
    const updateMessage = async () => {
      const payload = await buildComponentsV2(interaction.client, user, currentPage, itemsPerPage);
      lastReply = await interaction.editReply(payload);
    };

    await updateMessage();

    const selectCollector = lastReply.createMessageComponentCollector({
      filter: i => i.user.id === user.id && i.isAnySelectMenu(),
      time: 300_000
    });

    selectCollector.on("collect", async menuInt => {
      try {
        const id = menuInt.customId;
        await menuInt.deferUpdate();

        let settingKey = "";
        let newValue;

        if (id.startsWith("enum_")) {
          settingKey = id.substring(5);
          newValue = menuInt.values[0];
        } else if (id.startsWith("select_")) {
          settingKey = id.substring(7);
          newValue = menuInt.values;
        }

        const setting = Settings.settingsDefinitions.find(s => s.key === settingKey);
        if (!setting) return;

        await Settings.put(interaction.client.db, user.id, setting.key, newValue);
        await updateMessage();
      } catch (err) {}
    });

    const buttonCollector = lastReply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300_000,
      filter: i => i.user.id === user.id
    });

    buttonCollector.on("collect", async btnInt => {
      try {
        const id = btnInt.customId;

        if (id === "prev_page") {
          await btnInt.deferUpdate();
          currentPage = Math.max(0, currentPage - 1);
          await updateMessage();
          return;
        }

        if (id === "next_page") {
          await btnInt.deferUpdate();
          currentPage = Math.min(Math.ceil(Settings.settingsDefinitions.length / itemsPerPage) - 1, currentPage + 1);
          await updateMessage();
          return;
        }

        if (id.startsWith("toggle_")) {
          await btnInt.deferUpdate();
          const settingKey = id.substring(7);
          const setting = Settings.settingsDefinitions.find(s => s.key === settingKey);
          if (!setting) return;

          const currentValue = await Settings.get(interaction.client.db, user.id, setting.key);
          const newValue = !Boolean(currentValue);
          await Settings.put(interaction.client.db, user.id, setting.key, newValue);
          await updateMessage();
          return;
        }

        if (id.startsWith("view_")) {
          const settingKey = id.substring(5);
          const setting = Settings.settingsDefinitions.find(s => s.key === settingKey);
          if (!setting) return;

          const currentValue = await Settings.get(interaction.client.db, user.id, setting.key);
          await btnInt.reply({
            content: `-# **${setting.name ?? setting.key}**\n\`\`\`${JSON.stringify(currentValue, null, 2)}\`\`\``,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (id.startsWith("edit_")) {
          const settingKey = id.substring(5);
          const setting = Settings.settingsDefinitions.find(s => s.key === settingKey);
          if (!setting) return;

          const currentValue = await Settings.get(interaction.client.db, user.id, setting.key);
          const modalCustomId = `modal_edit_${settingKey}`;
          const modal = createEditModal(modalCustomId, setting, currentValue);

          if (!modal || !modal.components?.length) {
            // Never going to happen but ig
            await btnInt.reply({ content: `${emojis.exclamation} This setting cannot be edited with a modal.\n-# This is likely a bug, report it to us!`, flags: MessageFlags.Ephemeral });
            return;
          }

          await btnInt.showModal(modal);

          try {
            const modalSubmitInt = await btnInt.awaitModalSubmit({
              filter: i => i.customId === modalCustomId && i.user.id === user.id,
              time: 60_000
            });

            await modalSubmitInt.deferUpdate();
            let rawValue = modalSubmitInt.fields.getTextInputValue("new_value");

            if (setting.type === "number") {
              rawValue = Number(rawValue);
              if (isNaN(rawValue)) return;
            }

            await Settings.put(interaction.client.db, user.id, setting.key, rawValue);
            await updateMessage();
          } catch (err) {}
          return;
        }
      } catch (err) {}
    });

    const cleanup = () => {
      try {
        selectCollector.stop();
        buttonCollector.stop();
      } catch {}
    };
    buttonCollector.on("end", cleanup);
    selectCollector.on("end", cleanup);
  }
};
