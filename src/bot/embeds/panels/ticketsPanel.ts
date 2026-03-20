import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from 'discord.js';

export function buildTicketsPanelComponents(): { components: any[]; flags: number } {
    const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📝 Подача заявки'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                'Хотите вступить в нашу семью?\nНажмите кнопку ниже и заполните анкету — мы рассмотрим вашу заявку в кратчайшие сроки.',
            ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📋 Что нужно знать'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('✦ Ответьте на все вопросы максимально подробно\n✦ Укажите реальные данные вашего персонажа\n✦ Заявка будет рассмотрена администрацией'),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# ⏳ Время ответа: обычно до 24 часов'))
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('ticket_apply_btn').setLabel('Подать заявку').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            ),
        );

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

