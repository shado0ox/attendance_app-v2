import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { eq, sql } from 'drizzle-orm';
import { db, schema, pool } from '../src/db/index';
import { fullAdminAccess } from '../src/lib/adminAccess';
const directory = await fs.mkdtemp(path.join(tmpdir(), 'break-ci-'));
const clockFile = path.join(directory, 'clock');
const setTime = async (time: string) => { await fs.writeFile(clockFile + '.next', String(Date.parse(time))); await fs.rename(clockFile + '.next', clockFile); };
await setTime('2026-10-15T12:59:00+03:00');
const companyId = 'break-ci-a', otherCompany = 'break-ci-b', employeeId = 'break-ci-e1', secondId = 'break-ci-e2', secret = 'break-ci-secret';
const child = spawn(process.execPath, ['--import', './tests/mockResend.mjs', '--import', './tests/mockBreakClock.mjs', 'dist/server.cjs'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: secret, BACKUP_ENABLED: 'false', ATTENDANCE_PUSH_ENABLED: 'false', ATTENDANCE_WHATSAPP_ENABLED: 'false', ATTENDANCE_TEST_BREAK_CLOCK: clockFile, ATTENDANCE_TEST_EMAIL_CAPTURE: path.join(directory, 'mail') }, stdio: 'inherit' });
const origin = 'http://127.0.0.1:3011/api/';
const request = (route: string, body?: any, role = 'admin', id?: any, company = companyId) => fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ role, companyId: company, ...(id !== undefined ? { id } : {}) }, secret, { expiresIn: '365d' }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const action = (body: any, id = employeeId, company = companyId) => request('attendance-breaks/action', body, 'employee', id, company);
const rule = { id: 'lunch', name: 'Lunch', enabled: true, scope: 'shifts', shiftIds: ['S'], employeeIds: [], period: 1, mode: 'clock', time: '13:00', offsetMinutes: 120, durationMinutes: 30 };
const shifts = [{ id: 'S', name: 'Day', start: '08:00', end: '17:00' }, { id: 'D', name: 'Night double', type: 'double', start: '20:00', end: '23:00', start2: '00:30', end2: '04:00' }];
const data = { employees: [{ id: employeeId, name: 'Employee one', username: employeeId, dept: 'd1' }, { id: secondId, name: 'Employee two', username: secondId, dept: 'd2' }], departments: [{ id: 'd1', name: 'One' }, { id: 'd2', name: 'Two' }], shiftTypes: shifts, settings: {}, schedule: { '2026-10-15': { [employeeId]: { shiftType: 'S' }, [secondId]: { shiftType: 'S' } }, '2026-10-14': { [employeeId]: { shiftType: 'D' } }, '2026-10-16': { [employeeId]: { shiftType: 'S' }, [secondId]: { shiftType: 'S' } } } };
const policy = (rules: any[]) => request('attendance-breaks/policy', { rules });
const report = async () => { const r = await request('attendance-report?' + new URLSearchParams({ companyId, from: '2026-10-15', to: '2026-10-15' })); const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result.items.find((day: any) => day.empId === employeeId); };
try {
  let ready = false; for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + 'health/live')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); } assert.ok(ready);
  for (const company of [companyId, otherCompany]) {
    await pool.query('INSERT INTO shift_app.companies(id,name,admin_username,admin_password) VALUES ($1,$1,$1,$2) ON CONFLICT(id) DO NOTHING', [company, 'ci-hash']);
    await db.insert(schema.systemData).values({ key: 'mainData_' + company, value: company === companyId ? data : { ...data, employees: [{ ...data.employees[0], username: 'break-ci-foreign' }] } });
  }
  assert.equal((await request('attendance-breaks/policy', undefined, 'employee', employeeId)).status, 403);
  assert.equal((await request('attendance-breaks/status?companyId=' + otherCompany, undefined, 'employee', employeeId)).status, 403);
  assert.equal((await policy([{ ...rule, shiftIds: ['foreign'] }])).status, 400);
  assert.equal((await policy([rule])).status, 200);
  const [record] = await db.insert(schema.attendance).values({ companyId, empId: employeeId, empName: 'Employee one', dept: 'd1', date: '2026-10-15', checkIn: '08:00' }).returning();
  const [second] = await db.insert(schema.attendance).values({ companyId, empId: secondId, empName: 'Employee two', dept: 'd2', date: '2026-10-15', checkIn: '08:00' }).returning();
  const start = { recordId: record.id, action: 'start', period: 1 };
  assert.equal((await report()).workStatus, 'working');
  assert.equal((await action(start)).status, 409, 'cannot start before scheduled window');
  await setTime('2026-10-15T13:00:00+03:00');
  const response = await action({ ...start, startedAt: 1, allowedMinutes: 500 }); const started = await response.json(); assert.equal(response.status, 200, JSON.stringify(started));
  assert.equal(started.entry.startedAt, Date.parse('2026-10-15T13:00:00+03:00')); assert.equal(started.entry.allowedMinutes, 30);
  assert.equal((await (await action(start)).json()).entry.id, started.entry.id, 'replayed start does not create second break');
  assert.equal((await action(start, secondId)).status, 404); assert.equal((await action(start, employeeId, otherCompany)).status, 404);
  assert.equal((await report()).workStatusText, 'في الاستراحة');
  const status = await (await request('attendance-breaks/status', undefined, 'employee', employeeId)).json(); assert.equal(status.entries.length, 1); assert.equal(status.plans[0].rule.shiftIds, undefined, 'do not leak company assignments');
  const checkout = await request('attendance', { companyId, empId: employeeId, checkOut: '13:01' }, 'employee', employeeId);
  assert.equal(checkout.status, 409, await checkout.text());
  await setTime('2026-10-15T13:36:00+03:00'); assert.equal((await report()).activeBreakLateMinutes, 6);
  await setTime('2026-10-15T13:40:00+03:00');
  const end = { recordId: record.id, action: 'end', period: 1, entryId: started.entry.id };
  const ended = await (await action(end)).json(); assert.equal(ended.entry.endedAt, Date.parse('2026-10-15T13:40:00+03:00'));
  await setTime('2026-10-15T13:45:00+03:00'); assert.equal((await (await action(end)).json()).entry.endedAt, ended.entry.endedAt);
  const returned = await report(); assert.equal(returned.workStatus, 'working'); assert.equal(returned.breakLateMinutes, 10);
  await db.update(schema.attendance).set({ checkOut: '17:00' }).where(eq(schema.attendance.id, record.id)); assert.equal((await report()).workStatus, 'outside');
  await setTime('2026-10-15T13:05:00+03:00');
  const secondStart = await (await action({ recordId: second.id, action: 'start', period: 1 }, secondId)).json(); assert.ok(secondStart.entry);
  const [manager] = await db.insert(schema.admins).values({ companyId, name: 'Department manager', username: 'break-ci-manager', password: 'ci-hash' }).returning();
  await db.insert(schema.systemData).values({ key: 'adminAccess:' + companyId + ':' + manager.id, value: { ...fullAdminAccess(), departmentIds: ['d1'] } });
  const scoped = await (await request('attendance-breaks/report?from=2026-10-15&to=2026-10-15', undefined, 'admin', manager.id)).json(); assert.equal(scoped.total, 1); assert.equal(scoped.items[0].empId, employeeId);
  assert.equal((await request('attendance-breaks/policy', { rules: [] }, 'admin', manager.id)).status, 403);
  assert.equal((await request('attendance-breaks/close', { recordId: second.id, entryId: secondStart.entry.id, reason: 'Forgot return' }, 'admin', manager.id)).status, 403);
  assert.equal((await policy([])).status, 200); assert.equal((await action({ recordId: second.id, action: 'end', period: 1, entryId: secondStart.entry.id }, secondId)).status, 200, 'removed policy cannot trap an employee in a break');
  // Second period after midnight belongs to the preceding schedule date.
  assert.equal((await policy([{ ...rule, id: 'night', shiftIds: ['D'], period: 2, time: '00:45', durationMinutes: 15 }])).status, 200);
  const [night] = await db.insert(schema.attendance).values({ companyId, empId: employeeId, empName: 'Employee one', dept: 'd1', date: '2026-10-14', checkIn: '20:00', checkOut: '23:00', checkIn2: '00:30' }).returning();
  await setTime('2026-10-15T00:50:00+03:00');
  const nightStatus = await (await request('attendance-breaks/status', undefined, 'employee', employeeId)).json(); assert.equal(nightStatus.plans[0].date, '2026-10-14'); assert.equal(nightStatus.plans[0].canStart, true);
  const nightResponse = await action({ recordId: night.id, period: 2, action: 'start' }); const nightStart = await nightResponse.json(); assert.equal(nightResponse.status, 200, JSON.stringify(nightStart));
  assert.equal(nightStart.entry.period, 2); assert.equal(nightStart.entry.plannedEnd, Date.parse('2026-10-15T01:00:00+03:00'));
  await setTime('2026-10-15T01:05:00+03:00');
  // Approved months remain immutable, including administration closures.
  await db.insert(schema.attendanceMonths).values({ companyId, key: companyId + ':2026-10', month: '2026-10', value: { status: 'approved' } });
  const nightEnd = { recordId: night.id, entryId: nightStart.entry.id, period: 2, action: 'end' };
  assert.equal((await action(nightEnd)).status, 409); assert.equal((await request('attendance-breaks/close', { ...nightEnd, reason: 'Forgot return' })).status, 409);
  await db.delete(schema.attendanceMonths).where(eq(schema.attendanceMonths.key, companyId + ':2026-10'));
  await setTime('2026-11-01T10:00:00+03:00'); const approval = await request('attendance-months', { companyId, month: '2026-10', action: 'approve' }); assert.equal(approval.status, 409); assert.match(await approval.text(), /الاستراحة/);
  await setTime('2026-10-15T01:05:00+03:00'); assert.equal((await request('attendance-breaks/close', { ...nightEnd, reason: 'Forgot return' })).status, 200);
  const closedReport = await (await request('attendance-breaks/report?from=2026-10-14&to=2026-10-14')).json(); assert.equal(closedReport.items[0].lateReturnMinutes, 5); assert.equal(closedReport.items[0].closedByAdmin, true);
  const saved = (await db.select().from(schema.attendance).where(eq(schema.attendance.id, record.id)))[0]; assert.equal((saved.breaks as any[]).length, 1); assert.equal(saved.checkIn, '08:00');
  // Duration-only breaks start when work allows, not at a preconfigured clock time.
  const flexible = { ...rule, mode: 'flexible', time: undefined, offsetMinutes: undefined };
  assert.equal((await policy([flexible])).status, 200);
  const [flexRecord, unpunched] = await db.insert(schema.attendance).values([
    { companyId, empId: employeeId, empName: 'Employee one', dept: 'd1', date: '2026-10-16', checkIn: '08:00' },
    { companyId, empId: secondId, empName: 'Employee two', dept: 'd2', date: '2026-10-16' },
  ]).returning();
  const flexStart = { recordId: flexRecord.id, action: 'start', period: 1 };
  await setTime('2026-10-16T07:59:00+03:00'); assert.equal((await action(flexStart)).status, 409);
  await setTime('2026-10-16T10:10:00+03:00');
  const flexStatus = await (await request('attendance-breaks/status', undefined, 'employee', employeeId)).json(); assert.equal(flexStatus.plans[0].canStart, true); assert.equal(flexStatus.plans[0].rule.mode, 'flexible');
  assert.equal((await action({ recordId: unpunched.id, action: 'start', period: 1 }, secondId)).status, 409, 'duration-only still needs attendance');
  const flexResponse = await action({ ...flexStart, startedAt: 1, plannedEnd: 1, durationMinutes: 500 }); const flexEntry = (await flexResponse.json()).entry; assert.equal(flexResponse.status, 200);
  assert.equal(flexEntry.plannedStart, Date.parse('2026-10-16T10:10:00+03:00')); assert.equal(flexEntry.plannedEnd, Date.parse('2026-10-16T10:40:00+03:00')); assert.equal(flexEntry.allowedMinutes, 30);
  assert.equal((await policy([{ ...flexible, durationMinutes: 10 }])).status, 200, 'later policy edits do not shorten a running break');
  await setTime('2026-10-16T10:46:00+03:00');
  const flexibleReport = await (await request('attendance-report?' + new URLSearchParams({ companyId, from: '2026-10-16', to: '2026-10-16' }))).json(); assert.equal(flexibleReport.items.find((item: any) => item.empId === employeeId).activeBreakLateMinutes, 6);
  assert.equal((await action({ recordId: flexRecord.id, action: 'end', period: 1, entryId: flexEntry.id })).status, 200);
  assert.equal((await (await action(flexStart)).json()).entry.id, flexEntry.id, 'cannot take another break for the same period');
  assert.equal((await policy([flexible])).status, 200);
  await db.update(schema.attendance).set({ checkIn: '08:00' }).where(eq(schema.attendance.id, unpunched.id));
  await setTime('2026-10-16T16:31:00+03:00'); const nearEnd = { recordId: unpunched.id, action: 'start', period: 1 }; assert.equal((await action(nearEnd, secondId)).status, 409, 'full duration must fit before end of period');
  const unavailable = await (await request('attendance-breaks/status', undefined, 'employee', secondId)).json(); assert.equal(unavailable.plans[0].canStart, false);
  await setTime('2026-10-16T16:30:00+03:00'); const lastStart = await action(nearEnd, secondId); const lastEntry = (await lastStart.json()).entry; assert.equal(lastStart.status, 200); assert.equal(lastEntry.plannedEnd, Date.parse('2026-10-16T17:00:00+03:00'));
  await setTime('2026-10-16T17:06:00+03:00'); assert.equal((await action({ ...nearEnd, action: 'end', entryId: lastEntry.id }, secondId)).status, 200, 'return remains possible after period ends');
  console.log('Attendance breaks: live states, overdue return, time authority, replay safety, tenant/department isolation, checkout protection, night shifts and month immutability passed');
} finally {
  child.kill('SIGTERM'); await new Promise(resolve => child.exitCode !== null ? resolve(null) : child.once('exit', resolve));
  for (const table of [schema.attendance, schema.auditLog, schema.attendanceMonths, schema.admins]) await db.delete(table).where(sql`${table.companyId} IN ('break-ci-a','break-ci-b')`);
  await db.delete(schema.systemData).where(sql`${schema.systemData.key} IN ('mainData_break-ci-a','mainData_break-ci-b') OR ${schema.systemData.key} LIKE 'adminAccess:break-ci-a:%' OR ${schema.systemData.value}->>'companyId' IN ('break-ci-a','break-ci-b')`);
  await db.delete(schema.companies).where(sql`${schema.companies.id} IN ('break-ci-a','break-ci-b')`); await pool.end(); await fs.rm(directory, { recursive: true, force: true });
}
