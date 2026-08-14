import { PermissionFlagsBits, MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import config from "../../config.json" with { type: "json" };

export default {
  name: "statistics",
  description: "Check ServerAPI statistics",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "type",
      description: "Type of statistics to view",
      choices: [
        {
          name: "Deaths",
          value: "top_deaths",
        },
        {
          name: "Kills",
          value: "top_kills",
        },
      ],
      required: true,
    },
  ],
  
  async execute(interaction) {
    const type = interaction.options.getString("type", true);
    const res = await fetch(`${config.serverApiBaseUrl}/misc/statistics`, {
      headers: {
        "Authorization": `Bearer ${config.serverApiToken}`
      }
    });
    const data = await res.json();
    const players = Object.keys(data[type]);
    
    const formatedTop = players.map(name => `#${players.indexOf(name) + 1} **${name}**: \$${data[type][name].toFixed(2)}`).join("\n");

    return await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `-# ${emojis.dollar} Top **${type.replace("top_", "")}**\n\n${formatedTop}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
