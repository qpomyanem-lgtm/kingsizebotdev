import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateState, OAuth2RequestError } from 'arctic';
import { config } from 'dotenv';

config({ path: '.env' });

import { lucia, createDiscordAuth } from '../../auth/lucia';
import { getAdminRoleLabel, hasAdminPanelAccess, hasPanelAccess, hasRoleSettingsAccess, getUserPermissions, invalidateUserCache } from '../../lib/discordRoles';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

// One-time codes for transferring sessions across domains
const pendingSessionCodes = new Map<string, { sessionId: string; discordId: string; expires: number }>();

// Cleanup expired codes every 60s
setInterval(() => {
    const now = Date.now();
    for (const [code, data] of pendingSessionCodes) {
        if (now > data.expires) pendingSessionCodes.delete(code);
    }
}, 60_000);

export default async function authController(fastify: FastifyInstance) {
    const getRequestOrigin = (req: FastifyRequest) => {
        const protoHeader = (req.headers['x-forwarded-proto'] as string | undefined);
        const proto = protoHeader ? protoHeader.split(',')[0] : 'http';
        const host = req.headers.host;
        return `${proto}://${host}`;
    };

    const isSecureRequest = (req: FastifyRequest) => {
        const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0];
        return proto === 'https';
    };

    fastify.get('/api/auth/discord', async (req: FastifyRequest, reply: FastifyReply) => {
        const query = req.query as { origin?: string };
        const destOrigin = query.origin || process.env.ADMIN_HOST_URL || 'http://admin.localhost:5173';
        const state = generateState();
        const origin = getRequestOrigin(req);
        const redirectUri = `${origin}/api/auth/discord/callback`;
        const discordAuth = createDiscordAuth(redirectUri);
        const url = await discordAuth.createAuthorizationURL(state, null, ['identify']);

        const secure = isSecureRequest(req);

        reply.setCookie('discord_oauth_state', state, {
            path: '/',
            secure,
            httpOnly: true,
            maxAge: 60 * 10,
            sameSite: 'lax',
        });

        reply.setCookie('discord_oauth_dest', destOrigin, {
            path: '/',
            secure,
            httpOnly: true,
            maxAge: 60 * 10,
            sameSite: 'lax',
        });

        reply.redirect(url.toString());
    });

    fastify.get('/api/auth/discord/callback', async (req: FastifyRequest, reply: FastifyReply) => {
        const query = req.query as { code?: string; state?: string };
        const code = query.code;
        const state = query.state;
        const storedState = req.cookies.discord_oauth_state ?? null;

        if (!code || !state || !storedState || state !== storedState) {
            return reply.status(400).send({ error: 'Invalid state or code' });
        }

        try {
            const origin = getRequestOrigin(req);
            const redirectUri = `${origin}/api/auth/discord/callback`;
            const discordAuth = createDiscordAuth(redirectUri);
            const tokens = await discordAuth.validateAuthorizationCode(code, null);

            const accessToken =
                typeof tokens.accessToken === 'function' ? tokens.accessToken() : tokens.accessToken;

            const discordUserResponse = await fetch('https://discord.com/api/users/@me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            const discordUser = await discordUserResponse.json();

            if (!discordUser.id) {
                console.error('❌ Не удалось получить Discord ID:', discordUser);
                return reply.redirect(`${process.env.HOST_URL}/login?error=OAuthFailed`);
            }

            const existingUser = await db.select().from(users).where(eq(users.discordId, discordUser.id));

            let userId: string;
            if (existingUser.length > 0) {
                userId = existingUser[0].id;
                await db
                    .update(users)
                    .set({
                        username: discordUser.username,
                        avatarUrl: discordUser.avatar
                            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                            : null,
                    })
                    .where(eq(users.id, userId));
            } else {
                userId = uuid();
                await db.insert(users).values({
                    id: userId,
                    discordId: discordUser.id,
                    username: discordUser.username,
                    avatarUrl: discordUser.avatar
                        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                        : null,
                    role: 'user',
                });
            }

            const session = await lucia.createSession(userId, {});

            const destOrigin = req.cookies.discord_oauth_dest || process.env.ADMIN_HOST_URL || 'http://admin.localhost:5173';

            // Clear OAuth cookies
            reply.setCookie('discord_oauth_dest', '', { path: '/', maxAge: 0 });
            reply.setCookie('discord_oauth_state', '', { path: '/', maxAge: 0 });

            // Generate a one-time code and redirect through the destination's proxy
            // so the session cookie gets set on the correct domain
            const oneTimeCode = uuid();
            pendingSessionCodes.set(oneTimeCode, {
                sessionId: session.id,
                discordId: discordUser.id,
                expires: Date.now() + 30_000, // 30 seconds
            });

            return reply.redirect(`${destOrigin}/api/auth/complete?code=${oneTimeCode}`);
        } catch (e: any) {
            console.error('❌ Детали ошибки OAuth:', e);
            if (e instanceof OAuth2RequestError) {
                return reply.status(400).send({ error: 'OAuth Request Error', details: e.message });
            }
            console.error('❌ Ошибка авторизации:', e);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // One-time code exchange: sets the session cookie on the requesting domain
    fastify.get('/api/auth/complete', async (req: FastifyRequest, reply: FastifyReply) => {
        const { code } = req.query as { code?: string };
        if (!code) {
            return reply.status(400).send({ error: 'Missing code' });
        }

        const pending = pendingSessionCodes.get(code);
        if (!pending || Date.now() > pending.expires) {
            pendingSessionCodes.delete(code!);
            return reply.redirect('/login?error=SessionExpired');
        }

        pendingSessionCodes.delete(code);

        // Check panel access with fresh Discord roles (no cache).
        // This is done here — not in the OAuth callback — to avoid
        // consuming the Discord OAuth code a second time on retries.
        const botOwnerId2 = process.env.BOT_OWNER_ID;
        const isOwner2 = botOwnerId2 && pending.discordId === botOwnerId2.trim();
        if (!isOwner2) {
            invalidateUserCache(pending.discordId);
            const hasAccess = await hasPanelAccess(pending.discordId);
            if (!hasAccess) {
                await lucia.invalidateSession(pending.sessionId);
                return reply.redirect('/login?error=NoPanelAccess');
            }
        }

        const sessionCookie = lucia.createSessionCookie(pending.sessionId);
        reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
        return reply.redirect('/');
    });

    fastify.get('/api/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
        const sessionId = lucia.readSessionCookie(req.headers.cookie ?? '');
        if (!sessionId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        let session: Awaited<ReturnType<typeof lucia.validateSession>>['session'];
        let user: Awaited<ReturnType<typeof lucia.validateSession>>['user'];
        try {
            ({ session, user } = await lucia.validateSession(sessionId));
        } catch (e) {
            // Session cookie can be stale/invalid (e.g. after config changes).
            // We must not crash the API with 500; treat it as "logged out".
            console.error('❌ validateSession failed:', e);
            const sessionCookie = lucia.createBlankSessionCookie();
            reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        if (!session || !user) {
            const sessionCookie = lucia.createBlankSessionCookie();
            reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        if (session && session.fresh) {
            const sessionCookie = lucia.createSessionCookie(session.id);
            reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
        }

        const botOwnerId = process.env.BOT_OWNER_ID;
        const isOwner = botOwnerId && user.discordId === botOwnerId.trim();

        // Always verify access rights on every /api/auth/me call.
        // This is the final gatekeeper: even if bot failed to delete the session,
        // a user without any access roles gets kicked here.
        if (!isOwner) {
            const hasAccess = await hasPanelAccess(user.discordId);
            if (!hasAccess) {
                await lucia.invalidateSession(session.id);
                const sessionCookie = lucia.createBlankSessionCookie();
                reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
                return reply.status(401).send({ error: 'Unauthorized' });
            }
        }

        let role = user.role;
        if (isOwner) {
            role = 'owner';
        } else {
            role = 'admin';
        }

        const [roleSettingsAccess, roleLabel, permissions] = await Promise.all([
            hasRoleSettingsAccess(user.discordId),
            getAdminRoleLabel(user.discordId),
            getUserPermissions(user.discordId),
        ]);

        reply.send({ user: { ...user, role, roleSettingsAccess, roleLabel, permissions } });
    });

    fastify.post('/api/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
        const sessionId = lucia.readSessionCookie(req.headers.cookie ?? '');
        if (!sessionId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        await lucia.invalidateSession(sessionId);
        const sessionCookie = lucia.createBlankSessionCookie();
        reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
        reply.send({ success: true });
    });
}

