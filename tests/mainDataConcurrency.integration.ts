import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({ host: process.env.SQL_HOST, port: Number(process.env.SQL_PORT || 5432), user: process.env.SQL_USER, password: process.env.SQL_PASSWORD, database: process.env.SQL_DB_NAME });
const child = spawn(process.execPath, ['dist/server.cjs'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'ci-integration-only-secret' }, stdio: 'inherit' });
const origin = 'http://127.0.0.1:3011';
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(origin + '/api/companies'); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'server started');
  const value = { departments: [], employees: [{ id:'employee-ci', name:'Branch employee', username:'branch-user', password:'employee-password', restrictAttendanceLocations:true, allowedAttendanceLocationIds:['east'] }], shiftTypes: [], schedule: {}, settings: {
    companyName: 'CI', password: bcrypt.hashSync('ci-password', 10),
    officeLocation: { lat:24, lng:46, radius:150, preventOutCheckout:true },
    attendanceLocations:[{id:'east',name:'الشرقية',lat:26,lng:50,radius:100}]
  } };
  await pool.query('INSERT INTO shift_app.system_data (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', ['mainData', JSON.stringify(value)]);
  const login = await fetch(origin + '/api/auth/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'ci-password', companyId: 'default' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json() as any;
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const response = await fetch(origin + '/api/main-data?companyId=default', { headers });
  const initial = await response.json() as any;
  assert.ok(initial._version);
  const save = (name: string, version: string | undefined) => fetch(origin + '/api/main-data?companyId=default', { method: 'POST', headers, body: JSON.stringify({ ...initial, settings: { ...initial.settings, companyName: name }, _baseVersion: version }) });
  const simultaneous = await Promise.all([save('Manager A', initial._version), save('Manager B', initial._version)]);
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [200, 409]);
  assert.equal((await save('Stale', initial._version)).status, 409);
  assert.equal((await save('Old client', undefined)).status, 409);
  const latestResponse = await fetch(origin + '/api/main-data?companyId=default', { headers });
  const latest = await latestResponse.json() as any;
  assert.ok(['Manager A', 'Manager B'].includes(latest.settings.companyName));
  assert.equal((await save('Fresh', latest._version)).status, 200);
  const stored = await pool.query('SELECT value FROM shift_app.system_data WHERE key=$1', ['mainData']);
  assert.equal(stored.rows[0].value._baseVersion, undefined);
  assert.equal(stored.rows[0].value._version, undefined);
  const employeeLogin = await fetch(origin + '/api/auth/employee-login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({companyId:'default', username:'branch-user',password:'employee-password'}) });
  assert.equal(employeeLogin.status,200);
  const employee = await employeeLogin.json() as any;
  const employeeHeaders = { Authorization:'Bearer ' + employee.token, 'Content-Type':'application/json' };
  const punch = (body: any) => fetch(origin + '/api/attendance', { method:'POST',headers:employeeHeaders,body:JSON.stringify({companyId:'default',...body}) });
  assert.equal((await punch({empId:'employee-ci',checkIn:'08:00',checkInLat:24,checkInLng:46})).status,403);
  assert.equal((await punch({empId:'employee-ci',checkIn:'08:00'})).status,403);
  const repeats = await Promise.all([punch({empId:'employee-ci',checkIn:'08:00',checkInLat:26,checkInLng:50}),punch({empId:'employee-ci',checkIn:'08:00',checkInLat:26,checkInLng:50})]);
  assert.deepEqual(repeats.map(r=>r.status),[200,200]);
  const attendance = await repeats[0].json() as any;
  assert.equal(attendance.checkInLocation,'الشرقية');
  const savedRows = await pool.query('SELECT count(*)::int AS count FROM shift_app.attendance WHERE emp_id=$1',['employee-ci']);
  assert.equal(savedRows.rows[0].count,1);
  assert.equal((await punch({id:attendance.id,checkOut:'17:00',checkOutLat:24,checkOutLng:46})).status,403);
  assert.equal((await punch({id:attendance.id,checkOut:'17:00',checkOutLat:26,checkOutLng:50})).status,200);
  const events = await pool.query('SELECT count(*)::int AS count FROM shift_app.audit_log WHERE actor_id=$1',['employee-ci']);
  assert.equal(events.rows[0].count,2);
  console.log('PASS: per-employee server geofence, GPS required, duplicate punch serialization, scoped checkout and audit events.');
  console.log('PASS: concurrent saves, stale client rejection, reload-and-save, metadata not persisted.');
} finally {
  child.kill('SIGTERM');
  await pool.end();
}
