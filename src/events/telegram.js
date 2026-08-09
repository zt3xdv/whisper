import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };

const whitelistChannels = [
  '1146395460710436945', // #updates
  '1269151398105448458'  // #announcements
];

const TELEGRAM_API = `https://api.telegram.org/bot${config.telegramId}`;

async function tgRequest(method, payload) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${method} failed: ${err}`);
  }
  return res.json();
}

function getMediaType(attachment) {
  const type = attachment.contentType || '';
  if (type.startsWith('image/')) return 'photo';
  if (type.startsWith('video/')) return 'video';
  return 'document';
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author?.bot) return; // ignore bots
    if (!whitelistChannels.includes(message.channelId)) return;

    const text = message.cleanContent?.trim() || '';
    const attachments = [...message.attachments.values()];

    if (!text && attachments.length === 0) return;

    try {
      if (attachments.length === 0) {
        await tgRequest('sendMessage', {
          chat_id: config.telegramChatId,
          text
        });
        return;
      }

      const mediaAttachments = attachments.filter(a => getMediaType(a) !== 'document');
      const documentAttachments = attachments.filter(a => getMediaType(a) === 'document');

      // photo/video
      if (mediaAttachments.length === 1) {
        const a = mediaAttachments[0];
        const isPhoto = getMediaType(a) === 'photo';
        await tgRequest(isPhoto ? 'sendPhoto' : 'sendVideo', {
          chat_id: config.telegramChatId,
          [isPhoto ? 'photo' : 'video']: a.url,
          caption: text || undefined
        });
      } else if (mediaAttachments.length > 1) {
        for (let i = 0; i < mediaAttachments.length; i += 10) {
          const chunk = mediaAttachments.slice(i, i + 10).map((a, idx) => ({
            type: getMediaType(a),
            media: a.url,
            caption: i === 0 && idx === 0 ? text || undefined : undefined
          }));
          await tgRequest('sendMediaGroup', {
            chat_id: config.telegramChatId,
            media: chunk
          });
        }
      } else if (text) {
        await tgRequest('sendMessage', {
          chat_id: config.telegramChatId,
          text
        });
      }

      for (const doc of documentAttachments) {
        await tgRequest('sendDocument', {
          chat_id: config.telegramChatId,
          document: doc.url
        });
      }
    } catch (error) {
      console.error('Error sending telegram message:', error);
    }
  }
}; // thanks claude
