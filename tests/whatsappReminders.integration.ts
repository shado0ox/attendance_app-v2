import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import express from 'express';
import { db, schema, pool } from '../src/db/index';
import { eq, sql } from 'drizzle-orm';
import { registerWhatsAppReminders } from '../src/server/whatsappReminders';
import { fullAdminAccess } from '../src/lib/adminAccess';
import { whatsappDefaults } from '../src/lib/whatsappReminders';
const directory = await fs.mkdtemp(path.join(tmpdir(), 'whatsapp-ci-'));
const secret = 'whatsapp-ci-secret', companyId = 'whatsapp-ci-a', otherCompany = 'whatsapp-ci-b', employeeId = 'whatsapp-ci-employee';
const child = spawn(process.execPath, ['--import', './tests/mockResend.mjs', 'dist/server.cjs'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: secret, WHATSAPP_ENCRYPTION_KEY: secret, BACKUP_ENABLED: 'false', BACKUP_DIR: directory, ATTENDANCE_WHATSAPP_ENABLED: 'false', ATTENDANCE_PUSH_ENABLED: 'false', RESEND_API_KEY: 'mock-key', RESEND_FROM: 'Attendance <attendance@example.com>', ATTENDANCE_TEST_EMAIL_CAPTURE: path.join(directory, 'mail.jsonl') }, stdio: 'inherit' });
const date = '2026-10-10', start = Date.parse(date + 'T08:00:00+03:00');
const main: any = { employees: [{ id: employeeId, name: 'CI Employee', dept: 'd' }], departments: [{ id: 'd', name: 'Department' }], schedule: { [date]: { [employeeId]: { shiftType: 'S' } } }, shiftTypes: [{ id: 'S', name: 'Shift', start: '08:00', end: '16:00' }], settings: {} };
const config = { ...whatsappDefaults(), enabled: false, mode: 'selected', employeeIds: [employeeId], phoneNumberId: '123456789', portalUrl: 'https://attendance.example.com/employee', attendanceTemplate: 'check_in', departureTemplate: 'check_out', contacts: { [employeeId]: { phone: '966500000000', consent: true } }, accessToken: 'token-sensitive', appSecret: 'app-sensitive', verifyToken: 'verify-sensitive' };
const request = (route: string, body?: any, company = companyId, role = 'admin', id?: string) => fetch('http://127.0.0.1:3011/api/whatsapp/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ role, companyId: company, ...(id ? { id } : {}) }, secret, { expiresIn: '1h' }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const originalNow = Date.now;
let testServer: any;
try {
  let ready = false; for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:3011/api/health/live')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); } assert.ok(ready);
  for (const id of [companyId, otherCompany]) {
    await pool.query('INSERT INTO shift_app.companies(id,name,admin_username,admin_password) VALUES ($1,$1,$1,$2) ON CONFLICT(id) DO NOTHING', [id, 'ci-only-hash']);
    await db.insert(schema.systemData).values({ key: 'mainData_' + id, value: main }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: main } });
  }
  assert.equal((await request('settings', undefined, companyId, 'employee', employeeId)).status, 403);
  const initial = await (await request('settings')).json(); assert.equal(initial.enabled, false); assert.equal(initial.hasAccessToken, false);
  assert.equal((await request('settings', { ...config, enabled: true, accessToken: '', appSecret: '', verifyToken: '' })).status, 400, 'cannot enable incomplete service');
  assert.equal((await request('settings', { ...config, companyId: otherCompany })).status, 403, 'cannot select another tenant');
  assert.equal((await request('settings', config)).status, 200, 'draft credentials save while disabled');
  const saved = await (await request('settings')).json();
  for (const value of ['token-sensitive', 'app-sensitive', 'verify-sensitive']) assert.ok(!JSON.stringify(saved).includes(value), 'API never returns secret');
  const [stored] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, 'whatsappConfig:' + companyId));
  assert.ok(!JSON.stringify(stored.value).includes('token-sensitive'), 'database secret encrypted');
  assert.equal((await request('settings', { ...config, phoneNumberId: '123456789' }, otherCompany)).status, 400, 'sender cannot be shared between tenants');
  const [settingsAdmin, limitedAdmin] = await db.insert(schema.admins).values([
    { name: 'Settings admin', username: 'whatsapp-ci-settings', password: 'ci-only-hash', companyId },
    { name: 'Limited admin', username: 'whatsapp-ci-limited', password: 'ci-only-hash', companyId },
  ]).returning();
  const limited = fullAdminAccess(); limited.permissions.canManageSettings = false;
  for (const [admin, access] of [[settingsAdmin, fullAdminAccess()], [limitedAdmin, limited]] as const) await db.insert(schema.systemData).values({ key: 'adminAccess:' + companyId + ':' + admin.id, value: access });
  assert.equal((await request('settings', undefined, companyId, 'admin', String(settingsAdmin.id))).status, 200, 'company settings administrator allowed');
  assert.equal((await request('logs', undefined, companyId, 'admin', String(limitedAdmin.id))).status, 403, 'existing limited administrator denied');
  const sent: any[] = [];
  let fail = false;
  const send: any = async (_settings: any, token: string, payload: any) => { assert.equal(token, 'token-sensitive'); sent.push(payload); if (fail) throw new Error('META_190'); return 'wamid.ci.' + sent.length; };
  const testApp = express();
  const auth = () => (req: any, _res: any, next: any) => { req.auth = { companyId: req.headers['x-company'] || companyId }; next(); };
  const worker = registerWhatsAppReminders(testApp, auth, async () => main, async id => id === companyId, () => secret, send);
  testServer = testApp.listen(0, '127.0.0.1'); await new Promise<void>(resolve => testServer.once('listening', resolve));
  const base = 'http://127.0.0.1:' + testServer.address().port;
  const test = (body: any, company = companyId) => fetch(base + '/api/whatsapp/test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-company': company }, body: JSON.stringify(body) });
  assert.equal((await test({ employeeId, kind: 'attendance' }, otherCompany)).status, 400, 'other tenant cannot use sender');
  const result = await (await test({ employeeId, kind: 'attendance' })).json(); assert.equal(result.accepted, true); assert.equal(sent.length, 1, 'explicit test allowed while scheduler disabled');
  assert.equal((await test({ employeeId, kind: 'attendance' })).status, 429);
  const webhookPath = saved.webhookPath;
  assert.equal((await fetch(base + webhookPath + '?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123')).status, 403);
  assert.equal(await (await fetch(base + webhookPath + '?hub.mode=subscribe&hub.verify_token=verify-sensitive&hub.challenge=123')).text(), '123');
  const webhook = async (status: string, sender = '123456789', valid = true) => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: sender }, statuses: [{ id: 'wamid.ci.1', status }] } }] }] });
    return fetch(base + webhookPath, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', valid ? 'app-sensitive' : 'bad').update(raw).digest('hex') }, body: raw });
  };
  assert.equal((await webhook('delivered', '123456789', false)).status, 403);
  assert.equal((await webhook('delivered', '999999999')).status, 200);
  let logs = await (await request('logs')).json(); assert.equal(logs[0].status, 'accepted', 'foreign sender status ignored');
  assert.equal((await webhook('read')).status, 200); assert.equal((await webhook('sent')).status, 200);
  logs = await (await request('logs')).json(); assert.equal(logs[0].status, 'read', 'out-of-order status cannot regress');
  assert.equal((await request('logs', undefined, otherCompany)).status, 200); assert.deepEqual(await (await request('logs', undefined, otherCompany)).json(), []);
  await worker.run(); assert.equal(sent.length, 1, 'disabled policy does not schedule');
  assert.equal((await request('settings', { ...config, enabled: true, accessToken: '', appSecret: '', verifyToken: '' })).status, 200, 'blank secret input retains saved secrets');
  Date.now = () => start + 10 * 60000;
  const worker2 = registerWhatsAppReminders(express(), auth, async () => main, async id => id === companyId, () => secret, send);
  await Promise.all([worker.run(), worker2.run()]); assert.equal(sent.length, 2, 'concurrent workers claim one attendance reminder');
  await worker2.run(); assert.equal(sent.length, 2, 'restart does not resend');
  await db.insert(schema.attendance).values({ companyId, empId: employeeId, empName: 'CI Employee', date, checkIn: '08:00' });
  Date.now = () => start + 20 * 60000; await worker.run(); assert.equal(sent.length, 2, 'saved punch stops attendance reminder');
  Date.now = () => start + 8 * 3600000; await worker.run(); assert.equal(sent.length, 3, 'checked-in employee gets departure reminder');
  await db.update(schema.attendance).set({ checkOut: '16:00' }).where(eq(schema.attendance.companyId, companyId));
  Date.now = () => start + 8 * 3600000 + 10 * 60000; await worker.run(); assert.equal(sent.length, 3, 'saved departure stops reminder');
  await db.delete(schema.attendance).where(eq(schema.attendance.companyId, companyId));
  fail = true; Date.now = () => start + 30 * 60000; await worker.run(); assert.equal(sent.length, 4); await worker2.run(); assert.equal(sent.length, 4, 'provider failure does not retry same slot');
  console.log('WhatsApp tenant isolation, secrets, scheduler, delivery and deduplication passed');
} finally {
  Date.now = originalNow; child.kill('SIGTERM');
  if (testServer) await new Promise<void>(resolve => testServer.close(() => resolve()));
  await db.delete(schema.systemData).where(sql`${schema.systemData.key} IN ('mainData_whatsapp-ci-a','mainData_whatsapp-ci-b') OR ${schema.systemData.key} LIKE 'adminAccess:whatsapp-ci-a:%' OR ${schema.systemData.value}->>'companyId' IN ('whatsapp-ci-a','whatsapp-ci-b')`);
  await db.delete(schema.auditLog).where(sql`${schema.auditLog.companyId} IN ('whatsapp-ci-a','whatsapp-ci-b')`);
  await db.delete(schema.attendance).where(sql`${schema.attendance.companyId} IN ('whatsapp-ci-a','whatsapp-ci-b')`);
  await db.delete(schema.admins).where(eq(schema.admins.companyId, companyId));
  await db.delete(schema.companies).where(sql`${schema.companies.id} IN ('whatsapp-ci-a','whatsapp-ci-b')`);
  await pool.end(); await fs.rm(directory, { recursive: true, force: true });
}
