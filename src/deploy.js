import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes } from "discord.js";
import config from "../config.json" with { type: "json" };

const { token, clientId } = config;

const commandsDir = path.join(import.meta.dirname, "commands");
const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));

const commands = [];
for (const file of commandFiles) {
  const mod = await import(`file://${path.join(commandsDir, file).replace(/\\/g, "/")}`);
  const command = mod.default ?? mod;
  if (!command?.name) continue;

  commands.push({
    name: command.name,
    description: command.description ?? "No description",
    options: command.options,
    integrationTypes: command.integrationTypes,
    type: command.type,
    dmPermission: command.dmPermission,
    defaultMemberPermissions: command.defaultMemberPermissions,
  });
}

const rest = new REST({ version: "10" }).setToken(token);
const route = Routes.applicationCommands(clientId);

await rest.put(route, { body: commands });
console.log(`OK. Registered ${commands.length} commands.`);
