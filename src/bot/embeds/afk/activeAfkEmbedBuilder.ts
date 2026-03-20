import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from 'discord.js';

type ActiveAfkRow = {
    discordId: string;
    endsAt: Date;
    reason: string;
};

function formatEndsAtMsk(endsAt: Date): string {
    const endsAtMsk = new Date(endsAt.getTime());
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
    }).format(endsAtMsk);
}

export function buildActiveAfksDescription(activeAfks: ActiveAfkRow[]): string {
    if (activeAfks.length === 0) {
        return 'В данный момент нет активных AFK.';
    }

    let description = '';
    for (const afk of activeAfks) {
        const timeString = formatEndsAtMsk(afk.endsAt);
        description += `👤 <@${afk.discordId}> \u2800\ • \u2800\ ⏰ До: **${timeString} МСК** \u2800\ • \u2800\ 📝 ${afk.reason}\n`;
    }

    // Discord hard limit for embed text blocks.
    return description.substring(0, 4000);
}

export function buildActiveAfkContainer(description: string): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0xfee75c)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📋 Активные AFK'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('afk_end_btn')
                    .setLabel('Завершить мой АФК')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
            ),
        );
}

