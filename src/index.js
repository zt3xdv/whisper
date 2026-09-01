import { APIVersion, REST, Routes, ApplicationCommandManager, Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { getFilesFromDir } from "./utils/file.js";
import { JSONDriver } from "quick.db/out/drivers/JSONDriver.js";
import { QuickDB } from "quick.db";
import config from "../config.json" with { type: "json" };
import path from "node:path";
import { parseArgs } from "node:util";

process.on("unexpectedException", console.error);
process.on("unhandledRejection", console.error);

const { values, _ } = parseArgs({
  options: {
    deploy: { type: 'string', short: 'd' },
    bot: { type: 'string', short: 'b' }
  },
  allowPositionals: true
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel
  ]
});
client.rest = new REST({
  version: APIVersion
});
client.commands = new Collection();
client.events = {};
client.db = new QuickDB({
  driver: new JSONDriver(path.join(import.meta.dirname, "..", "database.qdb"))
});

for (const file of getFilesFromDir(path.join(import.meta.dirname, "commands"))) {
  const { default: command } = await import(`file://${file}`);
  if (command?.name && typeof command.execute === "function") {
    client.commands.set(command.name, command);
  }
}

for (const file of getFilesFromDir(path.join(import.meta.dirname, "events"))) {
  const { default: event } = await import(`file://${file}`);
  if (event?.id && event.name && typeof event.execute === "function") {
    client.events[event.id] = event;
    const handler = (...args) => client.events[event.id].execute(...args);
    event.once ? client.once(event.name, handler) : client.on(event.name, handler);
  }
}

if (values.deploy) {
  const deployCommands = client.commands.map(c => ApplicationCommandManager.transformCommand(c)));
  await rest.put(Routes.applicationCommands(config.clientId), { body: deployCommanda });
  
  if (!values.bot) {
    process.exit();
  }
}
client.login(config.token);
