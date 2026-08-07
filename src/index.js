import config from "../config.json" with { type: "json" };
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { getFilesFromDir } from "./utils/file.js";
import path from "path";
import { JSONDriver } from "quick.db/out/drivers/JSONDriver.js";
import { QuickDB } from "quick.db";

process.on("unexpectedException", console.error);
process.on("unhandledRejection", console.error);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});
client.commands = new Collection();

const db = new QuickDB({ driver: new JSONDriver(path.join(import.meta.dirname, "..", "database.qdb")) });
client.db = db;

for (const file of getFilesFromDir(path.join(import.meta.dirname, "commands"))) {
  const m = await import(`file://${file}`),
        command = m.default ?? m;
  if (command?.name && typeof command.execute === "function") client.commands.set(command.name, command);
}

for (const file of getFilesFromDir(path.join(import.meta.dirname, "events"))) {
  const m = await import(`file://${file}`),
        event = m.default ?? m;
  if (event?.name && typeof event.execute === "function") (event.once ? client.once.bind(client) : client.on.bind(client))(event.name, (...a) => event.execute(...a));
}

client.login(config.token);
