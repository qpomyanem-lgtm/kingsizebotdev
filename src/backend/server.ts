import { config } from 'dotenv';
config({ path: '.env' });

import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { Server } from 'socket.io';
import { connectDB } from '../db';
import authRoutes from './routes/auth';
import settingsRoutes from './routes/settings';
import applicationRoutes from './routes/applications';
import memberRoutes from './routes/members';
import afkRoutes from './routes/afk';
import mapsRoutes from './routes/maps';
import activityRoutes from './routes/activity';

// Declare FastifyInstance to include io
declare module 'fastify' {
    interface FastifyInstance {
        io: Server;
    }
}

const server = fastify({ logger: false }); // Disable raw JSON logging

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

function getAllowedOrigins(): string[] {
    const origins = new Set<string>();

    // Legacy
    if (process.env.HOST_URL) origins.add(process.env.HOST_URL);

    // New split hosts
    if (process.env.PUBLIC_HOST_URL) origins.add(process.env.PUBLIC_HOST_URL);
    if (process.env.ADMIN_HOST_URL) origins.add(process.env.ADMIN_HOST_URL);

    // Local defaults
    origins.add('http://localhost:5173');
    origins.add('http://admin.localhost:5173');

    return [...origins];
}

async function start() {
    await connectDB();

    const allowedOrigins = getAllowedOrigins();
    await server.register(cors, {
        origin: (origin, cb) => {
            // allow non-browser requests
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error('Not allowed by CORS'), false);
        },
        credentials: true
    });

    await server.register(fastifyCookie);
    await server.register(authRoutes);
    await server.register(settingsRoutes);
    await server.register(applicationRoutes, { prefix: '/api/applications' });
    await server.register(memberRoutes, { prefix: '/api/members' });
    await server.register(afkRoutes, { prefix: '/api/afk' });
    await server.register(mapsRoutes, { prefix: '/api/maps' });
    await server.register(activityRoutes, { prefix: '/api/activity' });


    const io = new Server(server.server, {
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
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();
