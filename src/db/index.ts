import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';

export const getDbSchemaName = () => {
  return process.env.DB_SCHEMA || 'shift_app';
};

export const isLocalOrPrivateHost = (hostOrUrl?: string) => {
  if (!hostOrUrl) return false;
  const lower = hostOrUrl.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('::1') ||
    lower.includes('192.168.') ||
    lower.includes('10.') ||
    lower.includes('172.16.')
  );
};

export const createPool = () => {
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && (connectionString.includes('cmccnjkusdcqbpbkclke.supabase.co') || connectionString.includes('cmccnjkusdcqbpbkclke'))) {
    connectionString = undefined;
  }

  const dbSchema = getDbSchemaName();
  
  let useSsl: boolean | { rejectUnauthorized: boolean } = false;
  if (process.env.DB_SSL === 'true') {
    useSsl = { rejectUnauthorized: false };
  } else if (process.env.DB_SSL === 'false') {
    useSsl = false;
  } else {
    const isCloudProvider =
      connectionString?.includes('supabase') ||
      connectionString?.includes('neon') ||
      connectionString?.includes('render') ||
      process.env.SQL_HOST?.includes('supabase');
      
    const isLocal = isLocalOrPrivateHost(connectionString || process.env.SQL_HOST);
    if (isCloudProvider && !isLocal) {
      useSsl = { rejectUnauthorized: false };
    } else {
      useSsl = false;
    }
  }

  console.log('--- POSTGRESQL DATABASE POOL INITIALIZATION ---');
  console.log('Environment DATABASE_URL exists:', !!connectionString);
  if (connectionString) {
    console.log('DATABASE_URL prefix:', connectionString.substring(0, 45) + '...');
  }
  console.log('Target SQL Host:', process.env.SQL_HOST || (connectionString ? 'via connection string' : 'localhost'));
  console.log('Target SQL Database:', process.env.SQL_DB_NAME || 'default');
  console.log('Target DB Schema Isolation:', dbSchema);
  console.log('SSL Configuration:', useSsl ? 'Enabled' : 'Disabled (Local Server standard)');
  console.log('------------------------------------------------');

  const options = `-c search_path=${dbSchema},public`;

  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      options,
      connectionTimeoutMillis: 4000,
    });
  }

  return new Pool({
    host: process.env.SQL_HOST || 'localhost',
    port: parseInt(process.env.SQL_PORT || '5432', 10),
    user: process.env.SQL_USER || 'postgres',
    password: process.env.SQL_PASSWORD || '',
    database: process.env.SQL_DB_NAME || 'postgres',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    options,
    connectionTimeoutMillis: 4000,
  });
};

export const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const initializeSchemaAndTables = async () => {
  const dbSchema = getDbSchemaName();
  try {
    const client = await pool.connect();
    try {
      console.log(`[DB INIT] Ensuring schema "${dbSchema}" exists...`);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${dbSchema}";`);
      await client.query(`SET search_path TO "${dbSchema}", public;`);

      console.log(`[DB INIT] Creating application tables inside schema "${dbSchema}" if missing...`);
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."companies" (
          "id" text PRIMARY KEY,
          "name" text NOT NULL,
          "logo_url" text DEFAULT '',
          "subscription_status" text DEFAULT 'active',
          "subscription_expires_at" timestamp,
          "monthly_fee" text DEFAULT '100',
          "admin_username" text NOT NULL,
          "admin_password" text NOT NULL,
          "company_code" text DEFAULT '0',
          "created_at" timestamp DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."system_data" (
          "id" serial PRIMARY KEY,
          "key" text NOT NULL UNIQUE,
          "value" jsonb NOT NULL,
          "updated_at" timestamp DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."admins" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "username" text NOT NULL,
          "password" text NOT NULL,
          "company_id" text DEFAULT 'default',
          "created_at" timestamp DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."attendance" (
          "id" serial PRIMARY KEY,
          "emp_id" text NOT NULL,
          "emp_name" text NOT NULL,
          "dept" text DEFAULT '',
          "date" text NOT NULL,
          "company_id" text DEFAULT 'default',
          "check_in" text,
          "check_in_ts" text,
          "check_out" text,
          "check_out_ts" text,
          "check_in_lat" double precision,
          "check_in_lng" double precision,
          "check_in_2" text,
          "check_in_ts_2" text,
          "check_out_2" text,
          "check_out_ts_2" text,
          "check_in_lat_2" double precision,
          "check_in_lng_2" double precision,
          "status" text DEFAULT 'present',
          "source" text DEFAULT 'المقر',
          "note" text DEFAULT '',
          "created_at" timestamp DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."registration_requests" (
          "id" serial PRIMARY KEY,
          "name" text NOT NULL,
          "type" text NOT NULL,
          "username" text DEFAULT '',
          "phone" text NOT NULL,
          "password" text NOT NULL,
          "status" text DEFAULT 'pending',
          "company_id" text DEFAULT 'default',
          "created_at" timestamp DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."requests" (
          "id" serial PRIMARY KEY,
          "emp_id" text NOT NULL,
          "emp_name" text NOT NULL,
          "dept" text DEFAULT '',
          "date" text NOT NULL,
          "type" text NOT NULL,
          "notes" text DEFAULT '',
          "status" text DEFAULT 'pending',
          "company_id" text DEFAULT 'default',
          "swap_with_emp_id" text,
          "swap_with_emp_name" text,
          "target_shift" text,
          "check_in_time" text,
          "check_out_time" text,
          "created_at" timestamp DEFAULT NOW()
        );
      `);

      console.log(`[DB INIT] Schema "${dbSchema}" and tables initialized successfully.`);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`[DB INIT WARNING] Failed to auto-initialize schema/tables:`, err?.message || err);
  }
};

export const db = drizzle(pool, { schema });
export { schema };

