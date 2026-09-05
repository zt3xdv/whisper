import { Routes, ApplicationCommandManager, Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { getFilesFromDir, getArgs } from "./utils/utils.js";
import { JSONDriver } from "quick.db/out/drivers/JSONDriver.js";
import { QuickDB } from "quick.db";
import config from "../config.json" with { type: "json" };
import path from "node:path";

process.on("unexpectedException", console.error);
process.on("unhandledRejection", console.error);

const args = getArgs();
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
client.commands = new Collection();
client.events = {};
client.db = new QuickDB({
  driver: new JSONDriver(path.join(import.meta.dirname, "..", "database.qdb"))
});
client.rest.setToken(config.token); // As client only sets token after login

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

if (args.deploy) {
  const res = await client.rest.put(Routes.applicationCommands(config.clientId), {
    body: client.commands.map(c => ApplicationCommandManager.transformCommand(c))
  });
  
  console.log("Registered " + res.length + " commands");
}

client.login(config.token);
