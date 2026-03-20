"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: '.env' });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const socket_io_1 = require("socket.io");
const db_1 = require("../db");
const auth_1 = __importDefault(require("./routes/auth"));
const settings_1 = __importDefault(require("./routes/settings"));
const applications_1 = __importDefault(require("./routes/applications"));
const members_1 = __importDefault(require("./routes/members"));
const afk_1 = __importDefault(require("./routes/afk"));
const maps_1 = __importDefault(require("./routes/maps"));
const activity_1 = __importDefault(require("./routes/activity"));
const server = (0, fastify_1.default)({ logger: false }); // Disable raw JSON logging
server.addHook('onRequest', (request, reply, done) => {
    // Log incoming requests in beautiful Russian format (skipping repetitive preflight/polling if desired)
    if (!request.url.includes('/socket.io/')) {
        console.log(`🌐 [HTTP] Входящий запрос: ${request.method} ${request.url}`);
    }
    done();
});
server.addHook('onResponse', (request, reply, done) => {
    if (!request.url.includes('/socket.io/')) {
        const time = Math.round(reply.getResponseTime());
        console.log(`✅ [HTTP] Ответ сервера: ${request.method} ${request.url} - Статус: ${reply.statusCode} (${time}мс)`);
    }
    done();
});
function getAllowedOrigins() {
    const origins = new Set();
    // Legacy
    if (process.env.HOST_URL)
        origins.add(process.env.HOST_URL);
    // New split hosts
    if (process.env.PUBLIC_HOST_URL)
        origins.add(process.env.PUBLIC_HOST_URL);
    if (process.env.ADMIN_HOST_URL)
        origins.add(process.env.ADMIN_HOST_URL);
    // Local defaults
    origins.add('http://localhost:5173');
    origins.add('http://admin.localhost:5173');
    return [...origins];
}
async function start() {
    await (0, db_1.connectDB)();
    const allowedOrigins = getAllowedOrigins();
    await server.register(cors_1.default, {
        origin: (origin, cb) => {
            // allow non-browser requests
            if (!origin)
                return cb(null, true);
            if (allowedOrigins.includes(origin))
                return cb(null, true);
            return cb(new Error('Not allowed by CORS'), false);
        },
        credentials: true
    });
    await server.register(cookie_1.default);
    await server.register(auth_1.default);
    await server.register(settings_1.default);
    await server.register(applications_1.default, { prefix: '/api/applications' });
    await server.register(members_1.default, { prefix: '/api/members' });
    await server.register(afk_1.default, { prefix: '/api/afk' });
    await server.register(maps_1.default, { prefix: '/api/maps' });
    await server.register(activity_1.default, { prefix: '/api/activity' });
    const io = new socket_io_1.Server(server.server, {
        cors: {
            origin: process.env.HOST_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });
    server.decorate('io', io);
    io.on('connection', (socket) => {
        console.log(`🔌 Клиент подключен: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`🔌 Клиент отключен: ${socket.id}`);
        });
    });
    try {
        const port = Number(process.env.PORT) || 3000;
        const host = process.env.HOST || '0.0.0.0';
        await server.listen({ port, host });
        console.log(`🚀 Бэкенд сервер запущен на http://${host}:${port}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}
start();
