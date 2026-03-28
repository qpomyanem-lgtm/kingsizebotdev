import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../../../db';
import { members, rolePermissions, roles, systemSettings, eventParticipants } from '../../../db/schema';
import { and, asc, eq, ne, isNotNull } from 'drizzle-orm';
import { invalidatePermissionCache, requirePermission } from '../../lib/discordRoles';
import { config } from 'dotenv';

config({ path: '.env' });
const DISCORD_API_BASE = 'https://discord.com/api/v10';

const ALLOWED_PERMISSIONS = new Set([
  'site:applications:view', 'site:application_settings:view', 'site:activity:view', 'site:guide:view',
  'site:members:view', 'site:afk:view', 'site:mcl:view', 'site:captures:view', 'site:mcl_maps:view',
  'site:archive:view', 'site:logs:view', 'site:kicked:view',
  'site:settings_server:view', 'site:settings_roles:view', 'site:settings_channels:view', 'site:settings_access:view',
  'site:applications:actions', 'site:application_settings:actions', 'site:activity:actions',
  'site:members:actions', 'site:afk:actions', 'site:mcl:actions', 'site:captures:actions',
  'site:mcl_maps:actions', 'site:kicked:actions',
  'site:settings_server:actions', 'site:settings_roles:actions', 'site:settings_channels:actions', 'site:settings_access:actions',
  'bot:ticket:apply', 'bot:event:create',
]);

export default async function settingsController(fastify: FastifyInstance) {
  // --- Roles ---

  fastify.get(
    '/api/settings/roles',
    { preHandler: [requirePermission('site:settings_roles:view')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = (req.query ?? {}) as { type?: 'system' | 'access'; systemType?: 'main' | 'new' | 'tier' | 'blacklist' };
        const all = await db.select().from(roles).orderBy(asc(roles.priority));
        let filtered = all;
        if (query.type) filtered = filtered.filter(r => r.type === query.type);
        if (query.systemType) filtered = filtered.filter(r => r.systemType === query.systemType);
        reply.send(filtered);
      } catch (error) {
        console.error('❌ Ошибка получения ролей:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.post(
    '/api/settings/roles',
    { preHandler: [requirePermission('site:settings_roles:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as {
          name?: string;
          discordRoleId?: string;
          color?: string;
          icon?: string;
        };

        if (!body?.name?.trim()) {
          return reply.status(400).send({ error: 'Name is required' });
        }

        const [maxPriorityRole] = await db.select().from(roles).orderBy(asc(roles.priority));
        const nextPriority = maxPriorityRole ? Math.max(...(await db.select().from(roles)).map(r => r.priority)) + 1 : 0;

        const [created] = await db.insert(roles).values({
          id: randomUUID(),
          name: body.name.trim(),
          discordRoleId: body.discordRoleId?.trim() || null,
          color: body.color || '#6366f1',
          icon: body.icon?.trim() || null,
          priority: nextPriority,
          type: 'none',
          systemType: null,
          isAdmin: false,
          canManageSettings: false,
          isEveryone: false,
        }).returning();

        invalidatePermissionCache();
        reply.status(201).send(created);
      } catch (error) {
        console.error('❌ Ошибка создания роли:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.patch(
    '/api/settings/roles/:id',
    { preHandler: [requirePermission('site:settings_roles:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const body = req.body as {
          name?: string;
          discordRoleId?: string | null;
          color?: string;
          icon?: string | null;
        };

        const [existing] = await db.select().from(roles).where(eq(roles.id, id));
        if (!existing) return reply.status(404).send({ error: 'Role not found' });

        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name.trim();
        if (body.discordRoleId !== undefined) updates.discordRoleId = body.discordRoleId?.trim() || null;
        if (body.color !== undefined) updates.color = body.color;
        if (body.icon !== undefined) updates.icon = body.icon?.trim() || null;

        if (Object.keys(updates).length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        const [updated] = await db.update(roles).set(updates).where(eq(roles.id, id)).returning();
        if (updated.type === 'access') invalidatePermissionCache();
        reply.send(updated);
      } catch (error) {
        console.error('❌ Ошибка обновления роли:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.delete(
    '/api/settings/roles/:id',
    { preHandler: [requirePermission('site:settings_roles:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const [existing] = await db.select().from(roles).where(eq(roles.id, id));
        if (!existing) return reply.status(404).send({ error: 'Role not found' });
        if (existing.isEveryone) {
          return reply.status(403).send({ error: '@everyone role cannot be deleted' });
        }

        await db.update(members).set({ roleId: null }).where(eq(members.roleId, id));
        await db.update(members).set({ tierRoleId: null }).where(eq(members.tierRoleId, id));
        await db.update(eventParticipants).set({ tierRoleId: null }).where(eq(eventParticipants.tierRoleId, id));
        await db.delete(roles).where(eq(roles.id, id));
        invalidatePermissionCache();
        reply.send({ success: true });
      } catch (error) {
        console.error('❌ Ошибка удаления роли:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.put(
    '/api/settings/roles/reorder',
    { preHandler: [requirePermission('site:settings_roles:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as { order?: Array<{ id: string; priority: number }> };
        if (!Array.isArray(body?.order)) return reply.status(400).send({ error: 'Invalid payload' });

        for (const item of body.order) {
          await db.update(roles).set({ priority: item.priority }).where(eq(roles.id, item.id));
        }

        invalidatePermissionCache();
        reply.send({ success: true });
      } catch (error) {
        console.error('❌ Ошибка изменения приоритетов:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.patch(
    '/api/settings/roles/:id/access',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const body = req.body as {
          type?: 'system' | 'access' | 'none';
          systemType?: 'main' | 'new' | 'tier' | 'blacklist' | 'interview' | null;
          isAdmin?: boolean;
          canManageSettings?: boolean;
        };

        const [existing] = await db.select().from(roles).where(eq(roles.id, id));
        if (!existing) return reply.status(404).send({ error: 'Role not found' });
        if (existing.isEveryone) return reply.status(400).send({ error: '@everyone cannot change type' });

        const updates: Record<string, unknown> = {};
        if (body.type !== undefined) updates.type = body.type;
        if (body.systemType !== undefined) updates.systemType = body.systemType;
        if (body.isAdmin !== undefined) updates.isAdmin = body.isAdmin;
        if (body.canManageSettings !== undefined) updates.canManageSettings = body.canManageSettings;

        if (Object.keys(updates).length === 0) return reply.status(400).send({ error: 'No fields to update' });

        const [updated] = await db.update(roles).set(updates).where(eq(roles.id, id)).returning();
        invalidatePermissionCache();
        reply.send(updated);
      } catch (error) {
        console.error('❌ Ошибка обновления access-полей:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.get(
    '/api/settings/roles/:id/permissions',
    { preHandler: [requirePermission('site:settings_access:view')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, id));
        reply.send(rows.map(r => r.permission));
      } catch (error) {
        console.error('❌ Ошибка получения permissions:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.put(
    '/api/settings/roles/:id/permissions',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = req.params as { id: string };
        const body = req.body as { permissions?: string[] };

        const [existing] = await db.select().from(roles).where(eq(roles.id, id));
        if (!existing) return reply.status(404).send({ error: 'Role not found' });

        const permissions = (body.permissions || []).filter(p => ALLOWED_PERMISSIONS.has(p));

        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (permissions.length > 0) {
          await db.insert(rolePermissions).values(
            permissions.map(permission => ({ id: randomUUID(), roleId: id, permission })),
          );
        }

        invalidatePermissionCache();
        reply.send({ success: true, permissions });
      } catch (error) {
        console.error('❌ Ошибка обновления permissions:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.get('/api/settings/admin-roles', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminRoles = (await db.select().from(roles))
        .filter(r => r.type === 'access' && r.isAdmin)
        .sort((a, b) => a.priority - b.priority)
        .map(r => ({ id: r.id, name: r.name }));

      reply.send(adminRoles);
    } catch (error) {
      console.error('❌ Ошибка получения admin roles:', error);
      reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // --- System settings ---

  // --- Public settings (no auth required) ---
  fastify.get(
    '/api/settings/public',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const rows = await db.select().from(systemSettings);
        const get = (key: string) => rows.find(r => r.key === key)?.value ?? null;
        reply.send({ familyName: get('FAMILY_NAME'), logoUrl: get('LOGO_URL') });
      } catch (error) {
        console.error('❌ Ошибка публичных настроек:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.get(
    '/api/settings/system',
    { preHandler: [requirePermission('site:settings_server:view')] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const settings = await db.select().from(systemSettings);
        reply.send(settings);
      } catch (error) {
        console.error('❌ Ошибка настроек:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  fastify.patch(
    '/api/settings/system',
    { preHandler: [requirePermission('site:settings_server:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as { updates?: Array<{ key: string; value: string | null }> };
        if (!Array.isArray(body?.updates)) return reply.status(400).send({ error: 'Invalid payload' });

        for (const update of body.updates) {
          const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, update.key));
          if (existing.length > 0) {
            await db.update(systemSettings).set({ value: update.value || null }).where(eq(systemSettings.key, update.key));
          } else {
            await db.insert(systemSettings).values({ key: update.key, value: update.value || null });
          }
        }

        // If APPLICATIONS_OPEN was changed, refresh the ticket panel in Discord
        const applicationsOpenUpdate = body.updates.find(u => u.key === 'APPLICATIONS_OPEN');
        if (applicationsOpenUpdate) {
          const IPC_BOT_BASE_URL = process.env.IPC_BOT_BASE_URL || 'http://localhost:3001';
          fetch(`${IPC_BOT_BASE_URL}/ipc/refresh-ticket-panel`, { method: 'POST' }).catch(() => {});
        }

        reply.send({ success: true });
      } catch (error) {
        console.error('❌ Ошибка настроек:', error);
        reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  // --- Sync members ---

  fastify.post(
    '/api/settings/sync-members',
    { preHandler: [requirePermission('site:settings_server:actions')] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const [guildRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'GUILD_ID'));
        const guildId = guildRow?.value?.trim();
        if (!guildId) return reply.status(400).send({ error: 'GUILD_ID не настроен' });

        const token = process.env.DISCORD_TOKEN;
        if (!token) return reply.status(500).send({ error: 'Токен бота не найден' });

        const systemRoles = (await db.select().from(roles)).filter(r => r.type === 'system');
        const mainRole = systemRoles.find(r => r.systemType === 'main');
        const newRole = systemRoles.find(r => r.systemType === 'new');
        const tierRoles = systemRoles.filter(r => r.systemType === 'tier').sort((a, b) => a.priority - b.priority);

        if (!mainRole?.discordRoleId && !newRole?.discordRoleId) {
          return reply.status(400).send({ error: 'MAIN/NEW роли не настроены' });
        }

        let allDiscordMembers: any[] = [];
        let after = '0';

        while (true) {
          const res = await fetch(
            `${DISCORD_API_BASE}/guilds/${guildId}/members?limit=1000&after=${after}`,
            { headers: { Authorization: `Bot ${token}` } },
          );

          if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ Ошибка получения участников:', res.status, errorText);
            return reply.status(500).send({ error: 'Не удалось получить участников с Discord API' });
          }

          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) break;
          allDiscordMembers.push(...data);

          if (data.length < 1000) break;
          after = data[data.length - 1].user.id;
        }

        const targetMembers = allDiscordMembers.filter(m => {
          const memberRoles: string[] = m.roles || [];
          const hasMain = !!(mainRole?.discordRoleId && memberRoles.includes(mainRole.discordRoleId));
          const hasNew = !!(newRole?.discordRoleId && memberRoles.includes(newRole.discordRoleId));
          return hasMain || hasNew;
        });

        const targetDiscordIds = new Set(targetMembers.map(m => m.user.id));
        const existingDbMembers = await db.select().from(members);

        let addedCount = 0;
        let updatedCount = 0;
        let kickedCount = 0;

        for (const m of targetMembers) {
          const memberRoles: string[] = m.roles || [];
          const roleId = mainRole?.discordRoleId && memberRoles.includes(mainRole.discordRoleId)
            ? mainRole.id
            : (newRole?.id || null);

          const matchedTierRole = tierRoles.find(t => !!t.discordRoleId && memberRoles.includes(t.discordRoleId));
          const tierRoleId = matchedTierRole?.id || null;

          const existingMember = existingDbMembers.find(dbM => dbM.discordId === m.user.id);

          if (!existingMember) {
            await db.insert(members).values({
              id: randomUUID(),
              discordId: m.user.id,
              discordUsername: m.user.username,
              discordAvatarUrl: m.user.avatar
                ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                : null,
              gameNickname: m.nick || m.user.global_name || m.user.username,
              gameStaticId: '0000',
              roleId,
              tierRoleId,
              status: 'active',
            });
            addedCount++;
          } else {
            const needsStatusUpdate = existingMember.status !== 'active';
            const needsRoleUpdate = existingMember.roleId !== roleId;
            const needsTierUpdate = existingMember.tierRoleId !== tierRoleId;

            if (needsStatusUpdate || needsRoleUpdate || needsTierUpdate) {
              await db.update(members).set({
                status: 'active',
                roleId,
                tierRoleId,
                discordUsername: m.user.username,
                discordAvatarUrl: m.user.avatar
                  ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                  : null,
              }).where(eq(members.discordId, m.user.id));
              updatedCount++;
            }
          }
        }

        for (const dbM of existingDbMembers) {
          if (dbM.status === 'active' && !targetDiscordIds.has(dbM.discordId)) {
            await db.update(members).set({ status: 'kicked', tierRoleId: null }).where(eq(members.id, dbM.id));
            kickedCount++;
          }
        }

        return reply.send({
          success: true,
          added: addedCount,
          updated: updatedCount,
          kicked: kickedCount,
          totalFound: targetMembers.length,
        });
      } catch (error) {
        console.error('❌ Ошибка синхронизации участников:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  // --- Template Export ---
  fastify.get(
    '/api/settings/template/export',
    { preHandler: [requirePermission('site:settings_access:view')] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const allRoles = await db.select().from(roles).orderBy(asc(roles.priority));
        const allPermissions = await db.select().from(rolePermissions);

        const permissionsByRoleId = new Map<string, string[]>();
        for (const p of allPermissions) {
          const arr = permissionsByRoleId.get(p.roleId) ?? [];
          arr.push(p.permission);
          permissionsByRoleId.set(p.roleId, arr);
        }

        const template = {
          version: 1,
          exportedAt: new Date().toISOString(),
          roles: allRoles.map(r => ({
            name: r.name,
            discordRoleId: r.discordRoleId,
            color: r.color,
            icon: r.icon,
            priority: r.priority,
            type: r.type,
            systemType: r.systemType,
            isAdmin: r.isAdmin,
            canManageSettings: r.canManageSettings,
            isEveryone: r.isEveryone,
            permissions: permissionsByRoleId.get(r.id) ?? [],
          })),
        };

        reply.header('Content-Disposition', 'attachment; filename="settings-template.json"');
        reply.header('Content-Type', 'application/json');
        return reply.send(template);
      } catch (error) {
        console.error('❌ Ошибка экспорта шаблона:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );

  // --- Template Import ---
  const templateRoleSchema = z.object({
    name: z.string().min(1),
    discordRoleId: z.string().nullable().optional(),
    color: z.string().default('#6366f1'),
    icon: z.string().nullable().optional(),
    priority: z.number().default(0),
    type: z.enum(['system', 'access', 'none']).default('none'),
    systemType: z.enum(['main', 'new', 'tier', 'blacklist', 'interview']).nullable().optional(),
    isAdmin: z.boolean().default(false),
    canManageSettings: z.boolean().default(false),
    isEveryone: z.boolean().default(false),
    permissions: z.array(z.string()).default([]),
  });

  const templateSchema = z.object({
    version: z.number(),
    roles: z.array(templateRoleSchema).min(1),
  });

  fastify.post(
    '/api/settings/template/import',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = templateSchema.parse(req.body);

        // 1. Nullify FK references in members and eventParticipants
        await db.update(members).set({ roleId: null }).where(isNotNull(members.roleId));
        await db.update(members).set({ tierRoleId: null }).where(isNotNull(members.tierRoleId));
        await db.update(eventParticipants).set({ tierRoleId: null }).where(isNotNull(eventParticipants.tierRoleId));

        // 2. Delete all permissions
        const existingRoles = await db.select({ id: roles.id }).from(roles);
        for (const role of existingRoles) {
          await db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
        }

        // 3. Delete all roles except @everyone
        await db.delete(roles).where(eq(roles.isEveryone, false));

        // 4. Import template roles
        let imported = 0;

        for (const tmplRole of body.roles) {
          const validPerms = tmplRole.permissions.filter(p => ALLOWED_PERMISSIONS.has(p));

          if (tmplRole.isEveryone) {
            const [everyoneRole] = await db.select().from(roles).where(eq(roles.isEveryone, true)).limit(1);
            if (everyoneRole) {
              await db.update(roles).set({
                type: tmplRole.type,
                systemType: tmplRole.systemType ?? null,
                isAdmin: tmplRole.isAdmin,
                canManageSettings: tmplRole.canManageSettings,
              }).where(eq(roles.id, everyoneRole.id));

              for (const perm of validPerms) {
                await db.insert(rolePermissions).values({ id: randomUUID(), roleId: everyoneRole.id, permission: perm });
              }
              imported++;
            }
            continue;
          }

          const roleId = randomUUID();
          await db.insert(roles).values({
            id: roleId,
            name: tmplRole.name,
            discordRoleId: tmplRole.discordRoleId || null,
            color: tmplRole.color,
            icon: tmplRole.icon || null,
            priority: tmplRole.priority,
            type: tmplRole.type,
            systemType: tmplRole.systemType ?? null,
            isAdmin: tmplRole.isAdmin,
            canManageSettings: tmplRole.canManageSettings,
            isEveryone: false,
          });

          for (const perm of validPerms) {
            await db.insert(rolePermissions).values({ id: randomUUID(), roleId, permission: perm });
          }
          imported++;
        }

        invalidatePermissionCache();
        return reply.send({ success: true, imported });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Невалидный формат шаблона', details: error.errors });
        }
        console.error('❌ Ошибка импорта шаблона:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  );
}
