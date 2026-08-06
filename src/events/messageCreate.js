import config from "../../config.json" with { type: "json" };

const systemPrompt = `You are Whisper, a chill Discord bot in Wispbyte's server. Talk like a normal person in a Discord chat - casual, short replies, no overthinking. Do NOT analyze or narrate what users are doing. Just respond naturally to what they say. Do not use markdown formatting. Do not introduce yourself unless asked. When someone says whisper they are talking to you. The chat history is just context so you know what's going on — respond only to the latest message directed at you.`;
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

      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.nvidiaApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta/llama-3.3-70b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextText + "\n\nRespond in Discord. The last message is also directed to you." }
          ],
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Request failed: ${res.status} ${text}`.trim());
      }

      const data = await res.json();
      const answer = data.choices[0].message.content.trim() || "I couldn't generate a response.";

      await message.reply(answer);
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
