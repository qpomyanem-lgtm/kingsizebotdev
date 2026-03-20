import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { config } from 'dotenv';

config({ path: '.env' });

export const client = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20
});

export const db = drizzle(client, { schema });

export const connectDB = async () => {
    try {
        const check = await client.connect();
        check.release();
        console.log('✅ Успешное подключение к PostgreSQL базе данных');
    } catch (error) {
        console.error('❌ Ошибка подключения к базе данных:', error);
        process.exit(1);
    }
};
