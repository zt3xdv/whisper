import { MessageFlags, ComponentType, ChannelType, PermissionsBitField, ApplicationCommandOptionType } from "discord.js";
import { isStaff } from "../utils/staff.js";

export default {
  name: "unlock",
  description: "Unlocks a channel",
  options: [
    {
      name: 'channel',
      description: 'Channel to unlock or leave blank for the current channel',
      type: ApplicationCommandOptionType.Channel,
      required: false
    }
  ],

  async execute(interaction) {
    if (!interaction.guild || !isStaff(interaction.member)) {
      return interaction.reply({
        components: [{
          type: ComponentType.Container, components:
            [{ type: ComponentType.TextDisplay, content: 'You do not have permission to use this command.' }],
        }], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (!channel.editable ||
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
            [{ type: ComponentType.TextDisplay, content: 'I cannot lock this channel' }],
        }], flags: MessageFlags.IsComponentsV2,
      });
    }

    if (channel.permissionsFor('1464334628838969456').has(PermissionsBitField.Flags.Speak)) {
      channel.permissionOverwrites.delete('1464334628838969456');
    }

    if (channel.permissionsFor(interaction.guildId).has(PermissionsBitField.Flags.SendMessages)) {
      return interaction.reply({
        components: [{
          type: ComponentType.Container, components:
            [{ type: ComponentType.TextDisplay, content: 'This channel is already unlocked' }],
        }], flags: MessageFlags.IsComponentsV2,
      });
    }

    await interaction.deferReply();

    await channel.permissionOverwrites.edit(interaction.guildId, {
      SendMessages: true,
      SendMessagesInThreads: true,
    });


    interaction.editReply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `Unlocked <#${channel.id}>`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }
};
