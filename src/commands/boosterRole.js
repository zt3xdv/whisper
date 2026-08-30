import { MessageFlags, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonStyle } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { isStaff } from "../utils/staff.js";

const activeProcesses = new Set();

export default {
  name: "booster-role",
  description: "Manage your custom booster role",

  async execute(interaction) {
    const { member, guild, client, user } = interaction;

    if (!member.premiumSince && !isStaff(member)) {
      return interaction.reply({ 
        content: `${emojis.exclamation} Server Boost required`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    const getPayload = async (isDisabled = false) => {
      const roleId = await client.db.get(`br_${guild.id}_${user.id}`);
      const role = roleId ? guild.roles.cache.get(roleId) : null;

      return {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `-# ${emojis.person} **Booster Role**\n\n${role ? `Active as <@&${role.id}>` : "No role created, press **Create Role** to create it!"}`
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  { 
                    type: ComponentType.Button, 
                    customId: "setup", 
                    label: role ? "Edit Role" : "Create Role", 
                    style: ButtonStyle.Secondary,
                    disabled: isDisabled 
                  },
                  ...(role ? [{ 
                    type: ComponentType.Button, 
                    customId: "delete", 
                    label: "Delete Role", 
                    style: ButtonStyle.Danger,
                    disabled: isDisabled 
                  }] : [])
                ]
              }
            ]
          },
        ],
        flags: MessageFlags.IsComponentsV2
      };
    };

    const response = await interaction.reply(await getPayload());
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== user.id) return;
      if (activeProcesses.has(user.id)) {
        return i.reply({ content: `${emojis.exclamation} Please wait for the current action to finish.`, flags: MessageFlags.Ephemeral });
      }

      collector.resetTimer();

      if (i.customId === "delete") {
        activeProcesses.add(user.id);
        try {
          const roleId = await client.db.get(`br_${guild.id}_${user.id}`);
          const role = roleId ? guild.roles.cache.get(roleId) : null;
          if (role) await role.delete().catch(() => {});
          await client.db.delete(`br_${guild.id}_${user.id}`);
          await interaction.editReply(await getPayload());
          return i.reply({ content: `${emojis.correct} Role deleted successfully`, flags: MessageFlags.Ephemeral });
        } finally {
          activeProcesses.delete(user.id);
        }
      }

      const roleId = await client.db.get(`br_${guild.id}_${user.id}`);
      const role = roleId ? guild.roles.cache.get(roleId) : null;

      const modal = new ModalBuilder()
        .setCustomId(`m_br_${Date.now()}`)
        .setTitle('Booster Role Settings')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Name').setValue(role?.name || "").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pc').setLabel('Primary Color').setPlaceholder('#ffffff').setValue(role?.hexColor || "").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sc').setLabel('Secondary Color (optional)').setPlaceholder('#ffffff').setStyle(TextInputStyle.Short).setRequired(false))
        );

      await i.showModal(modal);

      try {
        const submitted = await i.awaitModalSubmit({ time: 120000 });
        
        if (activeProcesses.has(user.id)) {
          return submitted.reply({ content: `${emojis.exclamation} Please wait for the current action to finish.`, flags: MessageFlags.Ephemeral });
        }

        activeProcesses.add(user.id);
        await interaction.editReply(await getPayload(true));

        const name = submitted.fields.getTextInputValue('n');
        const primaryColor = submitted.fields.getTextInputValue('pc');
        const secondaryColor = submitted.fields.getTextInputValue('sc');
        const colorRegex = /^#([0-9A-F]{3}){1,2}$/i;

        if (!colorRegex.test(primaryColor) || (secondaryColor && !colorRegex.test(secondaryColor))) {
          activeProcesses.delete(user.id);
          await interaction.editReply(await getPayload(false));
          return submitted.reply({ content: `${emojis.exclamation} Invalid Hex color format`, flags: MessageFlags.Ephemeral });
        }
        
        const colors = { primaryColor, secondaryColor: secondaryColor || undefined };
        const currentRoleId = await client.db.get(`br_${guild.id}_${user.id}`);
        let currentRole = currentRoleId ? guild.roles.cache.get(currentRoleId) : null;

        if (!currentRole) {
          const newRole = await guild.roles.create({
            name,
            colors,
            position: guild.members.me.roles.highest.position - 1,
            reason: `Booster: ${user.tag}`
          });
          await member.roles.add(newRole);
          await client.db.set(`br_${guild.id}_${user.id}`, newRole.id);
        } else {
          await currentRole.edit({ name, colors });
        }

        await submitted.reply({ content: `${emojis.correct} Your booster role has been updated!`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        if (err.code !== 'InteractionCollectorError') console.error(err);
      } finally {
        activeProcesses.delete(user.id);
        await interaction.editReply(await getPayload(false)).catch(() => {});
      }
    });
  }
};
