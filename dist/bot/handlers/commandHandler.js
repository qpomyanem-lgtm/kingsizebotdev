"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCommands = loadCommands;
const discord_js_1 = require("discord.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function loadCommands(client) {
    console.log('🛠  Загрузка слеш-команд...');
    const commands = [];
    const commandsPath = path_1.default.join(__dirname, '../commands');
    if (fs_1.default.existsSync(commandsPath)) {
        const commandFiles = fs_1.default.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path_1.default.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Загружена команда: ${command.data.name}`);
            }
            else {
                console.warn(`⚠️ [ВНИМАНИЕ] У команды в ${filePath} отсутствует обязательное поле "data" или "execute".`);
            }
        }
    }
    // Register commands via REST API
    if (commands.length > 0 && process.env.DISCORD_TOKEN && process.env.DISCORD_CLIENT_ID) {
        const rest = new discord_js_1.REST().setToken(process.env.DISCORD_TOKEN);
        try {
            console.log(`🔄 Начало регистрации ${commands.length} слеш-команд приложения.`);
            // Currently registering globally. For faster updates in dev, might want to register to a specific guild.
            await rest.put(discord_js_1.Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
            console.log(`✅ Успешная регистрация слеш-команд.`);
        }
        catch (error) {
            console.error('❌ Ошибка регистрации слеш-команд:', error);
        }
    }
    console.log('✅ Все команды успешно загружены!');
}
