"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const schema_1 = require("./schema");
const targetRoles = [
    { key: 'OWNER', name: 'Создатель семьи', requiresAdmin: true },
    { key: '.', name: 'Администратор', requiresAdmin: true },
    { key: 'DEP', name: 'Заместитель', requiresAdmin: true },
    { key: 'HIGH', name: 'Старший состав', requiresAdmin: true },
    { key: 'RECRUIT', name: 'Рекрут', requiresAdmin: true },
    { key: 'KINGSIZE', name: 'Член семьи', requiresAdmin: false },
    { key: 'NEWKINGSIZE', name: 'Новенький', requiresAdmin: false },
    { key: 'TIER CHECK', name: 'Проверяющий тиры', requiresAdmin: true },
    { key: 'TIER1', name: 'TIER 1', requiresAdmin: false },
    { key: 'TIER2', name: 'TIER 2', requiresAdmin: false },
    { key: 'TIER3', name: 'TIER 3', requiresAdmin: false },
    { key: 'BLACKLIST', name: 'Черный список', requiresAdmin: false },
];
async function seed() {
    try {
        await index_1.client.connect();
        console.log('✅ Connected to database for seeding...');
        for (const role of targetRoles) {
            // Upsert using raw SQL or just try inserting and ignore conflicts.
            // Drizzle supports onConflictDoNothing in pg.
            await index_1.db.insert(schema_1.roleSettings).values(role).onConflictDoNothing({ target: schema_1.roleSettings.key });
            console.log(`Seeded role: ${role.key}`);
        }
        console.log('🎉 Seeding successfully completed!');
    }
    catch (error) {
        console.error('❌ Error during seeding:', error);
    }
    finally {
        await index_1.client.end();
    }
}
seed();
