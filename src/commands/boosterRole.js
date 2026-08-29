import { MessageFlags, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonStyle } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { isStaff } from "../utils/staff.js";

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

    const getPayload = async () => {
      const roleId = await client.db.get(`br_${guild.id}_${user.id}`);
      const role = roleId ? guild.roles.cache.get(roleId) : null;

      return {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `-# ${emojis.person} **Booster Role**\n-# ${role ? `Active as <@&${role.id}>` : "No role created"}`
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  { type: ComponentType.Button, customId: "setup", label: role ? "Edit Role" : "Create Role", style: ButtonStyle.Secondary },
                  ...(role ? [{ type: ComponentType.Button, customId: "delete", label: "Delete Role", style: ButtonStyle.Danger }] : [])
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
      collector.resetTimer();

      const roleId = await client.db.get(`br_${guild.id}_${user.id}`);
      let role = roleId ? guild.roles.cache.get(roleId) : null;

      if (i.customId === "delete") {
        if (role) await role.delete().catch(() => {});
        await client.db.delete(`br_${guild.id}_${user.id}`);
        
        await interaction.editReply(await getPayload());
        return i.reply({ content: `${emojis.correct} Role deleted successfully`, flags: MessageFlags.Ephemeral });
      }

      const modal = new ModalBuilder()
        .setCustomId('m_br')
        .setTitle('Booster Role Settings')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('Name').setValue(role?.name || "").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pc').setLabel('Primary Color').setPlaceholder('#ffffff').setValue("").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sc').setLabel('Secondary Color (optional)').setPlaceholder('#ffffff').setValue("").setStyle(TextInputStyle.Short).setRequired(false))
        );

      await i.showModal(modal);

      try {
        const submitted = await i.awaitModalSubmit({ time: 120000 });
        const name = submitted.fields.getTextInputValue('n');
        const primaryColor = submitted.fields.getTextInputValue('pc');
        const secondaryColor = submitted.fields.getTextInputValue('sc');
        const colorRegex = /^#([0-9A-F]{3}){1,2}$/i;

        if (!colorRegex.test(primaryColor) || (secondaryColor && !colorRegex.test(secondaryColor))) {
          return submitted.reply({ content: `${emojis.exclamation} Invalid Hex color format`, flags: MessageFlags.Ephemeral });
        }

        if (!role) {
          const newRole = await guild.roles.create({
            name,
            colors: { primaryColor, secondaryColor: secondaryColor || undefined },
            position: guild.members.me.roles.highest.position - 1,
            reason: `Booster: ${user.tag}`
          });
          await member.roles.add(newRole);
          await client.db.set(`br_${guild.id}_${user.id}`, newRole.id);
        } else {
          await role.edit({ name, colors: { primaryColor, secondaryColor } });
        }

        await interaction.editReply(await getPayload());
        await submitted.reply({ content: `${emojis.correct} Your booster role has been updated!`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        if (err.code !== 'InteractionCollectorError') console.error(err);
      }
    });
  }
};
