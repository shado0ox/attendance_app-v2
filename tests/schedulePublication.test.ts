import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSchedule, effectiveScheduleData, employeeScheduleContent } from '../src/lib/schedulePublication';
import { canonicalData } from '../src/lib/mainDataVersion';
test('legacy schedule remains visible, a publication overrides both draft days and shift times, including empty published schedule', () => {
  const draft = { schedule: { '2026-10-04': { a: { shiftType: 'S' } } }, shiftTypes: [{ id: 'S', start: '10:00' }] };
  assert.deepEqual(effectiveScheduleData(draft).schedule, draft.schedule);
  assert.deepEqual(effectiveScheduleData({ ...draft, _schedulePublication: { schedule: {}, shiftTypes: [] } }).schedule, {});
  const published = { schedule: { '2026-10-04': { a: { shiftType: 'S' } } }, shiftTypes: [{ id: 'S', start: '08:00' }] };
  assert.equal(effectiveScheduleData({ ...draft, _schedulePublication: published }).shiftTypes[0].start, '08:00');
});
test('employee change notice ignores other staff and unrelated shift definitions but detects own days, notes, removals and used shift times', () => {
  const base = { schedule: { '2026-10-04': { a: { shiftType: 'S' }, b: { shiftType: 'N' } } }, shiftTypes: [{ id: 'S', start: '08:00' }, { id: 'N', start: '20:00' }] };
  const fingerprint = (data: any) => canonicalSchedule(employeeScheduleContent(data, 'a'));
  assert.equal(fingerprint(base), fingerprint({ ...base, schedule: { ...base.schedule, '2026-10-05': { b: { shiftType: 'S' } } }, shiftTypes: [base.shiftTypes[0], { id: 'N', start: '22:00' }] }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, shiftTypes: [{ id: 'S', start: '09:00' }, base.shiftTypes[1]] }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, schedule: {} }));
  assert.equal(canonicalSchedule(base), canonicalData(base));
  assert.equal(canonicalSchedule({ z: [], a: { b: 1, a: 2 } }), canonicalSchedule({ a: { a: 2, b: 1 }, z: [] }));
});
