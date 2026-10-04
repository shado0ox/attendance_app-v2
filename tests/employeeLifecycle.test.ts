import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeChanges, employeeStatus, isActiveEmployee } from '../src/lib/employeeLifecycle';
test('legacy staff remain active; suspended and archived staff are inactive', () => {
  assert.equal(employeeStatus({ id: 'a' }), 'active');
  assert.equal(isActiveEmployee({ status: 'suspended' }), false);
  assert.equal(isActiveEmployee({ status: 'archived' }), false);
  assert.equal(isActiveEmployee(undefined), false);
});
test('staff auditing identifies lifecycle/profile changes and never stores secrets', () => {
  const before = [{ id: 'a', name: 'A', password: 'old-secret', webauthnCredentials: ['private-key'] }];
  assert.deepEqual(employeeChanges(before, [{ ...before[0], status: 'active' }]), []);
  const changes = employeeChanges(before, [{ ...before[0], status: 'archived', statusReason: 'left', password: 'new-secret' }]);
  assert.equal(changes[0].action, 'employee.status');
  assert.equal(changes[0].changes.status.before, 'active');
  assert.equal(changes[0].changes.status.after, 'archived');
  for (const secret of ['old-secret', 'new-secret', 'private-key']) assert.ok(!JSON.stringify(changes).includes(secret));
  assert.equal(employeeChanges([], before)[0].action, 'employee.create');
  assert.equal(employeeChanges(before, [{ ...before[0], email: 'a@example.com' }])[0].action, 'employee.update');
});

import { employeeAtDate, saveEmploymentHistory } from '../src/lib/employeeLifecycle';
test('dated transfers preserve the original department and same-day transitions', () => {
  const [moved] = saveEmploymentHistory([{ id: 'a', dept: 'old' }], [{ id: 'a', dept: 'new', _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  assert.equal(employeeAtDate(moved, '2026-10-01').dept, 'old');
  assert.equal(employeeAtDate(moved, '2026-10-02').dept, 'new');
  const [again] = saveEmploymentHistory([moved], [{ ...moved, dept: 'third', _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  assert.equal(employeeAtDate(again, '2026-10-01').dept, 'old');
  assert.equal(employeeAtDate(again, '2026-10-02').dept, 'third');
});
test('history is server owned, independent per field, and cannot be reordered or future dated', () => {
  const old = { id: 'a', dept: 'old', status: 'active' };
  const [suspended] = saveEmploymentHistory([old], [{ ...old, status: 'suspended', employmentHistory: { status: [] }, _employmentEffectiveDate: '2026-10-02' }], '2026-10-04');
  const [moved] = saveEmploymentHistory([suspended], [{ ...suspended, dept: 'new', _employmentEffectiveDate: '2026-10-01' }], '2026-10-04');
  assert.equal(employeeAtDate(moved, '2026-10-01').status, 'active');
  assert.equal(employeeAtDate(moved, '2026-10-02').status, 'suspended');
  assert.deepEqual(saveEmploymentHistory([moved], [{ ...moved, employmentHistory: {} }], '2026-10-04')[0].employmentHistory, moved.employmentHistory);
  assert.throws(() => saveEmploymentHistory([moved], [{ ...moved, status: 'active', _employmentEffectiveDate: '2026-10-01' }], '2026-10-04'));
  assert.throws(() => saveEmploymentHistory([old], [{ ...old, dept: 'new', _employmentEffectiveDate: '2026-10-05' }], '2026-10-04'));
  assert.throws(() => saveEmploymentHistory([old], [{ ...old, dept: 'new', _employmentEffectiveDate: '2026-02-30' }], '2026-10-04'));
  assert.equal(saveEmploymentHistory([], [{ ...old, employmentHistory: { dept: ['forged'] } }])[0].employmentHistory, undefined);
});
