import test from 'node:test';
import assert from 'node:assert/strict';
import { dueAttendanceReminders, reminderSlot } from '../src/lib/attendanceReminders';
import { validPushSubscription } from '../src/server/attendancePushValidation';
import crypto from 'node:crypto';
const date = '2026-10-10', start = Date.parse(date + 'T08:00:00+03:00');
const shift = { id: 'S', name: 'الصباح', start: '08:00', end: '16:00' };
const data = { employees: [{ id: 'e' }], schedule: { [date]: { e: { shiftType: 'S' } } }, shiftTypes: [shift] };
test('attendance reminder slots start at shift start, repeat every ten minutes, stop strictly at one hour', () => {
  assert.equal(reminderSlot(start, start + 8 * 3600000, start - 1), null);
  for (let minute = 0; minute < 60; minute++) assert.equal(reminderSlot(start, start + 8 * 3600000, start + minute * 60000), Math.floor(minute / 10));
  assert.equal(reminderSlot(start, start + 8 * 3600000, start + 3600000), null);
  assert.equal(reminderSlot(start, start + 20 * 60000, start + 20 * 60000), null);
  assert.equal(reminderSlot(NaN, start, start), null);
});
test('saved attendance, approved leave, inactive staff, rest days and draft changes cannot produce reminders', () => {
  const now = start + 15 * 60000;
  assert.equal(dueAttendanceReminders(data, 'e', [], [], now).length, 1);
  assert.deepEqual(dueAttendanceReminders(data, 'e', [{ date, empId: 'e', checkIn: '08:00', source: 'تصحيح معتمد' }], [], now), []);
  assert.deepEqual(dueAttendanceReminders(data, 'e', [], [{ date, empId: 'e', status: 'approved' }], now), []);
  assert.equal(dueAttendanceReminders(data, 'e', [], [{ date, empId: 'e', status: 'pending' }], now).length, 1);
  assert.deepEqual(dueAttendanceReminders({ ...data, employees: [{ id: 'e', status: 'archived' }] }, 'e', [], [], now), []);
  assert.deepEqual(dueAttendanceReminders({ ...data, schedule: { [date]: { e: { shiftType: 'OFF' } } } }, 'e', [], [], now), []);
  assert.equal(dueAttendanceReminders({ ...data, schedule: {}, _schedulePublication: { schedule: data.schedule, shiftTypes: [shift] } }, 'e', [], [], now).length, 1);
  assert.deepEqual(dueAttendanceReminders({ ...data, _schedulePublication: { schedule: {}, shiftTypes: [shift] } }, 'e', [], [], now), []);
});
test('overnight second period has its own hour and does not reuse first-period attendance', () => {
  const double = { id: 'S', type: 'double', start: '20:00', end: '23:00', start2: '00:30', end2: '04:00' };
  const now = Date.parse('2026-10-11T00:50:00+03:00');
  const first = { date, empId: 'e', checkIn: '20:00', checkOut: '23:00' };
  const reminders = dueAttendanceReminders({ ...data, shiftTypes: [double] }, 'e', [first], [], now);
  assert.equal(reminders.length, 1); assert.equal(reminders[0].period, 2); assert.equal(reminders[0].date, date);
  assert.deepEqual(dueAttendanceReminders({ ...data, shiftTypes: [double] }, 'e', [{ ...first, checkIn2: '00:40' }], [], now), []);
  assert.deepEqual(dueAttendanceReminders({ ...data, shiftTypes: [double] }, 'e', [first], [], now + 40 * 60000), []);
});
test('browser push subscription only accepts recognized HTTPS providers and bounded keys', () => {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const value = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  assert.equal(validPushSubscription(value), true);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://localhost/test', 'https://fcm.googleapis.com.evil.test/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com:8443/a', 'https://user:pass@fcm.googleapis.com/a']) assert.equal(validPushSubscription({ ...value, endpoint }), false);
  assert.equal(validPushSubscription({ ...value, keys: { ...value.keys, p256dh: 'A'.repeat(1000) } }), false);
});
