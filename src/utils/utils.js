import { RouteBases } from "discord.js";

export function truncateByChars(s, max) {
  const str = (s ?? "").toString();
  return str.length > max ? str.slice(0, max) + "..." : str;
}

export function escapeXml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatMentionsInContent(content, message) {
  const guild = message.guild;
  const usersCache = guild?.members?.cache;
  const roleCache = guild?.roles?.cache;
  const channelCache = guild?.channels?.cache;

  let out = content ?? "";

  out = out.replace(/<@!?(\d+)>/g, (_match, id) => {
    const member = usersCache?.get(id);
    if (member?.user?.username) return `@${member.user.username}`;
    return `@user(${id})`;
  });

  out = out.replace(/<@&(\d+)>/g, (_match, id) => {
    const role = roleCache?.get(id);
    if (role?.name) return `@${role.name}`;
    return `@role(${id})`;
  });

  out = out.replace(/<#(\d+)>/g, (_match, id) => {
    const ch = channelCache?.get(id);
    if (ch?.name) return `#${ch.name}`;
    return `#channel(${id})`;
  });

  return out;
}

// Replace with something better later
export async function getRestLatency() {
  const start = Date.now(),
        res = await fetch(RouteBases.api + "/gateway");
  return { roundtrip: Date.now() - start, res };
}
