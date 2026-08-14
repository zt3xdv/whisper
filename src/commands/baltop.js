import { PermissionFlagsBits, MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import config from "../../config.json" with { type: "json" };

export default {
  name: "baltop",
  description: "Check ServerAPI balance top",

  async execute(interaction) {
    const res = await fetch(`${config.serverApiBaseUrl}/misc/balancetop`, {
      headers: {
        "Authorization": `Bearer ${config.serverApiToken}`
      }
    });
    const data = await res.json();
    const players = Object.keys(data.balances);
    
    const formatedTop = players.map(name => `#${players.indexOf(name) + 1} **${name}**: \$${data.balances[name].toFixed(2)}`).join("\n");

    return await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `-# ${emojis.dollar} Top more **balance**\n\n${formatedTop}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
