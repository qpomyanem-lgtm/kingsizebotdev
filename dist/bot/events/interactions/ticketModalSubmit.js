"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTicketApplyModal = handleTicketApplyModal;
const discord_js_1 = require("discord.js");
const db_1 = require("../../../db");
const schema_1 = require("../../../db/schema");
const uuid_1 = require("uuid");
const drizzle_orm_1 = require("drizzle-orm");
async function handleTicketApplyModal(interaction) {
    const discordId = interaction.user.id;
    // Check if user is blacklisted
    try {
        const [member] = await db_1.db.select().from(schema_1.members).where((0, drizzle_orm_1.eq)(schema_1.members.discordId, discordId));
        if (member && member.status === 'blacklisted') {
            await interaction.reply({
                content: '❌ Вы находитесь в черном списке и не можете подавать заявки.',
                ephemeral: true
            });
            return;
        }
    }
    catch (err) {
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
        await db_1.db.insert(schema_1.applications).values({
            id: (0, uuid_1.v4)(),
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
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle('📩 Заявка отправлена')
                .setDescription('Ваша заявка успешно отправлена и ожидает рассмотрения администрацией. Мы свяжемся с вами в ближайшее время!')
                .setColor(discord_js_1.Colors.Green);
            await interaction.user.send({ embeds: [embed] });
        }
        catch (dmError) {
            console.error('❌ Ошибка при отправке ЛС:', dmError);
            dmStatusMsg = '(Не удалось отправить уведомление в ЛС, возможно они у вас закрыты)';
        }
        await interaction.reply({
            content: `Ваша заявка успешно отправлена! ${dmStatusMsg}`,
            ephemeral: true
        });
    }
    catch (error) {
        console.error('❌ Ошибка при сохранении заявки:', error);
        await interaction.reply({
            content: 'Произошла ошибка при сохранении заявки. Пожалуйста, сообщите администрации.',
            ephemeral: true
        });
    }
}
