import {
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from 'discord.js';

export function buildOnlineStatusPanelComponents(): { components: any[]; flags: number } {
    const container = new ContainerBuilder()
        .setAccentColor(0xe02424)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🌐 Онлайн сервера Majestic RP: Phoenix'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Загрузка статистики сервера...'));

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

