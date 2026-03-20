import { Client, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';

export async function loadCommands(client: Client) {
    console.log('🛠  Загрузка слеш-команд...');
    
    const commands: any[] = [];
    const commandsPath = path.join(__dirname, '../commands');
    
    if (fs.existsSync(commandsPath)) {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Загружена команда: ${command.data.name}`);
            } else {
                console.warn(`⚠️ [ВНИМАНИЕ] У команды в ${filePath} отсутствует обязательное поле "data" или "execute".`);
            }
        }
    }

    // Register commands via REST API
    if (commands.length > 0 && process.env.DISCORD_TOKEN && process.env.DISCORD_CLIENT_ID) {
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        try {
            console.log(`🔄 Начало регистрации ${commands.length} слеш-команд приложения.`);
            // Currently registering globally. For faster updates in dev, might want to register to a specific guild.
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands },
            );
            console.log(`✅ Успешная регистрация слеш-команд.`);
        } catch (error) {
            console.error('❌ Ошибка регистрации слеш-команд:', error);
        }
    }

    console.log('✅ Все команды успешно загружены!');
}
