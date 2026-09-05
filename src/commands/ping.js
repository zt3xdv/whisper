import { MessageFlags, ComponentType } from "discord.js";
import { emojis } from "../utils/emojis.js";
import { getRestLatency } from "../utils/utils.js";

export default {
  name: "ping",
  description: "Pong!",
  
  async execute(interaction) {
    const { roundtrip: rest } = await getRestLatency();
    
    await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emojis.pings} **Pong!**\n-# Websocket **${interaction.client.ws.ping}ms** • Rest **${rest}ms**`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }
};
