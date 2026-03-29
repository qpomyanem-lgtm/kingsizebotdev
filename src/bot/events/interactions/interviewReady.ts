import { ButtonInteraction, EmbedBuilder, Colors } from 'discord.js';
import { db } from '../../../db';
import { applications } from '../../../db/schema';
import { eq } from 'drizzle-orm';
const IPC_BACKEND_BASE_URL = process.env.IPC_BACKEND_BASE_URL || 'http://localhost:3000';

export async function handleInterviewReadyBtn(interaction: ButtonInteraction) {
    const applicationId = interaction.customId.replace('interview_ready_', '');

    try {
        // deferUpdate already sent via raw WebSocket handler.

        const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));

        if (!app) {
            const embed = new EmbedBuilder()
                .setTitle('📞 Вы готовы к обзвону')
                .setDescription('Заявка не найдена, возможно она уже была обработана администратором.')
                .setColor(Colors.Red);
            await interaction.message.edit({ embeds: [embed], components: [] });
            return;
        }

        if (app.status === 'interview_ready') {
            const embed = new EmbedBuilder()
                .setTitle('📞 Вы готовы к обзвону')
                .setDescription('Вы уже подтвердили готовность. Ожидайте дальнейших действий администратора.')
                .setColor(Colors.Green);
            await interaction.message.edit({ embeds: [embed], components: [] });
            return;
        }

        if (app.status !== 'interview') {
            const embed = new EmbedBuilder()
                .setTitle('📞 Вы готовы к обзвону')
                .setDescription('Эта заявка больше не находится на этапе обзвона.')
                .setColor(Colors.Red);
            await interaction.message.edit({ embeds: [embed], components: [] });
            return;
        }

        // Update status in DB
        await db.update(applications)
            .set({ status: 'interview_ready', updatedAt: new Date() })
            .where(eq(applications.id, applicationId));

        // Update the original message to remove the button
        const embed = new EmbedBuilder()
            .setTitle('📞 Вы готовы к обзвону')
            .setDescription('Администратор получил уведомление о вашей готовности. Напишите сюда любой вопрос, если он у вас есть, или ожидайте, когда администратор вам ответит!')
            .setColor(Colors.Green);

        await interaction.message.edit({ embeds: [embed], components: [] });

        // Notify backend
        try {
            await fetch(`${IPC_BACKEND_BASE_URL}/api/applications/ipc/bot-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'interview_ready', payload: { applicationId } })
            });
        } catch (e) {
            console.error('❌ Ошибка отправки события interview_ready на сервер:', e);
        }

    } catch (err) {
        console.error('❌ Ошибка handleInterviewReadyBtn:', err);
        // For DM button interactions avoid ephemeral replies.
        // If the interaction is already acknowledged, edit the original message.
        try {
            await interaction.message.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📞 Ошибка')
                        .setDescription('Произошла ошибка при обработке вашей заявки. Попробуйте ещё раз позже.')
                        .setColor(Colors.Red)
                ],
                components: []
            });
        } catch {
            // ignore secondary failures
        }
    }
}
