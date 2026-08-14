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
      key: "skinUsername",
      type: "string",
      min: 1,
      max: 16,
      defaultValue: "",
      required: false,
      name: "Skin Username",
      description: "The skin username to use on Minecraft commands"
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
    },
  ]

  static async get(client, userId, settingKey, ...path) {
    const definition = this.settingsDefinitions.find(s => s.key === settingKey)
    if (!definition) {
      throw new Error(`Setting '${settingKey}' not found`)
    }

    const baseKey = !definition.global
      ? `user_settings.${userId}.${settingKey}`
      : `global_settings.${settingKey}`
    const fullKey = path.length > 0 ? `${baseKey}.${path.join(".")}` : baseKey

    let value = await client.get(fullKey)

    if (value === undefined || value === null) {
      if (path.length > 0) {
        return definition.defaultValue
      }
      value = definition.defaultValue
      await this.put(client, userId, settingKey, value)
    }

    if (path.length === 0 && this.validateValue(value, definition) === false) {
      return definition.defaultValue
    }

    return value
  }

  static async put(client, userId, settingKey, value, ...path) {
    const definition = this.settingsDefinitions.find(s => s.key === settingKey)
    if (!definition) {
      throw new Error(`Setting '${settingKey}' not found`)
    }

    if (path.length === 0 && this.validateValue(value, definition) === false) {
      throw new Error(`Invalid value for setting '${settingKey}'`)
    }

    const baseKey = !definition.global
      ? `user_settings.${userId}.${settingKey}`
      : `global_settings.${settingKey}`
    const fullKey = path.length > 0 ? `${baseKey}.${path.join(".")}` : baseKey

    await client.set(fullKey, value)
  }

  static validateValue(value, definition) {
    switch (definition.type) {
      case "bool":
        if (typeof value !== "boolean") return false
        break
      case "channel":
      case "role":
        if (!Array.isArray(value)) return false
        break
      case "number":
        if (typeof value !== "number") return false
        if (definition.min !== undefined && value < definition.min) return false
        if (definition.max !== undefined && value > definition.max) return false
        break
      case "string":
        if (typeof value !== "string") return false
        if (definition.min !== undefined && value.length < definition.min)
          return false
        if (definition.max !== undefined && value.length > definition.max)
          return false
        if (definition.enum && !definition.enum.includes(value)) return false
        break
      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value))
          return false
        break
      case "array":
        if (!Array.isArray(value)) return false
        break
    }
    return true
  }

  static async getAllForUser(client, userId) {
    const result = {}
    for (const definition of this.settingsDefinitions) {
      result[definition.key] = await this.get(client, userId, definition.key)
    }
    return result
  }

  static async resetAllForUser(client, userId) {
    for (const definition of this.settingsDefinitions) {
      await this.put(client, userId, definition.key, definition.defaultValue)
    }
  }
}
