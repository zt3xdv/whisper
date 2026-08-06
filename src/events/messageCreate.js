import config from "../../config.json" with { type: "json" };

const systemPrompt = `You are Whisper, a chill Discord bot in Wispbyte's server. Talk like a normal person in a Discord chat - casual, short replies, no overthinking. Do NOT analyze or narrate what users are doing. Just respond naturally to what they say. Do not use markdown formatting. Do not introduce yourself unless asked. When someone says whisper they are talking to you. The chat history is just context so you know what's going on — respond only to the latest message directed to you. Talk naturally, dont use formal writing if not asked, just chat normally, and make sure to not be threated like a good boy (be mad at it). If the user's message asks about something that needs fresh, current, or specific real-world information (recent news, current prices, weather, sports scores, up-to-date facts, recent events, or anything you're not sure about), call the web_search tool with a concise search query. Otherwise just answer normally. Don't call the tool for things you already know or for casual chat.`;
const channelIds = new Set([
  "1522989739953623185", // Wispbyte SMP #general
  "1112023292333785120" // Wispbyte #general
]);

const allowedRoles = new Set([
  "1522989849395593306", // Admin and Whisper AI
  "1525650389725085857",
  "1505258838536753372" // VMOTC
]);

const maxContextMessages = 30;
const maxMessageLength = 500;
const maxToolRounds = 5;

function truncateByChars(s, max) {
  const str = (s ?? "").toString();
  return str.length > max ? str.slice(0, max) + "..." : str;
}

export default {
  name: "messageCreate",
  async execute(message) {
    let typingInterval;
    try {
      if (!channelIds.has(message.channel.id)) return;
      if (message.author.bot) return;

      const member =
        message.guild?.members?.cache?.get(message.author.id) ||
        (await message.guild?.members?.fetch(message.author.id).catch(() => null));

      const hasAllowedRole = !!member?.roles?.cache?.some(r => allowedRoles.has(r.id));
      if (!hasAllowedRole) return;

      const botMentioned = message.mentions.has(message.client.user);
      const includesWhisper = message.content.toLowerCase().includes("whisper");
      if (!botMentioned && !includesWhisper) return;

      typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => {});
      }, 3500);

      const fetched = await message.channel.messages.fetch({ limit: maxContextMessages });
      const msgs = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const contextText = msgs
        .map(m => {
          const displayName = m.member?.displayName || m.author.username;
          const content = truncateByChars(m.content, maxMessageLength);
          return `${displayName}: ${content}`.trim();
        })
        .filter(Boolean)
        .join("\n");

      const history = [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextText + "\n\nRespond in Discord. The last message is also directed to you." }
      ];

      const tools = [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current information, news, or general knowledge.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to look up on the web"
                }
              },
              required: ["query"]
            },
            execute: async (args) => {
              const query = String(args.query ?? "").trim();
              if (!query) return "Search failed: empty query.";

              const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${config.tavilyApiKey}`
                },
                body: JSON.stringify({
                  query,
                  max_results: 3,
                  include_answer: "basic"
                })
              });

              if (!response.ok) {
                return `Search failed: HTTP ${response.status}`;
              }

              const data = await response.json();
              const bits = [];
              if (data.answer) bits.push(`Answer: ${data.answer}`);
              for (const r of data.results || []) {
                bits.push(`- ${r.title}\n  ${r.url}\n  ${truncateByChars(r.content, 400)}`);
              }
              const rawResults = bits.join("\n\n").slice(0, 4000) || "No results found.";

              const summaryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${config.groqApiKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  model: "llama-3.1-8b-instant",
                  messages: [
                    {
                      role: "system",
                      content: "You are a search summarizer. Given a web search query and raw search results, return a concise, accurate, factual summary of the relevant information that answers the query. Include specific facts, numbers, dates, and names. Do not add anything that isn't in the results. Be brief but complete."
                    },
                    {
                      role: "user",
                      content: `Search query: ${query}\n\nRaw search results:\n${rawResults}\n\nSummarize the key findings for the assistant.`
                    }
                  ],
                  temperature: 0.2
                })
              });

              if (!summaryRes.ok) {
                return rawResults;
              }

              const summaryData = await summaryRes.json();
              return summaryData.choices[0].message.content.trim() || rawResults;
            }
          }
        }
      ];

      const toolMap = new Map(tools.map(t => [t.function.name, t]));

      const cleanToolsPayload = tools.map(({ type, function: fn }) => ({
        type,
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        }
      }));

      let answer = "";

      for (let round = 0; round < maxToolRounds; round++) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.groqApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: history,
            tools: cleanToolsPayload,
            tool_choice: "auto",
            max_tokens: 512,
            temperature: 0.6
          })
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Request failed: ${res.status} ${text}`.trim());
        }

        const data = await res.json();
        const msg = data.choices[0].message;

        history.push({
          role: msg.role ?? "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls
        });

        const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

        if (toolCalls.length === 0) {
          answer = msg.content.trim();
          break;
        }

        for (const toolCall of toolCalls) {
          const toolName = toolCall?.function?.name;
          const tool = toolName ? toolMap.get(toolName) : undefined;
          if (!tool) continue;

          let args;
          try {
            args = JSON.parse(toolCall?.function?.arguments ?? "{}");
          } catch {
            args = {};
          }

          const result = await tool.function.execute(args);

          history.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: tool.function.name,
            content: result
          });
        }
      }

      await message.reply(answer || "I couldn't generate a response.");
    } catch (err) {
      console.error(err);
      if (!message.author.bot) {
        await message.reply("An error occurred while generating the response.");
      }
    } finally {
      if (typingInterval) clearInterval(typingInterval);
    }
  }
};
