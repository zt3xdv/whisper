import { MessageFlags, ComponentType, ChannelType, PermissionsBitField, ApplicationCommandOptionType } from "discord.js";
import { isStaff } from "../utils/staff.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "lock",
  description: "Locks a channel",
  options: [
    {
      name: 'channel',
      description: 'Channel to lock or leave blank for the current channel',
      type: ApplicationCommandOptionType.Channel,
      required: false
    }
  ],
  
  async execute(interaction) {
    if (!interaction.guild || !isStaff(interaction.member)) {
      return interaction.reply({
        components: [{
          type: ComponentType.Container, components:
            [{ type: ComponentType.TextDisplay, content: `${emojis.wrong} You do not have permission to use this command.` }],
        }], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (!channel.permissionsFor(interaction.client.user.id).has(PermissionsBitField.Flags.ManageRoles) ||
      ![
        ChannelType.GuildAnnouncement,
        ChannelType.GuildStageVoice,
        ChannelType.GuildText,
        ChannelType.GuildVoice,
        ChannelType.GuildForum,
        ChannelType.GuildMedia,
      ].includes(channel.type)) {

      return interaction.reply({
        components: [{
          type: ComponentType.Container, components:
            [{ type: ComponentType.TextDisplay, content: `${emojis.exclamation} I cannot lock this channel` }],
        }], flags: MessageFlags.IsComponentsV2,
      });
    }

    if (!channel.permissionsFor(interaction.guildId).has(PermissionsBitField.Flags.SendMessages)) {
      return interaction.reply({
        components: [{
          type: ComponentType.Container, components:
            [{ type: ComponentType.TextDisplay, content: `${emojis.exclamation} This channel is already locked` }],
        }], flags: MessageFlags.IsComponentsV2,
      });
    }

    await interaction.deferReply();

    await channel.permissionOverwrites.edit(interaction.guildId, {
      SendMessages: false,
      SendMessagesInThreads: false,
    });

    await channel.permissionOverwrites.edit('1464334628838969456', {
      SendTTSMessages: true,
    });


    interaction.editReply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emojis.correct} Locked <#${channel.id}>`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }
};
