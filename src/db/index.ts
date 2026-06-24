import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  const isExternalDb = connectionString?.includes('supabase') || connectionString?.includes('neon') || connectionString?.includes('render') || process.env.SQL_HOST?.includes('supabase');
  
  console.log('--- DATABASE CONNECTION POOL INITIALIZATION ---');
  console.log('Current CWD:', process.cwd());
  console.log('Environment DATABASE_URL exists:', !!connectionString);
  if (connectionString) {
    console.log('DATABASE_URL starts with:', connectionString.substring(0, 45) + '...');
  }
  console.log('Environment SQL_HOST:', process.env.SQL_HOST);
  console.log('Is external DB identified:', isExternalDb);
  console.log('------------------------------------------------');

  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: isExternalDb ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 15000,
    });
  }

  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    ssl: isExternalDb ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });
export { schema };
