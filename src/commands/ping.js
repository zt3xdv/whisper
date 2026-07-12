import { MessageFlags, ComponentType } from "discord.js";

export default {
  name: "ping",
  description: "Pong!",
  
  async execute(interaction) {
    await interaction.reply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `**Pong!**\n-# Latency: ${interaction.client.ws.ping}ms`
            }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }
};
