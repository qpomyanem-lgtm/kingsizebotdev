import { db, client } from './index';
import { roles, rolePermissions } from './schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

// All available permission keys
const ALL_SITE_VIEW = [
  'site:applications:view','site:application_settings:view','site:activity:view','site:guide:view',
  'site:members:view','site:afk:view','site:mcl:view','site:captures:view','site:mcl_maps:view',
  'site:archive:view','site:logs:view','site:kicked:view',
  'site:settings_server:view','site:settings_roles:view','site:settings_channels:view','site:settings_access:view',
];
const ALL_SITE_ACTIONS = [
  'site:applications:actions','site:application_settings:actions','site:activity:actions',
  'site:members:actions','site:afk:actions','site:mcl:actions','site:captures:actions',
  'site:mcl_maps:actions','site:kicked:actions',
  'site:settings_server:actions','site:settings_roles:actions','site:settings_channels:actions','site:settings_access:actions',
];
const ALL_BOT = [
  'bot:event:create',
];

const ALL_PERMISSIONS = [...ALL_SITE_VIEW, ...ALL_SITE_ACTIONS, ...ALL_BOT];

interface SeedRole {
  name: string;
  color: string;
  icon?: string;
  priority: number;
  type: 'system' | 'access';
  systemType?: 'main' | 'new' | 'tier' | 'blacklist';
  isAdmin?: boolean;
  canManageSettings?: boolean;
  isEveryone?: boolean;
  permissions?: string[];
}

const seedRoles: SeedRole[] = [];


async function seed() {
  try {
    await client.connect();
    console.log('✅ Connected to database for seeding...');

    for (const role of seedRoles) {
      const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, role.name));
      if (existing) {
        console.log(`Role already exists: ${role.name}, skipping.`);
        continue;
      }

      const roleId = uuid();
      await db.insert(roles).values({
        id: roleId,
        name: role.name,
        color: role.color,
        icon: role.icon ?? null,
        priority: role.priority,
        type: role.type,
        systemType: role.systemType ?? null,
        isAdmin: role.isAdmin ?? false,
        canManageSettings: role.canManageSettings ?? false,
        isEveryone: role.isEveryone ?? false,
      });

      if (role.permissions) {
        for (const perm of role.permissions) {
          await db.insert(rolePermissions).values({
            id: uuid(),
            roleId,
            permission: perm,
          });
        }
      }
      console.log(`Seeded role: ${role.name} (${role.permissions?.length ?? 0} permissions)`);
    }

    console.log('🎉 Seeding successfully completed!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
  } finally {
    await client.end();
  }
}

seed();
