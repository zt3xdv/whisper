import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes, ApplicationCommandManager } from "discord.js";

import config from "../config.json" with { type: "json" };
const { token, clientId } = config;

const commandsDir = path.join(import.meta.dirname, "commands");
const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));

const commands = [];
for (const file of commandFiles) {
  const module = await import(`file://${path.join(commandsDir, file).replace(/\\/g, "/")}`);
  commands.push(ApplicationCommandManager.transformCommand(module.default ?? module));
}

const rest = new REST({ version: "10" }).setToken(token);
const route = Routes.applicationCommands(clientId);

await rest.put(route, { body: commands });
console.log(`Registered ${commands.length} commands.`);
