export class Settings {
  static settingsDefinitions = [
    {
      key: "knownAs",
      type: "string",
      min: 0,
      max: 32,
      defaultValue: "",
      required: false,
      name: "Known as",
      description: "How should Whisper know you as?"
    },
    {
      key: "mcUsername",
      type: "string",
      min: 0,
      max: 16,
      defaultValue: "",
      required: false,
      name: "MC Username",
      description: "Minecraft username to use for resolving skin"
    },
    {
      key: "skinUsername",
      type: "string",
      min: 0,
      max: 16,
      defaultValue: "",
      required: false,
      name: "Skin Username",
      description:
        "The skin username to use on Minecraft commands (preferred over MC Username)"
    },
    {
      key: "whitelistedRoles",
      type: "role",
      global: true,
      defaultValue: [],
      name: "Whitelisted Roles",
      description: "Roles that can use Whisper AI"
    },
    {
      key: "whitelistedChannels",
      type: "channel",
      global: true,
      defaultValue: [],
      name: "Whitelisted Channels",
      description: "Where can Whisper yap around?"
    },
    {
      key: "maxContextMessages",
      type: "number",
      min: 5,
      max: 40,
      global: true,
      defaultValue: 30,
      required: true,
      name: "Max Context Messages",
      description: "How much messages can Whisper read since last message"
    },
    {
      key: "maxMessageLength",
      type: "number",
      min: 100,
      max: 600,
      global: true,
      defaultValue: 500,
      required: true,
      name: "Max Message Length",
      description: "Max length of the messages that Whisper will read"
    }
  ];

  static async get(client, userId, settingKey, ...path) {
    const definition = this.settingsDefinitions.find((s) => s.key === settingKey);
    if (!definition) throw new Error(`Setting '${settingKey}' not found`);

    const baseKey = !definition.global
      ? `user_settings.${userId}.${settingKey}`
      : `global_settings.${settingKey}`;
    const fullKey = path.length > 0 ? `${baseKey}.${path.join(".")}` : baseKey;

    let value = await client.get(fullKey);

    if (value === undefined || value === null) {
      if (path.length > 0) return definition.defaultValue;
      value = definition.defaultValue;
      await this.put(client, userId, settingKey, value);
    }

    if (path.length === 0 && this.validateValue(value, definition) === false) {
      return definition.defaultValue;
    }

    return value;
  }

  static async put(client, userId, settingKey, value, ...path) {
    const definition = this.settingsDefinitions.find((s) => s.key === settingKey);
    if (!definition) throw new Error(`Setting '${settingKey}' not found`);

    if (path.length === 0 && this.validateValue(value, definition) === false) {
      throw new Error(`Invalid value for setting '${settingKey}'`);
    }

    const baseKey = !definition.global
      ? `user_settings.${userId}.${settingKey}`
      : `global_settings.${settingKey}`;
    const fullKey = path.length > 0 ? `${baseKey}.${path.join(".")}` : baseKey;

    await client.set(fullKey, value);
  }

  static validateValue(value, definition) {
    switch (definition.type) {
      case "bool":
        return typeof value === "boolean";
      case "channel":
      case "role":
        return Array.isArray(value);
      case "number":
        if (typeof value !== "number") return false;
        if (definition.min !== undefined && value < definition.min) return false;
        if (definition.max !== undefined && value > definition.max) return false;
        return true;
      case "string":
        if (typeof value !== "string") return false;
        if (definition.min !== undefined && value.length < definition.min) return false;
        if (definition.max !== undefined && value.length > definition.max) return false;
        if (definition.enum && !definition.enum.includes(value)) return false;
        return true;
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      case "array":
        return Array.isArray(value);
      default:
        return true;
    }
  }

  static async getAllForUser(client, userId) {
    const result = {};
    for (const definition of this.settingsDefinitions) {
      result[definition.key] = await this.get(client, userId, definition.key);
    }
    return result;
  }

  static async resetAllForUser(client, userId) {
    for (const definition of this.settingsDefinitions) {
      await this.put(client, userId, definition.key, definition.defaultValue);
    }
  }

  static normalizeMcUsername(mcUsername) {
    return String(mcUsername ?? "").trim();
  }

  static normalizeDiscordUuid(discordUuid) {
    return String(discordUuid ?? "").trim();
  }

  static mcLinkKey(mcUsername) {
    return `mc_to_discord.${String(mcUsername).trim().toLowerCase()}`;
  }

  static async linkMcToDiscord(client, mcUsername, discordUuid) {
    const mc = this.normalizeMcUsername(mcUsername);
    const discord = this.normalizeDiscordUuid(discordUuid);

    if (!mc || !discord) return { ok: false, reason: "INVALID" };

    const key = this.mcLinkKey(mc);

    const existing = await client.get(key);
    if (existing && String(existing).trim().length > 0) {
      const existingDiscord = String(existing).trim();
      if (existingDiscord === discord) return { ok: true };
      return { ok: false, reason: "TAKEN" };
    }

    await client.set(key, discord);
    await this.put(client, discord, "mcUsername", mc);

    return { ok: true };
  }

  static async unlinkMcFromDiscord(client, mcUsername, discordUuid) {
    const mc = this.normalizeMcUsername(mcUsername);
    const discord = this.normalizeDiscordUuid(discordUuid);

    if (!mc || !discord) return { ok: false, reason: "INVALID" };

    const key = this.mcLinkKey(mc);
    const existing = await client.get(key);

    if (!existing) return { ok: false, reason: "NOT_LINKED" };
    if (String(existing).trim() !== discord) return { ok: false, reason: "NOT_OWNER" };

    if (typeof client.del === "function") {
      await client.del(key);
      return { ok: true };
    }

    return { ok: false, reason: "DEL_NOT_SUPPORTED" };
  }

  static async getDiscordUuidByMcUsername(client, mcUsername) {
    const mc = this.normalizeMcUsername(mcUsername);
    if (!mc) return "";

    const key = this.mcLinkKey(mc);
    const discordUuid = await client.get(key);

    return typeof discordUuid === "string" ? discordUuid : "";
  }

  static async resolveSkinUsernameByMcUsername(client, mcUsername) {
    const fallback = this.normalizeMcUsername(mcUsername);

    if (!fallback) return "";

    const discordUuid = await this.getDiscordUuidByMcUsername(client, fallback);
    if (!discordUuid) return fallback;

    const skinUsername = await this.get(client, discordUuid, "skinUsername");
    if (typeof skinUsername === "string" && skinUsername.trim().length > 0) return skinUsername;

    const mcConfigured = await this.get(client, discordUuid, "mcUsername");
    if (typeof mcConfigured === "string" && mcConfigured.trim().length > 0) return mcConfigured;

    return fallback;
  }
}
