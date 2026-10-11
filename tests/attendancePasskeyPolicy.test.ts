import test from 'node:test';
import assert from 'node:assert/strict';
import { attendancePasskeyRequired, emptyPasskeyPolicy, parsePasskeyPolicy } from '../src/lib/attendancePasskeyPolicy';
import { allowedAdminRoute, fullAdminAccess } from '../src/lib/adminAccess';
test('passkey requirement defaults off and supports one-employee pilot and all employees', () => {
  const off = emptyPasskeyPolicy(); assert.equal(attendancePasskeyRequired(off, 'e'), false);
  const selected = { ...off, ...parsePasskeyPolicy({ mode: 'selected', employeeIds: ['e', 'e'] }, [{ id: 'e' }]) };
  assert.deepEqual(selected.employeeIds, ['e']); assert.equal(attendancePasskeyRequired(selected, 'e'), true); assert.equal(attendancePasskeyRequired(selected, 'other'), false);
  assert.equal(attendancePasskeyRequired({ ...off, mode: 'all' }, 'new-employee'), true);
  assert.throws(() => parsePasskeyPolicy({ mode: 'selected', employeeIds: ['foreign'] }, [{ id: 'e' }]));
});
test('passkey approval is reserved for company settings administrators', () => {
  const access = fullAdminAccess(); assert.equal(allowedAdminRoute(access, 'POST', '/api/attendance-passkey/credential'), true);
  assert.equal(allowedAdminRoute({ ...access, departmentIds: ['d'] }, 'POST', '/api/attendance-passkey/credential'), false);
  assert.equal(allowedAdminRoute({ ...access, permissions: { ...access.permissions, canManageSettings: false } }, 'POST', '/api/attendance-passkey/policy'), false);
});
