import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { db } from '../../../db';
import { rolePermissions, roles as rolesTable } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { requirePermission, invalidatePermissionCache } from '../../lib/discordRoles';

// Full permission catalog — must stay in sync with seed.ts
const ALL_PERMISSIONS = [
  // Site view
  'site:applications:view','site:application_settings:view','site:activity:view','site:guide:view',
  'site:members:view','site:afk:view','site:mcl:view','site:captures:view','site:mcl_maps:view',
  'site:archive:view','site:logs:view','site:kicked:view',
  'site:settings_server:view','site:settings_roles:view','site:settings_channels:view','site:settings_access:view',
  // Site actions
  'site:applications:actions','site:application_settings:actions','site:activity:actions',
  'site:members:actions','site:afk:actions','site:mcl:actions','site:captures:actions',
  'site:mcl_maps:actions','site:kicked:actions',
  'site:settings_server:actions','site:settings_roles:actions','site:settings_channels:actions','site:settings_access:actions',
  // Bot
  'bot:ticket:apply','bot:event:create',
];

export default async function accessController(server: FastifyInstance) {
  // GET /api/access-roles — list all roles with their permissions
  server.get(
    '/',
    { preHandler: [requirePermission('site:settings_access:view')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const allRoles = await db.select().from(rolesTable);
      const perms = await db.select().from(rolePermissions);

      const accessRows = allRoles.filter(r => r.type === 'access').sort((a, b) => a.priority - b.priority);

      const permsByRole = new Map<string, string[]>();
      for (const p of perms) {
        const arr = permsByRole.get(p.roleId) ?? [];
        arr.push(p.permission);
        permsByRole.set(p.roleId, arr);
      }

      const result = accessRows.map(r => ({
        ...r,
        permissions: permsByRole.get(r.id) ?? [],
      }));

      return reply.send(result);
    },
  );

  // GET /api/access-roles/permissions-catalog — list all available permission keys
  server.get(
    '/permissions-catalog',
    { preHandler: [requirePermission('site:settings_access:view')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(ALL_PERMISSIONS);
    },
  );

  // POST /api/access-roles — create a new role
  server.post(
    '/',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        name?: string;
        discordRoleId?: string;
        color?: string;
        priority?: number;
        isAdmin?: boolean;
        canManageSettings?: boolean;
        permissions?: string[];
      };

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({ error: 'Name is required' });
      }

      const [role] = await db
        .insert(rolesTable)
        .values({
          id: randomUUID(),
          name: body.name.trim(),
          discordRoleId: body.discordRoleId?.trim() || null,
          color: body.color || '#6366f1',
          priority: body.priority ?? 0,
          type: 'access',
          isAdmin: body.isAdmin ?? false,
          canManageSettings: body.canManageSettings ?? false,
          systemType: null,
          isEveryone: false,
        })
        .returning();

      // Insert permissions
      const validPerms = (body.permissions ?? []).filter(p => ALL_PERMISSIONS.includes(p));
      if (validPerms.length > 0) {
        await db.insert(rolePermissions).values(
          validPerms.map(p => ({ id: randomUUID(), roleId: role.id, permission: p })),
        );
      }

      invalidatePermissionCache();

      return reply.status(201).send({ ...role, permissions: validPerms });
    },
  );

  // PATCH /api/access-roles/:id — update role metadata
  server.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as {
        name?: string;
        discordRoleId?: string | null;
        color?: string;
        priority?: number;
        isAdmin?: boolean;
        canManageSettings?: boolean;
      };

      const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
      if (!existing) return reply.status(404).send({ error: 'Role not found' });
      if (existing.type !== 'access') return reply.status(400).send({ error: 'Only access roles can be edited here' });

      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.discordRoleId !== undefined) updates.discordRoleId = body.discordRoleId?.trim() || null;
      if (body.color !== undefined) updates.color = body.color;
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.isAdmin !== undefined) updates.isAdmin = body.isAdmin;
      if (body.canManageSettings !== undefined) updates.canManageSettings = body.canManageSettings;

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }

      const [updated] = await db.update(rolesTable).set(updates).where(eq(rolesTable.id, id)).returning();
      invalidatePermissionCache();

      return reply.send(updated);
    },
  );

  // PUT /api/access-roles/:id/permissions — replace all permissions for a role
  server.put<{ Params: { id: string } }>(
    '/:id/permissions',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as { permissions?: string[] };

      const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
      if (!existing) return reply.status(404).send({ error: 'Role not found' });
      if (existing.type !== 'access') return reply.status(400).send({ error: 'Only access roles can be edited here' });

      const validPerms = (body.permissions ?? []).filter(p => ALL_PERMISSIONS.includes(p));

      // Delete old and insert new
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (validPerms.length > 0) {
        await db.insert(rolePermissions).values(
          validPerms.map(p => ({ id: randomUUID(), roleId: id, permission: p })),
        );
      }

      invalidatePermissionCache();

      return reply.send({ permissions: validPerms });
    },
  );

  // DELETE /api/access-roles/:id — delete a role (cascade deletes permissions)
  server.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePermission('site:settings_access:actions')] },
    async (request, reply) => {
      const { id } = request.params;

      const [existing] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
      if (!existing) return reply.status(404).send({ error: 'Role not found' });
      if (existing.isEveryone || existing.type !== 'access') {
        return reply.status(400).send({ error: 'Role cannot be deleted here' });
      }

      await db.delete(rolesTable).where(eq(rolesTable.id, id));
      invalidatePermissionCache();

      return reply.send({ success: true });
    },
  );
}
