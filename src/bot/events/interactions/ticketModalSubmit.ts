import { ModalSubmitInteraction, EmbedBuilder, Colors } from 'discord.js';
import { db } from '../../../db';
import { applications, members } from '../../../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

export async function handleTicketApplyModal(interaction: ModalSubmitInteraction) {
    // Acknowledge immediately to avoid interaction token expiry.
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const discordId = interaction.user.id;

    // Check if user is blacklisted
    try {
        const [member] = await db.select().from(members).where(eq(members.discordId, discordId));
        if (member && member.status === 'blacklisted') {
            await interaction.editReply({
                content: '❌ Вы находитесь в черном списке и не можете подавать заявки.',
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
            const embed = new EmbedBuilder()
                .setTitle('📩 Заявка отправлена')
                .setDescription('Ваша заявка успешно отправлена и ожидает рассмотрения администрацией. Мы свяжемся с вами в ближайшее время!')
                .setColor(Colors.Green);
            
            await interaction.user.send({ embeds: [embed] });
        } catch (dmError) {
            console.error('❌ Ошибка при отправке ЛС:', dmError);
            dmStatusMsg = '(Не удалось отправить уведомление в ЛС, возможно они у вас закрыты)';
        }

        await interaction.editReply({
            content: `Ваша заявка успешно отправлена! ${dmStatusMsg}`,
        });
    } catch (error) {
        console.error('❌ Ошибка при сохранении заявки:', error);
        await interaction.editReply({
            content: 'Произошла ошибка при сохранении заявки. Пожалуйста, сообщите администрации.',
        });
    }
}
