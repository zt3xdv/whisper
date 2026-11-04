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
	
	ttsClient: new ElevenLabsClient({ apiKey: config.tts.token }),
	ttsCache: new Map(),
	
	defaultEphemeralConfig: {
		url: config.ai.url,
		authorization: config.ai.token,
		model: config.ai.model,
		maxTokens: config.ai.maxTokens
	},
	
	ephemeralAiProvider: {
		url: config.ai.url,
		authorization: config.ai.token,
		model: config.ai.model,
		maxTokens: config.ai.maxTokens
	},
	
	tools: [{
		name: "webSearch",
		description: "Make a web search to get detailed information.",
		parameters: {
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
		async execute({ arguments: toolArguments }) {
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
	
	async executeTool(toolCall, message) {
		const toolName = toolCall?.function?.name;
		const tool = this.tools.find(item => item.name === toolName);
		if (!tool) {
			return {
				tool: toolName ?? null,
				success: false,
				error: `Unknown tool: ${toolName}`
			};
		}
		let toolArguments = {};
		try {
			toolArguments = JSON.parse(toolCall.function.arguments || "{}");
		} catch {}
		try {
			const result = await tool.execute({
				client: message.client,
				channel: message.channel,
				message,
				arguments: toolArguments
			});
			return {
				tool: toolName,
				success: true,
				result: result ?? null
			};
		} catch (error) {
			console.error(`Error executing tool "${toolName}":`, error);
			return {
				tool: toolName,
				success: false,
				error: error?.message || String(error)
			};
		}
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
	
	async fetchAiCompletion(messages) {
		const requestBody = {
			model: this.ephemeralAiProvider.model,
			messages,
			max_tokens: this.ephemeralAiProvider.maxTokens,
			temperature: 0.6,
			tools: this.tools.map(({ name, description, parameters }) => ({
				type: "function",
				function: {
					name,
					description,
					parameters
				}
			}))
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
			const response = await fetch(this.ephemeralAiProvider.url, fetchOptions);
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				throw new Error(`Request failed: ${response.status} ${text}`.trim());
			}
			return response.json();
		}
		try {
			const response = await fetch(this.ephemeralAiProvider.url, fetchOptions);
			if (response.ok) return response.json();
			console.warn("Failed to fetch from custom URL, resetting to default and retrying");
			this.resetEphemeralAiProvider();
			return this.fetchAiCompletion(messages);
		} catch (error) {
			if (error?.name === "TimeoutError") {
				console.warn("Custom URL timed out, resetting to default and retrying");
				this.resetEphemeralAiProvider();
				return this.fetchAiCompletion(messages);
			}
			throw error;
		}
	},
	
	async getAiResponse(systemPrompt, context, lastMessage, message) {
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const currentTime = new Intl.DateTimeFormat("en-US", {
			dateStyle: "full",
			timeStyle: "long",
			timeZone
		}).format(new Date());
		const messages = [
			{
				role: "system",
				content:
					(systemPrompt || "") +
					`Current date and time: ${currentTime} (${timeZone}).\n` +
					`Use content as the current message content and reply.content as quoted context.\n\n` +
					`Reply naturally. Add exactly %tts% at the end of your message if you want to send a voice message.\n` +
					`Only send voice messages when asked. If asked to send one, always add %tts%.`
			},
			{
				role: "user",
				content:
					`Chat history:\n${context}\n\n` +
					`Latest message:\n${lastMessage}\n\n`
			}
		];
		let executedToolCalls = 0;
		while (true) {
			const data = await this.fetchAiCompletion(messages);
			const choice = data.choices?.[0]?.message;
			const toolCalls = choice?.tool_calls ?? [];
			if (toolCalls.length && executedToolCalls < this.maxToolCalls) {
				messages.push(choice);
				for (const toolCall of toolCalls) {
					const result = await this.executeTool(toolCall, message);
					messages.push({
						role: "tool",
						tool_call_id: toolCall.id,
						content: JSON.stringify(result)
					});
					executedToolCalls++;
				}
				continue;
			}
			return choice?.content?.trim() || "I couldn't generate a response.";
		}
	},
	
	async buildMessage(message, messagesById, knownAs, maxLength) {
		const timeFormatter = new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false
		});
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
				...(author.username ? { username: author.username } : {}),
				...(displayName ? { displayName } : {}),
				...(msg.createdTimestamp ? {
					timestamp: timeFormatter.format(new Date(msg.createdTimestamp))
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
		const {
			displayName,
			username,
			timestamp,
			content,
			reply
		} = result;
		return `${displayName} (${username}) at ${timestamp} ${reply && `(replying to "${reply.content}" from ${reply.displayName})`} with content: ${content}`;
	},
	
	async execute(message) {
		let retryCount = 0;
		while (retryCount <= this.maxRetries) {
			let interval;
			try {
				const mentioned = message.mentions.has(message.client.user);
				const includesWhisper = message.content.toLowerCase().includes("whisper");
				if (!mentioned && !includesWhisper) return;
				
				const guildId = message.guild?.id;
				const [users, channels, roles] = await Promise.all([
					Settings.get(message.client.db, null, "whitelistedUsers", guildId),
					Settings.get(message.client.db, null, "whitelistedChannels", guildId),
					Settings.get(message.client.db, null, "whitelistedRoles", guildId)
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
				
				const answer = await this.getAiResponse(systemPrompt, context, lastContent, message);
				await this.sendAiAnswer(answer, message);
				return;
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
