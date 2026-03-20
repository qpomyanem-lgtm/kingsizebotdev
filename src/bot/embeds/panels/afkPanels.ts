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

export function buildAfkStartPanelComponents(): { components: any[]; flags: number } {
    const container1 = new ContainerBuilder()
        .setAccentColor(0xfee75c)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🌙 AFK система'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('Нажмите кнопку ниже, чтобы указать время окончания AFK по Москве и причину отсутствия.'),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('✦ Формат времени: `HH:MM` по МСК\n✦ Причина: до 100 символов'),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('afk_start_btn').setEmoji('📋').setLabel('Уйти в AFK').setStyle(ButtonStyle.Primary),
            ),
        );

    return { components: [container1], flags: MessageFlags.IsComponentsV2 };
}

export function buildAfkEndPanelComponents(): { components: any[]; flags: number } {
    const container2 = new ContainerBuilder()
        .setAccentColor(0x2f3136)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📋 Активные АФК'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Загрузка списка...'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('afk_end_btn').setLabel('Завершить мой АФК').setStyle(ButtonStyle.Success).setEmoji('✅'),
            ),
        );

    return { components: [container2], flags: MessageFlags.IsComponentsV2 };
}

