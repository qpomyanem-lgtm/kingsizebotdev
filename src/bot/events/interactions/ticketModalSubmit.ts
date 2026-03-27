import { ModalSubmitInteraction, EmbedBuilder, Colors } from 'discord.js';
import { db } from '../../../db';
import { applications, members } from '../../../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

export async function handleTicketApplyModal(interaction: ModalSubmitInteraction) {
    // Acknowledge immediately without creating an ephemeral message.
    await interaction.deferUpdate().catch(() => {});
    const discordId = interaction.user.id;

    // Check if user is blacklisted
    try {
        const [member] = await db.select().from(members).where(eq(members.discordId, discordId));
        if (member && member.status === 'blacklisted') {
            await interaction.followUp({
                content: '❌ Вы находитесь в черном списке и не можете подавать заявки.',
                ephemeral: true,
            });
            return;
        }
    } catch (err) {
        console.error('❌ Ошибка проверки черного списка:', err);
    }

    const field1 = interaction.fields.getTextInputValue('field_1');
    const field2 = interaction.fields.getTextInputValue('field_2');
    const field3 = interaction.fields.getTextInputValue('field_3');
    const field4 = interaction.fields.getTextInputValue('field_4');
    const field5 = interaction.fields.getTextInputValue('field_5');

    const discordUsername = interaction.user.username;
    const discordAvatarUrl = interaction.user.displayAvatarURL({ size: 128 }) || null;

    try {
        await db.insert(applications).values({
            id: uuidv4(),
            discordId,
            discordUsername,
            discordAvatarUrl,
            field1,
            field2,
            field3,
            field4,
            field5,
            status: 'pending',
        });

        let dmStatusMsg = 'Проверьте личные сообщения.';
        try {
            // Raw V2 container components payload
            const rawPayload = {
                flags: 32768,
                allowed_mentions: { parse: [] },
                components: [
                    {
                        type: 17, // Section
                        components: [
                            {
                                type: 10, // Text
                                content: '### <:newapp:1486747271641956514> **Заявка отправлена**\n\n***Ваша заявка успешно отправлена и ожидает рассмотрения. Мы свяжемся с вами в ближайшее время!***'
                            }
                        ]
                    }
                ]
            };
            
            await (interaction.user as any).send(rawPayload);
        } catch (dmError) {
            console.error('❌ Ошибка при отправке ЛС:', dmError);
            dmStatusMsg = '(Не удалось отправить уведомление в ЛС, возможно они у вас закрыты)';
        }

        // Success: notify backend to refresh applications on dashboard
        try {
            const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';
            await fetch(`${IPC_BACKEND_BASE_URL}/api/applications/ipc/bot-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'new_application', payload: {} }),
            });
        } catch { /* ignore IPC errors */ }
    } catch (error) {
        console.error('❌ Ошибка при сохранении заявки:', error);
        await interaction.followUp({
            content: 'Произошла ошибка при сохранении заявки. Пожалуйста, сообщите администрации.',
            ephemeral: true,
        });
    }
}
