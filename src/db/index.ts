import dotenv from 'dotenv';
dotenv.config({ override: true });
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  const isExternalDb = connectionString?.includes('supabase') || connectionString?.includes('neon') || connectionString?.includes('render') || process.env.SQL_HOST?.includes('supabase');
  
  console.log('Initializing database pool:', {
    hasConnectionString: !!connectionString,
    connectionStringPrefix: connectionString ? connectionString.substring(0, 25) + '...' : undefined,
    host: process.env.SQL_HOST,
    isExternalDb
  });

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
