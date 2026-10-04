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
