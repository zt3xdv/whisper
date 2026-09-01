import { MessageFlags, ComponentType, ChannelType, PermissionsBitField } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "unlockdown",
  description: "Unlocks public channels (that were locked using /lock or /lockdown)",
  staff: true,
  
  async execute(interaction) {
    // Filter channels to only the ones wanted
    const channels = interaction.guild.channels.cache.filter(channel =>
      channel.permissionsFor(interaction.client.user.id).has(PermissionsBitField.Flags.ManageRoles) &&
        channel.permissionsFor('1464334628838969456').has(PermissionsBitField.Flags.SendTTSMessages) &&
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
                content: `${emojis.exclamation} I found no channels to unlock. The unlockdown command is only able to unlock channels that were locked with the /lock command or /lockdown command due to reasons that I cba to say ig`,
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
        SendMessages: true,
        SendMessagesInThreads: true,
      }));

      promises.push(channel.permissionOverwrites.delete('1464334628838969456'));
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
              content: `${emojis.correct} Unlocked ${channels.size} channel${channels.size === 1 ? '' : 's'}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }
};
