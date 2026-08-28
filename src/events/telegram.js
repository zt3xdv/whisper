import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };

const whitelistChannels = [
  '1146395460710436945', // #updates
  '1269151398105448458'  // #announcements
];

const TELEGRAM_API = `https://api.telegram.org/bot${config.telegramId}`;
const TG_CAPTION_LIMIT = 1024; // лимит подписи у медиа в телеграме
const TG_TEXT_LIMIT = 4096;    // лимит текстового сообщения в телеграме

async function tgRequest(method, payload, retried = false) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text();
    // если телеграм не смог распарсить разметку - шлём то же самое, но без неё
    if (!retried && /can't parse entities/i.test(err)) {
      return tgRequest(method, stripFormatting(payload), true);
    }
    throw new Error(`${method} failed: ${err}`);
  }
  return res.json();
}

function stripFormatting(payload) {
  const clone = JSON.parse(JSON.stringify(payload));
  const stripTags = (s) => s.replace(/<[^>]+>/g, '');
  delete clone.parse_mode;
  if (typeof clone.text === 'string') clone.text = stripTags(clone.text);
  if (typeof clone.caption === 'string') clone.caption = stripTags(clone.caption);
  if (Array.isArray(clone.media)) {
    for (const item of clone.media) {
      delete item.parse_mode;
      if (typeof item.caption === 'string') item.caption = stripTags(item.caption);
    }
  }
  return clone;
}

function getMediaType(attachment) {
  const type = attachment.contentType || '';
  if (type.startsWith('image/')) return 'photo';
  if (type.startsWith('video/')) return 'video';
  return 'document';
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// чистим сырой текст: роли и серверные эмодзи вырезаем, пинги делаем читаемыми
function cleanDiscordText(message) {
  let text = message.content || '';

  // упоминания ролей <@&123> - убираем полностью
  text = text.replace(/( ?)<@&\d+>( ?)/g, (_, l, r) => (l && r ? ' ' : ''));

  // серверные эмодзи <:name:123> и анимированные <a:name:123> - тоже убираем
  text = text.replace(/( ?)<a?:\w+:\d+>( ?)/g, (_, l, r) => (l && r ? ' ' : ''));

  // пинги юзеров <@123> -> @username
  text = text.replace(/<@!?(\d+)>/g, (_, id) => {
    const user = message.mentions.users.get(id);
    return user ? `@${user.username}` : '';
  });

  // упоминания каналов <#123> -> #name
  text = text.replace(/<#(\d+)>/g, (_, id) => {
    const channel = message.mentions.channels.get(id) ?? message.guild?.channels.cache.get(id);
    return channel ? `#${channel.name}` : '';
  });

  // <https://...> -> https://... (в дискорде скобки скрывают превью)
  text = text.replace(/<(https?:\/\/[^>\s]+)>/g, '$1');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

// дискордовский маркдаун -> телеграмовский HTML
function discordToTelegramHtml(input) {
  const stashed = [];
  const stash = (html) => `\u0000${stashed.push(html) - 1}\u0000`;

  let text = escapeHtml(input);

  // код прячем первым, чтобы маркдаун внутри него не сработал
  text = text.replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, code) => stash(`<pre>${code.replace(/^\n/, '')}</pre>`));
  text = text.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${code}</code>`));

  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');                   // **жирный**
  text = text.replace(/__([\s\S]+?)__/g, '<u>$1</u>');                       // __подчёркнутый__
  text = text.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');                       // ~~зачёркнутый~~
  text = text.replace(/\|\|([\s\S]+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>'); // ||спойлер||
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>');             // *курсив*
  text = text.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<i>$2</i>');               // _курсив_

  text = text.replace(/^#{1,3} (.+)$/gm, '<b>$1</b>');                       // # заголовки
  text = text.replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>');      // > цитаты
  text = text.replace(/<\/blockquote>\n<blockquote>/g, '\n');                // склеиваем соседние цитаты

  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>'); // [текст](ссылка)

  // возвращаем спрятанный код на место
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => stashed[+i]);
}

// текст из новых компонентов (Components V2: Text Display и т.п.)
function componentsToRawText(components) {
  const texts = [];
  const walk = (comp) => {
    if (!comp) return;
    const data = comp.data ?? comp;
    if (typeof data.content === 'string') texts.push(data.content);
    if (Array.isArray(data.components)) data.components.forEach(walk);
    if (data.component) walk(data.component);
    if (data.accessory) walk(data.accessory);
  };
  for (const comp of components ?? []) walk(comp);
  return texts.join('\n');
}

// rich-эмбед -> HTML-текст
function embedToHtml(embed) {
  const lines = [];
  if (embed.author?.name) {
    const name = `<b>${escapeHtml(embed.author.name)}</b>`;
    lines.push(embed.author.url ? `<a href="${embed.author.url}">${name}</a>` : name);
  }
  if (embed.title) {
    const title = `<b>${escapeHtml(embed.title)}</b>`;
    lines.push(embed.url ? `<a href="${embed.url}">${title}</a>` : title);
  }
  if (embed.description) lines.push(discordToTelegramHtml(embed.description));
  for (const field of embed.fields ?? []) {
    lines.push(`<b>${escapeHtml(field.name)}</b>\n${discordToTelegramHtml(field.value)}`);
  }
  if (embed.footer?.text) lines.push(`<i>${escapeHtml(embed.footer.text)}</i>`);
  return lines.join('\n');
}

// картинки и видео из эмбедов
function collectEmbedMedia(embeds) {
  const media = [];
  for (const embed of embeds) {
    const image = embed.image?.url ?? embed.thumbnail?.url;
    if (image) media.push({ type: 'photo', url: image });
    if (embed.video?.url) media.push({ type: 'video', url: embed.video.url });
  }
  return media;
}

function splitText(text, limit = TG_TEXT_LIMIT) {
  const parts = [];
  for (let i = 0; i < text.length; i += limit) {
    parts.push(text.slice(i, i + limit));
  }
  return parts;
}

async function sendText(chat_id, text) {
  for (const part of splitText(text)) {
    await tgRequest('sendMessage', { chat_id, text: part, parse_mode: 'HTML' });
  }
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author?.bot) return; // ignore bots
    if (!whitelistChannels.includes(message.channelId)) return;

    const parts = [];
    const cleaned = cleanDiscordText(message);
    if (cleaned) parts.push(discordToTelegramHtml(cleaned));

    // текст из новых компонентов (Components V2)
    const compText = componentsToRawText(message.components);
    if (compText) parts.push(discordToTelegramHtml(compText));

    // rich-эмбеды (их шлют боты и вебхуки), авто-превью ссылок пропускаем
    const richEmbeds = message.embeds.filter(e => {
      const type = e.data?.type ?? e.type;
      if (type) return type === 'rich';
      return Boolean(e.title || e.description || e.fields?.length || e.author);
    });
    const embedText = richEmbeds.map(embedToHtml).filter(Boolean).join('\n\n');
    if (embedText) parts.push(embedText);

    const fullText = parts.join('\n\n');

    const attachments = [...message.attachments.values()];
    const mediaItems = [
      ...attachments.filter(a => getMediaType(a) !== 'document').map(a => ({ type: getMediaType(a), url: a.url })),
      ...collectEmbedMedia(richEmbeds)
    ];
    const documentUrls = attachments.filter(a => getMediaType(a) === 'document').map(a => a.url);

    if (!fullText && mediaItems.length === 0 && documentUrls.length === 0) return;

    try {
      const chat_id = config.telegramChatId;

      if (mediaItems.length === 0 && documentUrls.length === 0) {
        await sendText(chat_id, fullText);
        return;
      }

      // если текст длиннее лимита подписи - отправляем его отдельным сообщением
      let caption = fullText.length <= TG_CAPTION_LIMIT ? fullText : '';
      if (fullText && !caption) await sendText(chat_id, fullText);

      if (mediaItems.length === 1) {
        const item = mediaItems[0];
        const isPhoto = item.type === 'photo';
        await tgRequest(isPhoto ? 'sendPhoto' : 'sendVideo', {
          chat_id,
          [isPhoto ? 'photo' : 'video']: item.url,
          caption: caption || undefined,
          parse_mode: 'HTML'
        });
        caption = '';
      } else if (mediaItems.length > 1) {
        for (let i = 0; i < mediaItems.length; i += 10) {
          const chunk = mediaItems.slice(i, i + 10).map((item, idx) => {
            const m = { type: item.type, media: item.url };
            if (caption && i === 0 && idx === 0) {
              m.caption = caption;
              m.parse_mode = 'HTML';
              caption = '';
            }
            return m;
          });
          await tgRequest('sendMediaGroup', { chat_id, media: chunk });
        }
      }

      // текст остался без медиа (например были только документы)
      if (caption) await sendText(chat_id, caption);

      for (const url of documentUrls) {
        await tgRequest('sendDocument', { chat_id, document: url });
      }
    } catch (error) {
      console.error('Error sending telegram message:', error);
    }
  }
}; // thank you kimi k3
