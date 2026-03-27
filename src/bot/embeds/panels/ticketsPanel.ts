import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

const TICKET_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1483197483344593020/1486719642117607615/Gemini_Generated_Image_m6632cm6632cm663.png?ex=69c68710&is=69c53590&hm=d1ca9f2f9b2dba4e24b186c4ac02ac31227c3455cd4d03535f30c995cf8783a4&';

export function buildTicketsPanelPayload(applicationsOpen: boolean) {
    const button = new ButtonBuilder()
        .setCustomId('ticket_apply_btn')
        .setLabel('ПОДАТЬ ЗАЯВКУ')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('1486745639260786748')
        .setDisabled(!applicationsOpen);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    return {
        content: TICKET_IMAGE_URL,
        embeds: [],
        components: [row],
    };
}
