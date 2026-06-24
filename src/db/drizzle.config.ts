import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

const connectionString = process.env.DATABASE_URL;
const isExternalDb = connectionString?.includes('supabase') || connectionString?.includes('neon') || connectionString?.includes('render') || process.env.SQL_HOST?.includes('supabase');

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: connectionString ? {
    url: connectionString,
    ssl: isExternalDb ? { rejectUnauthorized: false } : undefined,
  } : {
    host: process.env.SQL_HOST || "",
    user: process.env.SQL_ADMIN_USER || "",
    password: process.env.SQL_ADMIN_PASSWORD || "",
    database: process.env.SQL_DB_NAME || "",
    ssl: isExternalDb ? { rejectUnauthorized: false } : undefined,
  },
  verbose: true,
});
