export interface ApplicationsStats {
    total: number;
    pending: number;
    interview: number;
    interviewReady: number;
    unreadMessages: number;
}

export function buildApplicationsStatsPanelPayload(stats: ApplicationsStats) {
    return {
        flags: 32768,
        allowed_mentions: { parse: [] as string[] },
        components: [
            {
                type: 17,
                components: [
                    {
                        type: 10,
                        content: '# <:applicationscheck:1487047415298002984> ЗАЯВКИ'
                    },
                    {
                        type: 14,
                        spacing: 1,
                        divider: false
                    },
                    {
                        type: 10,
                        content: [
                            `**Всего активных заявок:** **${stats.total}**`,
                            `**Количество заявок в ожидании рассмотрения:** **${stats.pending}**`,
                            `**Количество заявок на обзвоне:** **${stats.interview}**`,
                            `**Количество кандидатов готовых к обзвону:** **${stats.interviewReady}**`,
                            `**Количество непрочитанных сообщений на сайте:** **${stats.unreadMessages}**`,
                        ].join('\n')
                    },
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 5,
                                label: 'Открыть панель заявок',
                                url: 'http://admin.kingsize.website/applications',
                                emoji: { name: 'globe', id: '1487048674357022832' }
                            }
                        ]
                    }
                ]
            }
        ]
    };
}
