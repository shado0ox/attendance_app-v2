import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { eq, sql } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index';
const directory = await fs.mkdtemp(path.join(tmpdir(), 'app-installation-ci-')), secret = 'app-installation-ci-secret';
const [previous] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, 'appInstallation'));
const child = spawn(process.execPath, ['--import', './tests/mockResend.mjs', 'dist/server.cjs'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: secret, BACKUP_ENABLED: 'false', BACKUP_DIR: directory, ATTENDANCE_WHATSAPP_ENABLED: 'false', ATTENDANCE_PUSH_ENABLED: 'false', ATTENDANCE_TEST_EMAIL_CAPTURE: path.join(directory, 'mail.jsonl') }, stdio: 'inherit' });
const request = (body?: any, role?: string) => fetch('http://127.0.0.1:3011/api/app-installation', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: 'Bearer ' + jwt.sign({ role, companyId: 'default' }, secret) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
try {
  let ready = false; for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:3011/api/health/live')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); } assert.ok(ready);
  await db.delete(schema.systemData).where(eq(schema.systemData.key, 'appInstallation'));
  assert.deepEqual(await (await request()).json(), { appStoreUrl: '', playStoreUrl: '' });
  const links = { appStoreUrl: 'https://apps.apple.com/sa/app/wafr/id123456789', playStoreUrl: 'https://play.google.com/store/apps/details?id=com.wafr.attendance' };
  assert.equal((await request(links)).status, 401);
  assert.equal((await request(links, 'admin')).status, 403);
  assert.equal((await request(links, 'employee')).status, 403);
  assert.equal((await request({ ...links, appStoreUrl: 'https://example.com/app' }, 'superadmin')).status, 400);
  assert.equal((await request(links, 'superadmin')).status, 200);
  assert.deepEqual(await (await request()).json(), links, 'public route returns only the approved store URLs');
  assert.equal((await request({ appStoreUrl: '', playStoreUrl: '' }, 'superadmin')).status, 200);
  assert.deepEqual(await (await request()).json(), { appStoreUrl: '', playStoreUrl: '' }, 'clearing URLs restores browser guide');
  console.log('App installation public links and platform-only configuration passed');
} finally {
  child.kill('SIGTERM'); await new Promise(resolve => child.exitCode !== null ? resolve(null) : child.once('exit', resolve));
  await db.delete(schema.systemData).where(eq(schema.systemData.key, 'appInstallation')); if (previous) await db.insert(schema.systemData).values({ key: previous.key, value: previous.value });
  await db.delete(schema.auditLog).where(sql`${schema.auditLog.action} = 'app.installation.links' AND ${schema.auditLog.companyId} = 'default'`);
  await pool.end(); await fs.rm(directory, { recursive: true, force: true });
}
