/**
 * Legacy migration placeholder.
 *
 * The project now uses unified `roles` + `role_permissions` tables.
 * Role migration is handled by SQL migrations in /drizzle.
 */
import { db, client } from './index';
import { roles } from './schema';

async function migrate() {
  try {
    await client.connect();
    const totalRoles = await db.select().from(roles);
    console.log(`✅ Unified roles schema detected. Roles in DB: ${totalRoles.length}`);
    console.log('ℹ️ Дополнительная миграция не требуется.');
  } catch (error) {
    console.error('❌ Error during migration:', error);
  } finally {
    await client.end();
  }
}

migrate();
