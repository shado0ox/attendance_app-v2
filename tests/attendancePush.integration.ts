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
import { registerAttendancePush } from '../src/server/attendancePush';

const directory = await fs.mkdtemp(path.join(tmpdir(), 'attendance-push-'));
const secret = 'attendance-push-ci-secret', companyId = 'push-ci-a', otherCompany = 'push-ci-b', employeeId = 'push-ci-employee';
const child = spawn(process.execPath, ['--import', './tests/mockResend.mjs', 'dist/server.cjs'], {
  env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: secret, BACKUP_ENABLED: 'false', BACKUP_DIR: directory, APP_URL: 'https://attendance.example.com', ATTENDANCE_PUSH_ENABLED: 'false', RESEND_API_KEY: 'mock-key', RESEND_FROM: 'Attendance <attendance@example.com>', ATTENDANCE_TEST_EMAIL_CAPTURE: path.join(directory, 'mail.jsonl') }, stdio: 'inherit',
});
const request = (method: string, body: any = {}, role = 'employee', company = companyId, id = employeeId) => fetch('http://127.0.0.1:3011/api/attendance-push/subscription', {
  method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ role, companyId: company, id }, secret) }, body: JSON.stringify(body),
});
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/attendance-ci', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
const subscriptionKey = 'attendancePush:' + crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
const date = '2026-10-10', start = Date.parse(date + 'T08:00:00+03:00');
let main: any = { employees: [{ id: employeeId, name: 'Push Employee', dept: 'push-dept' }], departments: [{ id: 'push-dept' }], settings: {}, schedule: { [date]: { [employeeId]: { shiftType: 'S' } } }, shiftTypes: [{ id: 'S', name: 'الصباح', start: '08:00', end: '16:00' }] };
const sent: any[] = [];
const send: any = async (_subscription: any, payload: string, options: any) => { sent.push({ payload: JSON.parse(payload), options }); return { statusCode: 201, body: '', headers: {} }; };
const worker = () => registerAttendancePush(express(), () => (_req: any, _res: any, next: any) => next(), async () => main, async id => id === companyId, send);
const originalNow = Date.now;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:3011/api/health/live')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
  assert.ok(ready, 'server starts');
  for (const id of [companyId, otherCompany]) await pool.query('INSERT INTO shift_app.companies(id,name,admin_username,admin_password) VALUES ($1,$1,$1,$2) ON CONFLICT(id) DO NOTHING', [id, 'ci-only-hash']);
  for (const id of [companyId, otherCompany]) await db.insert(schema.systemData).values({ key: 'mainData_' + id, value: main }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: main } });
  assert.equal((await request('POST', { subscription: { ...subscription, endpoint: 'https://127.0.0.1/private' } })).status, 400);
  assert.equal((await request('POST', { subscription }, 'admin')).status, 403);
  assert.equal((await request('POST', { subscription, companyId: otherCompany })).status, 403);
  assert.equal((await request('POST', { subscription })).status, 200);
  assert.equal((await request('DELETE', { endpoint: subscription.endpoint }, 'employee', otherCompany)).status, 200);
  assert.equal((await db.select().from(schema.systemData).where(eq(schema.systemData.key, subscriptionKey))).length, 1, 'other company cannot remove subscription');
  // Foreign attendance never suppresses this employee's reminder.
  await db.insert(schema.attendance).values({ companyId: otherCompany, empId: employeeId, empName: 'Foreign Employee', date, checkIn: '08:00' });
  Date.now = () => start;
  await Promise.all([worker().run(), worker().run()]);
  assert.equal(sent.length, 1, 'concurrent workers claim one reminder');
  assert.equal(sent[0].payload.expiresAt, start + 3600000); assert.equal(sent[0].options.TTL, 60);
  await worker().run(); assert.equal(sent.length, 1, 'new worker/restart preserves deduplication');
  assert.equal((await request('POST', { subscription })).status, 200);
  await worker().run(); assert.equal(sent.length, 1, 'subscription renewal preserves delivered slots');
  for (let minute = 10; minute <= 50; minute += 10) { Date.now = () => start + minute * 60000; await worker().run(); }
  assert.equal(sent.length, 6);
  Date.now = () => start + 3600000; await worker().run(); assert.equal(sent.length, 6, 'no notification at or after the hour');
  // Move the scheduled start; a saved check-in still prevents subsequent reminders.
  main = { ...main, shiftTypes: [{ id: 'S', start: '09:00', end: '17:00' }] };
  await db.insert(schema.attendance).values({ companyId, empId: employeeId, empName: 'Push Employee', date, checkIn: '09:00' });
  await worker().run(); assert.equal(sent.length, 6, 'saved attendance stops reminders');
  await db.delete(schema.attendance).where(sql`${schema.attendance.companyId} = ${companyId}`);
  await db.insert(schema.requests).values({ companyId, empId: employeeId, empName: 'Push Employee', date, type: 'leave', status: 'approved' });
  await worker().run(); assert.equal(sent.length, 6, 'approved leave is excluded');
  await db.delete(schema.requests).where(eq(schema.requests.companyId, companyId));
  assert.equal((await request('DELETE', { endpoint: subscription.endpoint })).status, 200);
  await worker().run(); assert.equal(sent.length, 6, 'opt-out stops sending');
  assert.equal((await request('POST', { subscription })).status, 200);
  const dead: any = async () => { throw { statusCode: 410 }; };
  await registerAttendancePush(express(), () => (_req: any, _res: any, next: any) => next(), async () => main, async id => id === companyId, dead).run();
  assert.equal((await db.select().from(schema.systemData).where(eq(schema.systemData.key, subscriptionKey))).length, 0, 'expired endpoint removed');
  console.log('PASS: push tenant isolation, opt-out, concurrency, persistent deduplication, hourly cutoff, saved attendance and leave exclusion.');
} finally {
  Date.now = originalNow; child.kill('SIGTERM');
  await db.delete(schema.systemData).where(sql`${schema.systemData.key} = ${subscriptionKey} OR ${schema.systemData.key} IN ${sql.raw("('mainData_push-ci-a','mainData_push-ci-b')")}`);
  for (const table of [schema.attendance, schema.requests]) await db.delete(table).where(sql`${table.companyId} IN ${sql.raw("('push-ci-a','push-ci-b')")}`);
  await db.delete(schema.companies).where(sql`${schema.companies.id} IN ${sql.raw("('push-ci-a','push-ci-b')")}`);
  await pool.end(); await fs.rm(directory, { recursive: true, force: true });
}
