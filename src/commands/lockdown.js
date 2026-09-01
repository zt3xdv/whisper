import { MessageFlags, ComponentType, ChannelType, PermissionsBitField } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "lockdown",
  description: "Locks all public channels",
  staff: true,
  
  async execute(interaction) {
    // Filter channels to only the ones wanted
    const channels = interaction.guild.channels.cache.filter(channel =>
      channel.permissionsFor(interaction.client.user.id).has(PermissionsBitField.Flags.ManageRoles) &&
            channel.permissionsFor(interaction.guildId).has(PermissionsBitField.Flags.ViewChannel) &&
            channel.permissionsFor(interaction.guildId).has(PermissionsBitField.Flags.SendMessages) &&
            [
              ChannelType.GuildAnnouncement,
              ChannelType.GuildStageVoice,
              ChannelType.GuildText,
              ChannelType.GuildVoice,
              ChannelType.GuildForum,
              ChannelType.GuildMedia,
            ].includes(channel.type),
    );

    if (channels.size === 0) {
      return interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.exclamation} I found no channels to lock`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    await interaction.deferReply();
    const promises = [];

    channels.forEach(async channel => {
      promises.push(channel.permissionOverwrites.edit(interaction.guildId, {
        SendMessages: false,
        SendMessagesInThreads: false,
      }));

      // A random empty role so that unlockdown can tell what channels to unlock when it comes to it
      promises.push(channel.permissionOverwrites.edit('1464334628838969456', {
        SendTTSMessages: true,
      }));
    });

    // Waits for all channel overwrites to apply
    await Promise.all(promises);

    interaction.editReply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emojis.correct} Locked ${channels.size} channel${channels.size === 1 ? '' : 's'}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }
};
