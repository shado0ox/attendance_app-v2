import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEmployeeProfileQuery, employeeProfileData, employeeProfileSchedule } from '../src/lib/employeeProfile';
import { saveEmploymentHistory } from '../src/lib/employeeLifecycle';
test('profile queries bound the month and request pages, including leap years', () => {
  assert.equal(parseEmployeeProfileQuery({ month: '2024-02' }).to, '2024-02-29');
  assert.equal(parseEmployeeProfileQuery({ month: '2025-02', section: 'requests', page: '2' }).to, '2025-02-28');
  for (const query of [{ month: '2026-13' }, { month: ['2026-10'] }, { section: 'private' }, { section: ['overview'] }, { page: '0' }, { page: '2.5' }, { page: '100001' }]) assert.throws(() => parseEmployeeProfileQuery(query));
});
test('profile allowlist excludes secrets and unrelated custom fields', () => {
  const profile = employeeProfileData({ id: 1, name: 'A', dept: 'd', password: 'password-secret', webauthnCredentials: ['credential-secret'], verificationCode: 'code-secret', privateNotes: 'private-secret', email: 'a@example.com', status: 'archived' }, [{ id: 'd', name: 'Department' }]);
  assert.equal(profile.id, '1');
  assert.equal(profile.departmentName, 'Department');
  assert.equal(profile.status, 'archived');
  assert.ok(!JSON.stringify(profile).includes('secret'));
});
test('profile schedule shows only own published assignments and historical department/status', () => {
  const [employee] = saveEmploymentHistory([{ id: 'a', name: 'A', dept: 'old' }], [{ id: 'a', name: 'A', dept: 'new', status: 'suspended', _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  const mainData = { departments: [{ id: 'old', name: 'Old' }, { id: 'new', name: 'New' }], schedule: { '2026-10-01': { a: { shiftType: 'DRAFT', note: 'private-draft' } } }, shiftTypes: [], _schedulePublication: { publishedAt: '2026-10-01T00:00:00Z', schedule: { '2026-10-01': { a: { shiftType: 'P', note: 'published-note' }, b: { shiftType: 'P', note: 'other-secret' } } }, shiftTypes: [{ id: 'P', name: 'Published', type: 'double', start: '08:00', end: '12:00', start2: '16:00', end2: '20:00', secret: 'shift-secret' }] } };
  const report = employeeProfileSchedule(mainData, employee, parseEmployeeProfileQuery({ month: '2026-10' }));
  assert.equal(report.items.length, 31);
  assert.equal(report.items[0].shiftName, 'Published');
  assert.equal(report.items[0].departmentName, 'Old');
  assert.equal(report.items[0].status, 'active');
  assert.equal(report.items[0].start2, '16:00');
  assert.equal(report.items[1].departmentName, 'New');
  assert.equal(report.items[1].status, 'suspended');
  assert.equal(report.items[1].shiftName, 'غير مجدول');
  assert.ok(!JSON.stringify(report).includes('secret'));
  assert.ok(!JSON.stringify(report).includes('private-draft'));
});
