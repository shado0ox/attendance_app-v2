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

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."electronic_documents" (
          "id" serial PRIMARY KEY,
          "company_id" text NOT NULL,
          "employee_id" text NOT NULL,
          "employee_name" text NOT NULL,
          "department_name" text DEFAULT '',
          "document_type" text NOT NULL DEFAULT 'permission',
          "status" text NOT NULL DEFAULT 'employee_signed',
          "version" text NOT NULL DEFAULT '1',
          "parent_document_id" text,
          "form_data" jsonb NOT NULL,
          "employee_signature" text NOT NULL,
          "employee_signed_at" timestamp,
          "manager_name" text,
          "manager_signature" text,
          "manager_signed_at" timestamp,
          "manager_decision" text,
          "review_reason" text,
          "share_token_hash" text,
          "share_expires_at" timestamp,
          "share_used_at" timestamp,
          "final_html" text,
          "created_at" timestamp DEFAULT NOW(),
          "updated_at" timestamp DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS electronic_documents_company_employee ON "${dbSchema}"."electronic_documents" ("company_id","employee_id","created_at");
        CREATE INDEX IF NOT EXISTS electronic_documents_share_token ON "${dbSchema}"."electronic_documents" ("share_token_hash");
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${dbSchema}"."electronic_document_audit" (
          "id" serial PRIMARY KEY,
          "company_id" text NOT NULL,
          "document_id" integer NOT NULL,
          "actor_id" text NOT NULL,
          "actor_role" text NOT NULL,
          "action" text NOT NULL,
          "details" jsonb DEFAULT '{}'::jsonb,
          "created_at" timestamp DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS electronic_document_audit_doc ON "${dbSchema}"."electronic_document_audit" ("company_id","document_id","created_at");
      `);

      await client.query(`CREATE TABLE IF NOT EXISTS "${dbSchema}".audit_log (
        id serial PRIMARY KEY, company_id text NOT NULL, actor_id text NOT NULL,
        actor_role text NOT NULL, action text NOT NULL, entity_id text,
        details jsonb NOT NULL, created_at timestamp DEFAULT NOW());
        CREATE INDEX IF NOT EXISTS audit_log_company_time ON "${dbSchema}".audit_log (company_id, created_at);
        CREATE INDEX IF NOT EXISTS attendance_employee_day ON "${dbSchema}".attendance (company_id, emp_id, date);`);

      await client.query(`CREATE TABLE IF NOT EXISTS "${dbSchema}".attendance_months (
        key text PRIMARY KEY, company_id text NOT NULL, month text NOT NULL, value jsonb NOT NULL);
        CREATE INDEX IF NOT EXISTS attendance_company_date ON "${dbSchema}".attendance (company_id, date);`);

      await client.query(`ALTER TABLE "${dbSchema}"."requests"
        ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS reviewed_by text,
        ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
        ADD COLUMN IF NOT EXISTS review_reason text;`);

      // Additive migration for existing installations; old punches stay untouched.
      await client.query(`ALTER TABLE "${dbSchema}"."attendance"
        ADD COLUMN IF NOT EXISTS check_in_location text,
        ADD COLUMN IF NOT EXISTS check_in_location_2 text,
        ADD COLUMN IF NOT EXISTS check_out_location text,
        ADD COLUMN IF NOT EXISTS check_out_location_2 text;`);

      await client.query(`ALTER TABLE "${dbSchema}"."companies" ADD COLUMN IF NOT EXISTS admin_email text DEFAULT ''; ALTER TABLE "${dbSchema}"."admins" ADD COLUMN IF NOT EXISTS email text DEFAULT '';`);
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

