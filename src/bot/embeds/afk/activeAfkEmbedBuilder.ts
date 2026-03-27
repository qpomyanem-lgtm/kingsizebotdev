type ActiveAfkRow = {
    discordId: string;
    endsAt: Date;
    reason: string;
};

function formatEndsAtMsk(endsAt: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
    }).format(new Date(endsAt.getTime()));
}

export function buildActiveAfkRawPayload(activeAfks: ActiveAfkRow[]) {
    // Build entry components for each active AFK member
    const entryComponents: any[] = [];

    if (activeAfks.length === 0) {
        entryComponents.push({
            type: 10,
            content: '*В данный момент нет активных AFK.*'
        });
    } else {
        for (const afk of activeAfks) {
            const timeString = formatEndsAtMsk(afk.endsAt);
            entryComponents.push({
                type: 10,
                content: `<:user:1486833769402077376> **<@${afk.discordId}>** <:clock:1486834009861521408> **${timeString} МСК** <:newapp:1486747271641956514> **${afk.reason}**`
            });
        }
    }

    const nowUnix = Math.floor(Date.now() / 1000);

    return {
        flags: 32768,
        allowed_mentions: { parse: [] as string[] },
        components: [
            {
                type: 17,
                components: [
                    {
                        type: 10,
                        content: '## <:moon:1486831193000513716> Список AFK'
                    },
                    {
                        type: 14,
                        spacing: 1,
                        divider: false
                    },
                    ...entryComponents,
                    {
                        type: 14,
                        spacing: 1,
                        divider: false
                    },
                    {
                        type: 10,
                        content: `-# Обновлено <t:${nowUnix}:f>`
                    }
                ]
            }
        ]
    };
}
