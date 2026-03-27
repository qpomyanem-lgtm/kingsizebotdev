import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

const LIST_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1483197483344593020/1486775268629544960/Gemini_Generated_Image_mir0p7mir0p7mir0.png?ex=69c6bade&is=69c5695e&hm=14d33344c58b61dd9368384d571b2c2d7b5d7fde3f1f1cf474237857bcc789b0&';
export function buildEventsPanelComponents() {
    const button = new ButtonBuilder()
        .setCustomId('event_create_btn')
        .setLabel('СОЗДАТЬ СПИСОК')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('1486775719811088455');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    return { 
        content: LIST_IMAGE_URL,
        embeds: [],
        components: [row],
    };
}

