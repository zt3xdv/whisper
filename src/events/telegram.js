import { Events } from "discord.js";
import config from "../../config.json" with { type: "json" };

const whitelistChannels = [ 
  '1146395460710436945', // #updates
  '1269151398105448458' // #announcements
];

export default {
  name: Events.MessageCreate,
  async execute(message) => {
    if (!whitelistChannels.includes(message.channelId)) return;
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.telegramId}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: message.cleanContent
        })
      });
      
      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }
      
      // Since it will spam console i guess
      // const data = await response.json();
      // console.log('Success sending telegram message:', data);
    } catch (error) {
      console.error('Error sending telegram message:', error);
    }
  }
};
