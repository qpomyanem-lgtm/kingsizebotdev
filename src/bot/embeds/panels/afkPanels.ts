import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const AFK_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1483197483344593020/1486830241845481562/Gemini_Generated_Image_euuth8euuth8euut.png?ex=69c6ee11&is=69c59c91&hm=3a1875f36d1848e2e9dfc85f5c970645fd506f38a6dc8f3c33f8286efa679aae&';

export function buildAfkPanelPayload() {
    const button1 = new ButtonBuilder()
        .setCustomId('afk_start_btn')
        .setLabel('УЙТИ В AFK')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('1486831193000513716');

    const button2 = new ButtonBuilder()
        .setCustomId('afk_end_btn')
        .setLabel('ЗАВЕРШИТЬ AFK')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('1486835742809522387');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button1, button2);

    return {
        content: AFK_IMAGE_URL,
        embeds: [],
        components: [row],
        flags: 0 // Remove V2 flags
    };
}
