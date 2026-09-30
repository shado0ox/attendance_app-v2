import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoPunchDwell, autoFix, autoPeriodWindow } from '../src/lib/autoPunch';
const now = 1800000000000;
const settings = { attendanceLocations: [{ id: 'branch', name: 'الفرع', lat: 24, lng: 46, radius: 150 }] };
const position = (lat = 24, accuracy = 10, timestamp = now) => ({ coords: { latitude: lat, longitude: 46, accuracy }, timestamp });
test('automatic GPS requires fresh accuracy and a whole uncertainty circle inside an allowed site', () => {
  assert.equal(autoFix(settings, position(), now).kind, 'inside');
  assert.equal(autoFix(settings, position(24, 80), now).kind, 'uncertain');
  assert.equal(autoFix(settings, position(24, 10, now - 16000), now).kind, 'uncertain');
  assert.equal(autoFix(settings, position(24.0013, 20), now).kind, 'uncertain');
  assert.equal(autoFix(settings, position(24.01), now).kind, 'outside');
  const restricted = { ...settings, _attendanceEmployee: { restrictAttendanceLocations: true, allowedAttendanceLocationIds: [] } };
  assert.equal(autoFix(restricted, position(), now).kind, 'uncertain');
});
test('dwell rejects two rapid callbacks, changing branches and long gaps; pause resets confirmation', () => {
  const dwell = new AutoPunchDwell(), fix = autoFix(settings, position(), now);
  assert.equal(dwell.observe(fix, now), false);
  assert.equal(dwell.observe(fix, now + 500), false);
  assert.equal(dwell.observe(fix, now + 30000), true);
  dwell.reset();
  assert.equal(dwell.observe(fix, now + 31000), false);
  assert.equal(dwell.observe({ ...fix, id: 'different' } as any, now + 62000), false);
  assert.equal(dwell.observe(fix, now + 100000), false);
  assert.equal(dwell.observe(fix, now + 160000), false);
  const outside = autoFix(settings, position(24.01), now);
  dwell.reset();
  for (let elapsed = 0; elapsed < 120000; elapsed += 20000) assert.equal(dwell.observe(outside, now + elapsed), false);
  assert.equal(dwell.observe(outside, now + 120000), true);
});
test('period windows preserve overnight dates and refuse incomplete double shifts', () => {
  const date = '2026-09-30';
  const night = autoPeriodWindow(date, { start: '22:00', end: '06:00' })!;
  assert.equal(new Date(night.end).toISOString(), '2026-10-01T03:00:00.000Z');
  assert.equal(autoPeriodWindow(date, { type: 'double', start: '08:00', end: '22:00' }), null);
  const second = autoPeriodWindow(date, { type: 'double', start: '20:00', end: '23:00', start2: '01:00', end2: '04:00' }, true)!;
  assert.equal(new Date(second.start).toISOString(), '2026-09-30T22:00:00.000Z');
});
