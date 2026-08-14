import { PermissionFlagsBits, MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import config from "../../config.json" with { type: "json" };

export default {
  name: "profile",
  description: "Check a ServerAPI Minecraft profile",
  options: [
    {
      name: "username",
      description: "In game username",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  async execute(interaction) {
    const username = interaction.options.getString("username", true);
    const res = await fetch(`${config.serverApiBaseUrl}/player/${username}`, {
      headers: {
        "Authorization": `Bearer ${config.serverApiToken}`
      }
    });
    const data = await res.json();
    
    if (!res.ok) {
      return await interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.exclamation} This player was not found, did you type the username correctly?`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });
    }
    
    return await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.Section,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# ${emojis.pings} **${data.name}**'s profile`,
                },
              ],
              accessory: {
                type: ComponentType.Thumbnail,
                media: {
                  url: `https://render.crafty.gg/3d/bust/${data.name.toLowerCase()}?width=300&height=360&x=-30&z=50`
                },
              },
            },
            {
              type: ComponentType.TextDisplay,
              content: `**Kills**: ${data.kills} (${data.mobKills} mobs, ${data.playerKills} players)\n**Deaths**: ${data.deaths}\n\n**Balance**: ${data.money}\n**Playtime**: ${data.playtime}\n**Last seen**: ${data.lastSeen} (${data.online ? "Online" : "Offline"})`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
