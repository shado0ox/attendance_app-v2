import test from 'node:test';
import assert from 'node:assert/strict';
import { saveEmploymentHistory } from '../src/lib/employeeLifecycle';
import { analyzeAttendance } from '../src/lib/attendanceAnalysis';
import { coverageAlerts } from '../src/lib/schedulePlanning';
const shift = { id: 'S', type: 'morning', start: '08:00', end: '16:00' };
const schedule = { '2026-10-01': { a: { shiftType: 'S' } }, '2026-10-02': { a: { shiftType: 'S' } } };
test('absence and coverage resolve department and status on the report day', () => {
  const [employee] = saveEmploymentHistory([{ id: 'a', name: 'A', dept: 'old' }], [{ id: 'a', name: 'A', dept: 'new', status: 'suspended', _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  const reports = analyzeAttendance([], { employees: [employee], shiftTypes: [shift], schedule }, { from: '2026-10-01', to: '2026-10-02', empId: '', dept: '' }, [], Date.parse('2026-10-04T20:00:00Z'));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].dept, 'old');
  assert.equal(reports[0].analysis.absent, true);
  const alerts = coverageAlerts([{ id: 'old', name: 'Old', needsMorning: true }, { id: 'new', name: 'New', needsMorning: true }], [employee], [shift], schedule, Object.keys(schedule));
  assert.equal(alerts.some(a => a.date === '2026-10-01' && a.dept === 'Old'), false);
  assert.equal(alerts.some(a => a.date === '2026-10-02' && a.dept === 'New'), true);
});
test('recorded punches retain their captured department after a transfer', () => {
  const [employee] = saveEmploymentHistory([{ id: 'a', dept: 'old' }], [{ id: 'a', dept: 'new', _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  const result = analyzeAttendance([{ empId: 'a', empName: 'A', date: '2026-10-01', dept: 'captured', ids: ['1'], minutes: null }], { employees: [employee], schedule, shiftTypes: [shift] }, { from: '2026-10-01', to: '2026-10-01', dept: 'captured', empId: '' });
  assert.equal(result.length, 1);
  assert.equal(result[0].dept, 'captured');
});

import { schedulePrintHtml } from '../src/lib/schedulePrint';
test('department exports include transferred staff only on their applicable days', () => {
  const [employee] = saveEmploymentHistory([{ id: 'a', name: 'Transferred', dept: 'old' }], [{ id: 'a', name: 'Transferred', dept: 'new', _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  const html = schedulePrintHtml({ companyName: 'Company', employees: [employee], departments: [{ id: 'old', name: 'Old' }], shiftTypes: [shift], schedule, month: '2026-10' });
  assert.ok(html.includes('Transferred'));
  assert.ok(html.includes('خارج القسم في هذا التاريخ'));
  assert.ok(html.includes('8:00'));
  assert.match(html, /<td>Transferred<\/td><td>1<\/td><td>1<\/td><td>0<\/td><td>0<\/td><td>0<\/td><td>0<\/td><td>8:00<\/td>/);
});
