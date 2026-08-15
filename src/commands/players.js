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
    
    const playerList = data.players.map(player => player.name).join(",");

    return await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `-# ${emojis.person} Online **players**\n\n${playerList}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
