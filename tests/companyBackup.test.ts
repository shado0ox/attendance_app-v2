import test from 'node:test';
import assert from 'node:assert/strict';
import { openCompanyBackup, sealCompanyBackup, preserveCompanyLogin } from '../src/server/companyBackupFormat';
import { allowedAdminRoute, fullAdminAccess } from '../src/lib/adminAccess';
const data = { schemaVersion: 1, companyId: 'a', mainData: { settings: { companyName: 'A' }, employees: [{ id: 'e', password: 'archived-password' }], departments: [], shiftTypes: [], schedule: {} }, photos: [], tables: {} };
test('company archives encrypt and authenticate content and metadata, rejecting another company or key', () => {
  const archive = sealCompanyBackup(data, 'key-a'); assert.ok(!archive.file.includes('archived-password'));
  assert.deepEqual(openCompanyBackup(archive.file, 'a', 'key-a').payload, data);
  assert.throws(() => openCompanyBackup(archive.file, 'b', 'key-a'));
  assert.throws(() => openCompanyBackup(archive.file, 'a', 'key-b'));
  const tampered = JSON.parse(archive.file); tampered.createdAt = '2026-01-01'; assert.throws(() => openCompanyBackup(JSON.stringify(tampered), 'a', 'key-a'));
  tampered.companyId = 'b'; assert.throws(() => openCompanyBackup(JSON.stringify(tampered), 'b', 'key-a'));
  assert.throws(() => openCompanyBackup('{}', 'a', 'key-a'));
});
test('restore preserves current passwords, identities and passkey counters instead of rolling them back', () => {
  const old = { ...data.mainData, settings: { password: 'old-admin' }, employees: [{ id: 'e', password: 'old', email: 'old@example.com', webauthnCredentials: [{ counter: 0 }] }, { id: 'new', password: 'new-password', webauthnCredentials: [{ counter: 0 }] }] };
  const current = { settings: { password: 'current-admin' }, employees: [{ id: 'e', password: 'current', username: 'current-user', email: 'current@example.com', webauthnCredentials: [{ counter: 20 }] }] };
  const restored = preserveCompanyLogin(old, current);
  assert.equal(restored.settings.password, 'current-admin'); assert.equal(restored.employees[0].password, 'current'); assert.equal(restored.employees[0].email, 'current@example.com'); assert.equal(restored.employees[0].webauthnCredentials[0].counter, 20);
  assert.deepEqual(restored.employees[1].webauthnCredentials, []); assert.equal(restored.employees[1].password, 'new-password'); assert.ok(restored._companyRestoreRevision);
});
test('company backup routes require unrestricted full company management permissions', () => {
  const access = fullAdminAccess(); assert.equal(allowedAdminRoute(access, 'POST', '/api/company-backup/restore'), true);
  assert.equal(allowedAdminRoute({ ...access, departmentIds: ['d'] }, 'GET', '/api/company-backup/status'), false);
  assert.equal(allowedAdminRoute({ ...access, permissions: { ...access.permissions, canManageEmployees: false } }, 'POST', '/api/company-backup/download'), false);
});
