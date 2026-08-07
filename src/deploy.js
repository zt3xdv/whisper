import path from "node:path";
import { getFilesFromDir } from "./utils/file.js";
import { REST, Routes, ApplicationCommandManager } from "discord.js";
import config from "../config.json" with { type: "json" };

const commandFiles = getFilesFromDir(path.join(import.meta.dirname, "commands"));
const commands = [];

for (const file of commandFiles) {
  const module = await import(file);
  commands.push(ApplicationCommandManager.transformCommand(module.default ?? module));
}

const rest = new REST({ version: "10" }).setToken(config.token);
const route = Routes.applicationCommands(config.clientId);

await rest.put(route, { body: commands });
console.log(`Registered ${commands.length} commands.`);
