import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };
import { Settings } from "../utils/settings.js";
import { truncateByChars, formatMentionsInContent } from "../utils/utils.js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export default {
  id: "messageCreate",
  name: Events.MessageCreate,
  
  maxRetries: 2,
  maxToolCalls: 5,
  maxToolsPerMessage: 2,
  
  ttsClient: new ElevenLabsClient({ apiKey: config.tts.token }),
  ttsCache: new Map(),
  
  defaultEphemeralConfig: {
    url: config.ai.url,
    authorization: config.ai.token,
    model: config.ai.model,
    maxTokens: 512
  },
  
  ephemeralAiProvider: {
    url: config.ai.url,
    authorization: config.ai.token,
    model: config.ai.model,
    maxTokens: 512
  },
  
  tools: [/*{
    name: "react",
    description: "Add a Unicode emoji reaction to a message in the current channel.",
    arguments: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to react to."
        },
        emoji: {
          type: "string",
          description: "A single Unicode emoji."
        }
      },
      required: ["messageId", "emoji"],
      additionalProperties: false
    },
    async execute({ channel, arguments: toolArguments }) {
      const { messageId, emoji } = toolArguments ?? {};
      if (!messageId || !emoji) {
        throw new Error("Tool react requires arguments.messageId and arguments.emoji.");
      }
      const targetMessage = await channel.messages.fetch(messageId);
      await targetMessage.react(emoji);
      return {
        success: true,
        message: `Reaction ${emoji} added to message ${messageId}.`
      };
    }
  },*/
  {
    name: "webSearch",
    description: "Make a web search to get detailed information.",
    arguments: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query"
        }
      },
      required: ["query"],
      additionalProperties: false
    },
    async execute({ channel, arguments: toolArguments }) {
      const { query } = toolArguments ?? {};
      if (!query) {
        throw new Error("Query argument is needed for web search.");
      }
      
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          api_key: config.webSearch.token,
          query,
          search_depth: "advanced",
          max_results: 2,
          include_answer: true
        })
      });
      const data = await res.text();
      
      if (!res.ok) {
        throw new Error(`Web search failed with status ${res.status}: ${data}`);
      }
      
      return {
        success: true,
        data
      };
    }
  },
  {
    name: "ping",
    description: "What is your websocket ping?",
    arguments: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    async execute({ client }) {
      return {
        success: true,
        ping: `${client.ws.ping}ms`
      };
    }
  }],
  
  getTts(id) {
    return this.ttsCache.get(id);
  },
  
  setTts(id, text) {
    if (!text) return;
    this.ttsCache.set(id, text);
    while (this.ttsCache.size > 30) {
      const firstKey = this.ttsCache.keys().next().value;
      this.ttsCache.delete(firstKey);
    }
  },
  
  getToolsPrompt() {
    return JSON.stringify(this.tools.map(({ name, description, arguments: toolArguments }) => ({
      name,
      description,
      arguments: toolArguments
    })), null, 2);
  },
  
  extractTools(answer) {
    const tools = [];
    const textLines = [];
    for (const line of answer.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && typeof parsed.tool === "string") {
            tools.push(parsed);
            continue;
          }
        } catch {}
      }
      textLines.push(line);
    }
    return {
      text: textLines.join("\n").trim(),
      tools
    };
  },
  
  async executeTools(toolCalls, message, remainingToolCalls) {
    const callsToExecute = toolCalls.slice(0, Math.min(this.maxToolsPerMessage, remainingToolCalls));
    const results = [];
    for (const toolCall of callsToExecute) {
      const toolName = toolCall?.tool;
      const tool = this.tools.find(item => item.name === toolName);
      if (!tool) {
        results.push({
          tool: toolName ?? null,
          success: false,
          error: `Unknown tool: ${toolName}`
        });
        continue;
      }
      try {
        const result = await tool.execute({
          client: message.client,
          channel: message.channel,
          message,
          arguments: toolCall.arguments ?? toolCall.args ?? toolCall.meta ?? {}
        });
        results.push({
          tool: toolName,
          success: true,
          result: result ?? null
        });
      } catch (error) {
        console.error(`Error executing tool "${toolName}":`, error);
        results.push({
          tool: toolName,
          success: false,
          error: error?.message || String(error)
        });
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return results;
  },
  
  async sendAiAnswer(answer, message) {
    if (!answer) return null;
    if (answer.includes("%tts%")) {
      const ttsText = answer.replace("%tts%", "").trim();
      if (!ttsText) return null;
      const audio = await this.ttsClient.textToSpeech.convertWithTimestamps("vJVaGoR08pdjX0q5ndke", {
        text: ttsText,
        languageCode: "en",
        modelId: "eleven_flash_v2_5",
        outputFormat: "opus_48000_192"
      });
      const buffer = Buffer.from(audio.audioBase64, "base64");
      const replyMessage = await message.reply({
        files: [{
          attachment: buffer,
          name: "tts.opus"
        }]
      });
      this.setTts(replyMessage.id, ttsText);
      return replyMessage;
    }
    return message.reply({
      content: answer,
      allowedMentions: {
        parse: [ 'users' ]
      }
    });
  },
  
  setEphemeralAiProvider(url, authorization, model, maxTokens) {
    this.ephemeralAiProvider = {
      url,
      authorization: authorization?.trim?.() || null,
      model,
      maxTokens: maxTokens ?? 512,
      isCustom: true
    };
  },
  
  resetEphemeralAiProvider() {
    this.ephemeralAiProvider = this.defaultEphemeralConfig;
  },
  
  async fetchAiCompletion(systemPrompt, context, lastMessage, toolResults = "", toolsAvailable = true) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentTime = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone
    }).format(new Date());
    const requestBody = {
      model: this.ephemeralAiProvider.model,
      messages: [
        {
          role: "system",
          content:
            (systemPrompt || "") + // this is enough for it to not use tools i guess
            `Use content as the current message content and reply.content as quoted context.\n\n`/* +
            `Available tools:\n${this.getToolsPrompt()}\n\n` +
            `Tool rules:\n` +
            `- Only use tools from the Available tools list.\n` +
            `- Do not invent tool names, fields or arguments.\n` +
            `- Only use a tool when it is necessary.\n` +
            `- You can output a maximum of ${this.maxToolsPerMessage} tools in this response.\n` +
            `- Output each tool call as one JSON object on its own line after your normal response.\n` +
            `- Use this exact format: {"tool":"tool_name","arguments":{...}}.\n` +
            `- Arguments must follow the schema declared by the selected tool.\n` +
            `- Never place tool JSON inside a Markdown code block.\n` +
            `- If no tool is necessary, do not output any tool JSON.\n` +
            (toolsAvailable ? "" : `- Tool execution is disabled for this response. Do not output tool calls.\n`) +
            (toolResults ? `\nResults from tools executed previously:\n${toolResults}\n` + `Use those results to produce the next natural response.\n` : "")*/
        },
        {
          role: "user",
          content:
            `Current date and time: ${currentTime} (${timeZone}).\n` +
            `Chat history:\n${context}\n\n` +
            `Latest message:\n${lastMessage}\n\n` +
            `\nReply naturally. Add exactly %tts% at the end of your message if you want to send a voice message. ` +
            `Only send voice messages when asked. If asked to send one, always add %tts%.`
        }
      ],
      max_tokens: this.ephemeralAiProvider.maxTokens,
      temperature: 0.6
    };
    const fetchOptions = {
      method: "POST",
      headers: {
        ...(this.ephemeralAiProvider.authorization && {
          Authorization: `Bearer ${this.ephemeralAiProvider.authorization}`
        }),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60_000)
    };
    if (!this.ephemeralAiProvider.isCustom) {
      return fetch(this.ephemeralAiProvider.url, fetchOptions);
    }
    try {
      const response = await fetch(this.ephemeralAiProvider.url, fetchOptions);
      if (response.ok) return response;
      console.warn("Failed to fetch from custom URL, resetting to default and retrying");
      this.resetEphemeralAiProvider();
      return this.fetchAiCompletion(systemPrompt, context, lastMessage, toolResults, toolsAvailable);
    } catch (error) {
      if (error?.name === "TimeoutError") {
        console.warn("Custom URL timed out, resetting to default and retrying");
        this.resetEphemeralAiProvider();
        return this.fetchAiCompletion(systemPrompt, context, lastMessage, toolResults, toolsAvailable);
      }
      throw error;
    }
  },
  
  async buildMessage(message, messagesById, knownAs, maxLength) {
    const getData = (msg, useAlias = true) => {
      const author = msg.author ?? {};
      const authorId = author.id ?? "";
      const isOwnMessage = msg.client?.user && authorId === msg.client.user.id;
      const alias = useAlias ? knownAs.get(authorId) : "";
      const displayName = isOwnMessage
        ? msg.client.user.username
        : alias && alias !== "none"
          ? alias
          : msg.member?.displayName || author.username || "";
      const cachedText = isOwnMessage ? this.getTts(msg.id) : null;
      const content = truncateByChars(
        formatMentionsInContent(cachedText ?? msg.content ?? "", msg),
        maxLength
      );
      return {
        authorId,
        messageId: msg.id,
        ...(author.username ? { username: author.username } : {}),
        ...(displayName ? { displayName } : {}),
        ...(msg.createdTimestamp ? {
          timestamp: new Date(msg.createdTimestamp).toISOString()
        } : {}),
        ...(content ? { content } : {})
      };
    };
    const result = getData(message);
    const replyId = message.reference?.messageId ?? message.referencedMessage?.id;
    if (replyId) {
      let reply = messagesById.get(replyId);
      if (!reply) {
        try {
          reply = await message.channel.messages.fetch(replyId);
        } catch {
          reply = null;
        }
      }
      result.reply = reply ? getData(reply, false) : null;
    }
    return JSON.stringify(result);
  },
  
  async execute(message) {
    let retryCount = 0;
    let lastReply;
    while (retryCount <= this.maxRetries) {
      let interval;
      try {
        const mentioned = message.mentions.has(message.client.user);
        const includesWhisper = message.content.toLowerCase().includes("whisper");
        if (!mentioned && !includesWhisper) return;
        
        const [users, channels, roles] = await Promise.all([
          Settings.get(message.client.db, null, "whitelistedUsers"),
          Settings.get(message.client.db, null, "whitelistedChannels"),
          Settings.get(message.client.db, null, "whitelistedRoles")
        ]);
        if (!channels.includes(message.channel.id)) return;
        
        const member = message.guild?.members?.cache?.get(message.author.id) || (await message.guild?.members?.fetch(message.author.id).catch(() => null));
        const allowed = !!member?.roles?.cache?.some(role => roles.includes(role.id));
        if (!allowed && !users.includes(message.author.id)) return;
        
        message.channel.sendTyping().catch(() => {});
        interval = setInterval(() => message.channel.sendTyping().catch(() => {}), 3500);
        const [maxContextMessages, maxMessageLength] = await Promise.all([
          Settings.get(message.client.db, null, "maxContextMessages"),
          Settings.get(message.client.db, null, "maxMessageLength")
        ]);
        const fetched = await message.channel.messages.fetch({ limit: maxContextMessages });
        const messages = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const messagesById = new Map(messages.map(msg => [msg.id, msg]));
        const uniqueAuthorIds = [
          ...new Set(messages.map(msg => msg.author?.id).filter(Boolean))
        ];
        const knownAs = new Map();
        if (uniqueAuthorIds.length) {
          const aliases = await Promise.all(
            uniqueAuthorIds.map(id =>
              Settings.get(message.client.db, id, "knownAs").catch(() => "")
            )
          );
          uniqueAuthorIds.forEach((id, index) => {
            knownAs.set(id, aliases[index] ?? "");
          });
        }
        
        const parts = [];
        for (const msg of messages) {
          parts.push(await this.buildMessage(msg, messagesById, knownAs, maxMessageLength));
        }
        
        const context = parts.join("\n");
        const systemPrompt = await message.client.db.get("systemPrompt");
        const lastMessage = messages[messages.length - 1];
        const lastCached = lastMessage?.author?.id === message.client.user?.id
          ? this.getTts(lastMessage.id)
          : null;
        const lastSource = lastCached ?? lastMessage?.content ?? "";
        const lastContent = truncateByChars(
          formatMentionsInContent(lastSource, lastMessage),
          maxMessageLength
        );
        
        let toolResults = "";
        let executedToolCalls = 0;
        
        while (true) {
          const toolsAvailable = executedToolCalls < this.maxToolCalls;
          const response = await this.fetchAiCompletion(
            systemPrompt,
            context,
            lastContent,
            toolResults,
            toolsAvailable
          );
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Request failed: ${response.status} ${text}`.trim());
          }
          const data = await response.json();
          const rawAnswer = data.choices?.[0]?.message?.content?.trim() || "I couldn't generate a response.";
          const { text: answer, tools: toolCalls } = this.extractTools(rawAnswer);
          
          if (answer) {
            lastReply = await this.sendAiAnswer(answer, lastReply ?? message);
          }
          
          if (!toolCalls.length) return;
          
          const remainingToolCalls = this.maxToolCalls - executedToolCalls;
          if (remainingToolCalls <= 0) return;
          
          const results = await this.executeTools(
            toolCalls,
            message,
            remainingToolCalls
          );
          if (!results.length) return;
          
          executedToolCalls += results.length;
          toolResults = JSON.stringify(results, null, 2);
        }
      } catch (error) {
        console.error(error);
        retryCount++;
        
        if (retryCount > this.maxRetries) {
          if (!message.author.bot) {
            await message.reply("An error occurred while generating the response.").catch(() => {});
          }
          return;
        }
        
        const errorMessage = await message.reply("An error occurred while processing the response, retrying...\n-# This message will be deleted after 5 seconds").catch(() => null);
        if (errorMessage) {
          setTimeout(() => errorMessage.delete().catch(() => {}), 5000);
        }
      } finally {
        if (interval) clearInterval(interval);
      }
    }
  }
};
