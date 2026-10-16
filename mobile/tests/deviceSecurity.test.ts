import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionVault, SESSION_KEY, BIOMETRIC_KEY, BIOMETRIC_FLAG } from '../src/lib/sessionVault.ts';
import { usableFix, locationMessage } from '../src/lib/locationFix.ts';
import { arrivalReminder, type ArrivalState } from '../src/lib/arrivalPolicy.ts';
const employee = { id: 'a', companyId: 'one', name: 'A', token: 'secret-token' };
function storage() {
  const values = new Map<string,string>(); let cancel = false;
  const vault = sessionVault({ get: async (key, biometric) => { if (biometric && cancel) throw new Error('cancel'); return values.get(key) || null; },
    set: async (key,value) => { values.set(key,value); }, remove: async key => { values.delete(key); } });
  return { values, vault, cancel: () => { cancel = true; } };
}
test('enabling biometric login removes the unprotected bearer token; logout removes both vaults', async () => {
  const { values, vault } = storage();
  await vault.save(employee, false);
  await vault.enable(employee);
  assert.equal(values.has(SESSION_KEY), false);
  assert.equal(await vault.enabled(), true);
  assert.deepEqual(await vault.unlock(), employee);
  await vault.clear();
  for (const key of [SESSION_KEY, BIOMETRIC_KEY, BIOMETRIC_FLAG]) assert.equal(values.has(key), false);
});
test('cancelled biometric enrollment preserves the password session and does not enable a bypass', async () => {
  const s = storage(); await s.vault.save(employee, false); s.cancel();
  await assert.rejects(s.vault.enable(employee), /cancel/);
  assert.equal(await s.vault.enabled(), false);
  assert.deepEqual(await s.vault.restore(), employee);
});
test('password recovery replaces the protected credential and disables the old biometric mode', async () => {
  const { values, vault } = storage(); await vault.enable(employee);
  const replacement = { ...employee, id: 'b', token: 'new-token' };
  await vault.disable(replacement);
  assert.deepEqual(await vault.restore(), replacement);
  assert.equal(values.has(BIOMETRIC_KEY), false);
  assert.equal(await vault.enabled(), false);
});
test('GPS rejects stale, future, mocked, invalid coordinates and imprecise fixes', () => {
  const fix = { timestamp: 100000, coords: { latitude: 26, longitude: 50, accuracy: 10 } };
  assert.equal(usableFix(fix, 100001), true);
  for (const bad of [{ ...fix, timestamp: 1 }, { ...fix, timestamp: 110000 }, { ...fix, mocked: true }, { ...fix, coords: { ...fix.coords, accuracy: 101 } }, { ...fix, coords: { ...fix.coords, latitude: NaN } }]) assert.equal(usableFix(bad, 100001), false);
  assert.match(locationMessage(new Error('kCLErrorDomain')), /تعذر تحديد موقعك/);
  assert.match(locationMessage(new Error('native'), true), /Simulator/);
  assert.doesNotMatch(locationMessage(new Error('kCLErrorDomain')), /kCLErrorDomain/);
});
test('arrival reminders stop at one hour, after check-in, on expiry, and after the first delivered event', () => {
  const state: ArrivalState = { scope: 'one:a', validUntil: 9000000, regionIds: ['work'], delivered: [], plans: [{ key: 'day:1', start: 1000000, end: 8000000, checkedIn: false }] };
  assert.equal(arrivalReminder(state, 'work', 1000001), 'day:1');
  assert.equal(arrivalReminder(state, 'other', 1000001), null);
  assert.equal(arrivalReminder(state, 'work', 999999), null);
  assert.equal(arrivalReminder(state, 'work', 4600000), null);
  assert.equal(arrivalReminder({ ...state, validUntil: 1000000 }, 'work', 1000001), null);
  assert.equal(arrivalReminder({ ...state, delivered: ['day:1'] }, 'work', 1000001), null);
  assert.equal(arrivalReminder({ ...state, plans: [{ ...state.plans[0], checkedIn: true }] }, 'work', 1000001), null);
});
