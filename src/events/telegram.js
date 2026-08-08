import { Events } from "discord.js";
module.exports = {
    name: Events.MessageCreate,
    async execute(message) => {
        const whitelist_channels = [ 
            '1146395460710436945', // #updates
            '1269151398105448458' // #announcements
        ];
        
        if (!whitelist_channels.includes(message.channelId)) return;
        
        const url = `https://api.telegram.org/bot8679922182:AAFfK1DlkKaH2SIoutAJdTZNiPmtkFc8pvI/sendMessage`;
        try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: '-1003747712686', // @wispbyte
                text: message.cleanContent
            })
        });

        const data = await response.json();
        console.log('Success sending telegram message:', data);
    } catch (error) {
        console.error('Error sending telegram message:', error);
    }
    }
};
