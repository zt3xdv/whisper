import { PermissionFlagsBits, MessageFlags, ComponentType, ApplicationCommandOptionType } from "discord.js";
import { emojis } from "../utils/emojis.js";

export default {
  name: "send",
  description: "Post discord.builders components",
  options: [
    {
      name: "url",
      description: "A URL from https://discord.builders or the fragment after the #",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: "channel",
      description: "Channel to send into",
      type: ApplicationCommandOptionType.Channel,
      required: false,
    },
  ],

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return await interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.wrong} You do not have permission to use this command.`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    const urlOrFragment = interaction.options.getString("url", true)?.trim();
    const targetChannel = interaction.options.getChannel("channel");

    if (String(urlOrFragment).includes("://")) {
      try {
        const parsedUrl = new URL(urlOrFragment);
        if (!parsedUrl.hostname.toLowerCase().includes("discord.builders")) {
          return await interaction.reply({
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `${emojis.exclamation} The URL must be from https://discord.builders`,
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }
      } catch (err) {
        return await interaction.reply({
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emojis.exclamation} Invalid URL provided`,
                },
              ],
            },
          ],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
    }

    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

    let parsed = null;
    try {
      const fragment = String(urlOrFragment).includes("#") ? String(urlOrFragment).split("#")[1] : String(urlOrFragment);
      if (fragment) {
        const dataPart = fragment.includes("$") ? fragment.split("$", 2)[1] : fragment;
        let bytes;
        if (typeof atob === "function") {
          const bin = atob(dataPart);
          bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        } else {
          bytes = Buffer.from(dataPart, "base64");
        }
        if (typeof DecompressionStream === "function") {
          const cs = new DecompressionStream("gzip");
          const writer = cs.writable.getWriter();
          writer.write(bytes);
          writer.close();
          const state = await new Response(cs.readable).text();
          parsed = JSON.parse(state);
        } else if (typeof process !== "undefined" && process.versions && process.versions.node) {
          const zlib = await import("zlib");
          const res = await zlib.promises.gunzip(Buffer.from(bytes));
          parsed = JSON.parse(res.toString("utf8"));
        }
      }
    } catch (e) {
      console.error("Failed to decode compressed state from URL", e);
      parsed = null;
    }

    const sendTarget = targetChannel ?? interaction.channel;
    if (!sendTarget || typeof sendTarget.send !== "function") {
      return interaction.editReply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.wrong} I cant send messages to that channel`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    try {
      await sendTarget.send({ components: parsed, flags: MessageFlags.IsComponentsV2, });
    } catch (err) {
      return interaction.editReply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emojis.wrong} Failed to send decoded components: ${err.message}`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    return interaction.editReply({
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emojis.correct} Message posted!`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};