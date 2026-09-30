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
  const value = { departments: [], employees: [], shiftTypes: [], schedule: {}, settings: { companyName: 'CI', password: bcrypt.hashSync('ci-password', 10) } };
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
  console.log('PASS: concurrent saves, stale client rejection, reload-and-save, metadata not persisted.');
} finally {
  child.kill('SIGTERM');
  await pool.end();
}
