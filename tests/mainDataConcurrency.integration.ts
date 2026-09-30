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
  assert.equal((await punch({ checkIn: 'auto', checkInLat: 26, checkInLng: 50, automatic: true, gpsAccuracy: 200, gpsTimestamp: Date.now() })).status, 400);
  assert.equal((await punch({ checkIn: 'auto', checkInLat: 26, checkInLng: 50, automatic: true, gpsAccuracy: 10, gpsTimestamp: Date.now() - 60000 })).status, 400);
  const repeats = await Promise.all([punch({empId:'employee-ci',checkIn:'08:00',checkInLat:26,checkInLng:50,automatic:true,gpsAccuracy:10,gpsTimestamp:Date.now()}),punch({empId:'employee-ci',checkIn:'08:00',checkInLat:26,checkInLng:50,automatic:true,gpsAccuracy:10,gpsTimestamp:Date.now()})]);
  assert.deepEqual(repeats.map(r=>r.status),[200,200]);
  const attendance = await repeats[0].json() as any;
  assert.equal(attendance.checkInLocation,'الشرقية');
  assert.equal(attendance.source, 'GPS تلقائي');
  assert.equal((await punch({ id: attendance.id, checkOut: 'auto', automatic: true })).status, 400);
  const savedRows = await pool.query('SELECT count(*)::int AS count FROM shift_app.attendance WHERE emp_id=$1',['employee-ci']);
  assert.equal(savedRows.rows[0].count,1);
  assert.equal((await punch({id:attendance.id,checkOut:'17:00',checkOutLat:24,checkOutLng:46})).status,403);
  assert.equal((await punch({id:attendance.id,checkOut:'17:00',checkOutLat:26,checkOutLng:50})).status,200);
  const events = await pool.query('SELECT count(*)::int AS count FROM shift_app.audit_log WHERE actor_id=$1',['employee-ci']);
  assert.equal(events.rows[0].count,2);
  const month = '2025-01';
  const adminRecord = (body: any) => fetch(origin + '/api/attendance', { method: 'POST', headers, body: JSON.stringify({ companyId: 'default', ...body }) });
  const monthly = (body: any) => fetch(origin + '/api/attendance-months', { method: 'POST', headers, body: JSON.stringify({ companyId: 'default', month, ...body }) });
  assert.equal((await fetch(origin + '/api/attendance-months?companyId=default', { method: 'POST', headers, body: JSON.stringify({ companyId: 'other-company', month, action: 'approve' }) })).status, 400);
  const historical = { empId: 'monthly-ci', empName: 'Monthly employee', date: month + '-10', checkIn: '08:00', checkOut: '17:00', source: 'تسجيل إداري' };
  const created = await adminRecord(historical);
  assert.equal(created.status, 200);
  const record = await created.json() as any;
  assert.equal((await monthly({ action: 'approve', month: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).slice(0, 7) })).status, 400);
  assert.equal((await fetch(origin + '/api/attendance-months?companyId=default&month=' + month, { headers: employeeHeaders })).status, 403);
  const approved = await monthly({ action: 'approve' });
  assert.equal(approved.status, 200);
  const frozen = await approved.json() as any;
  assert.equal(frozen.status, 'approved');
  assert.equal(frozen.snapshot.totalMinutes, 540);
  assert.equal(frozen.snapshot.days[0].empName, 'Monthly employee');
  assert.equal((await adminRecord({ id: record.id, note: 'blocked correction' })).status, 409);
  assert.equal((await adminRecord({ id: record.id, date: '2025-02-10' })).status, 409);
  assert.equal((await adminRecord(historical)).status, 409);
  assert.equal((await fetch(origin + '/api/attendance/' + record.id, { method: 'DELETE', headers })).status, 409);
  const outside = await adminRecord({ ...historical, date: '2025-02-10' });
  assert.equal(outside.status, 200);
  const outsideRecord = await outside.json() as any;
  assert.equal((await adminRecord({ id: outsideRecord.id, date: month + '-11' })).status, 409);
  assert.equal((await monthly({ action: 'reopen', reason: '' })).status, 400);
  assert.equal((await monthly({ action: 'reopen', reason: 'تصحيح إداري موثق' })).status, 200);
  assert.equal((await adminRecord({ id: record.id, note: 'allowed correction' })).status, 200);
  assert.equal((await monthly({ action: 'approve' })).status, 200);
  const monthAudit = await pool.query("SELECT action, details FROM shift_app.audit_log WHERE entity_id=$1 AND action LIKE 'attendance.month.%' ORDER BY id", [month]);
  assert.deepEqual(monthAudit.rows.map(row => row.action), ['attendance.month.approve', 'attendance.month.reopen', 'attendance.month.approve']);
  assert.equal(monthAudit.rows[1].details.reason, 'تصحيح إداري موثق');
  const raceMonth = '2024-12';
  assert.equal((await adminRecord({ ...historical, date: raceMonth + '-10' })).status, 200);
  const [raceWrite, raceApprove] = await Promise.all([
    adminRecord({ ...historical, date: raceMonth + '-11' }),
    monthly({ month: raceMonth, action: 'approve' }),
  ]);
  assert.equal(raceApprove.status, 200);
  const raceSnapshot = await raceApprove.json() as any;
  assert.ok([200, 409].includes(raceWrite.status));
  assert.equal(raceSnapshot.snapshot.days.length, raceWrite.status === 200 ? 2 : 1);
  const raceRows = await pool.query("SELECT count(*)::int AS count FROM shift_app.attendance WHERE date LIKE $1", [raceMonth + '-%']);
  assert.equal(raceRows.rows[0].count, raceSnapshot.snapshot.days.length);
  assert.equal((await monthly({ month: raceMonth, action: 'reopen', reason: 'stale browser attempt', expectedStatus: 'approved', expectedRevision: 0 })).status, 409);
  const reportRecords = Array.from({ length: 53 }, (_, i) => ({ emp_id: 'report-' + i, emp_name: 'Report ' + i, dept: 'report-dept', date: '2024-11-10', check_in: '08:00', check_out: '17:00', company_id: 'default' }));
  reportRecords.push({ ...reportRecords[0] });
  reportRecords.push({ ...reportRecords[0], company_id: 'foreign-company' });
  await pool.query(`INSERT INTO shift_app.attendance (emp_id,emp_name,dept,date,check_in,check_out,company_id)
    SELECT emp_id,emp_name,dept,date,check_in,check_out,company_id FROM jsonb_to_recordset($1::jsonb) AS r(emp_id text,emp_name text,dept text,date text,check_in text,check_out text,company_id text)`, [JSON.stringify(reportRecords)]);
  const reportQuery = '/api/attendance-report?companyId=default&from=2024-11-10&to=2024-11-10&dept=report-dept';
  const firstPage = await fetch(origin + reportQuery, { headers }); assert.equal(firstPage.status, 200);
  const firstReport = await firstPage.json() as any;
  assert.equal(firstReport.items.length, 50); assert.equal(firstReport.total, 53); assert.equal(firstReport.totalMinutes, 53 * 540);
  const secondReport = await (await fetch(origin + reportQuery + '&page=2', { headers })).json() as any;
  assert.equal(secondReport.items.length, 3);
  const fullReport = await (await fetch(origin + reportQuery + '&mode=all', { headers })).json() as any;
  assert.equal(fullReport.items.length, 53);
  const employeeReport = await (await fetch(origin + reportQuery + '&empId=report-0', { headers })).json() as any;
  assert.equal(employeeReport.total, 1); assert.equal(employeeReport.items[0].ids.length, 2);
  assert.equal((await fetch(origin + reportQuery, { headers: employeeHeaders })).status, 403);
  assert.equal((await fetch(origin + '/api/attendance-report?companyId=default&from=2026-02-30', { headers })).status, 400);
  const historicalLookup = await (await fetch(origin + '/api/attendance?companyId=default&from=2024-11-10&to=2024-11-10&empId=report-0', { headers })).json() as any;
  assert.equal(historicalLookup.length, 2);
  const employeeScope = await (await fetch(origin + '/api/attendance?companyId=default&empId=report-0', { headers: employeeHeaders })).json() as any;
  assert.ok(employeeScope.every((row: any) => row.empId === 'employee-ci'));
  const analysisData = { ...stored.rows[0].value,
    employees: [...stored.rows[0].value.employees, { id: 'analysis-ci', name: 'Analysis employee', dept: 'analysis-dept' }],
    shiftTypes: [{ id: 'S', start: '08:00', end: '17:00' }, { id: 'N', start: '22:00', end: '06:00' }],
    schedule: { '2024-10-10': { 'analysis-ci': { shiftType: 'S' } }, '2024-10-11': { 'analysis-ci': { shiftType: 'A' } }, '2024-10-12': { 'analysis-ci': { shiftType: 'N' } }, '2024-10-13': { 'analysis-ci': { shiftType: 'S' } } },
    settings: { ...stored.rows[0].value.settings, attendanceAnalysis: { graceMinutes: 5 } },
  };
  await pool.query('UPDATE shift_app.system_data SET value=$1 WHERE key=$2', [JSON.stringify(analysisData), 'mainData']);
  await pool.query("INSERT INTO shift_app.requests (emp_id,emp_name,date,type,status,company_id) VALUES ('analysis-ci','Analysis employee','2024-10-10','leave','approved','default')");
  assert.equal((await adminRecord({ empId: 'analysis-ci', empName: 'Analysis employee', dept: 'analysis-dept', date: '2024-10-13', checkIn: '08:15', checkOut: '17:30' })).status, 200);
  const analysisQuery = '/api/attendance-report?companyId=default&from=2024-10-10&to=2024-10-13&empId=analysis-ci&analysis=1&mode=all';
  const analyzed = await (await fetch(origin + analysisQuery, { headers })).json() as any;
  assert.equal(analyzed.total, 4); assert.equal(analyzed.absentDays, 1); assert.equal(analyzed.lateMinutes, 10); assert.equal(analyzed.overtimeMinutes, 30); assert.equal(analyzed.reviewCount, 0);
  assert.equal(analyzed.items.find((day: any) => day.date === '2024-10-10').analysis.status, 'إجازة معتمدة');
  const absences = await (await fetch(origin + analysisQuery + '&status=absent', { headers })).json() as any;
  assert.equal(absences.total, 1); assert.equal(absences.items[0].date, '2024-10-12'); assert.deepEqual(absences.items[0].ids, []);
  console.log('PASS: schedule analysis, approved leave, rest, overnight absence, grace and potential overtime through HTTP.');
  console.log('PASS: scoped report period/employee/department, whole-day paging, complete export, totals and employee permissions.');
  console.log('PASS: monthly snapshot, closed-month create/update/delete/date-move guards, reopening reason and audit.');
  console.log('PASS: per-employee server geofence, GPS required, duplicate punch serialization, scoped checkout and audit events.');
  console.log('PASS: concurrent saves, stale client rejection, reload-and-save, metadata not persisted.');
} finally {
  child.kill('SIGTERM');
  await pool.end();
}
