import { PermissionFlagsBits, MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import config from "../../config.json" with { type: "json" };

export default {
  name: "players",
  description: "Show the ServerAPI player list",

  async execute(interaction) {
    const res = await fetch(`${config.serverApiBaseUrl}/players`, {
      headers: {
        "Authorization": `Bearer ${config.serverApiToken}`
      }
    });
    const data = await res.json();
    
    const playerList = data.count >= 1 ? data.players.map(player => player.name).join(",") : "No players online";

    return await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `-# ${emojis.person} **${data.count}** of **${data.max}** Online players\n\n${playerList}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
