import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAttendance, shiftWindow } from '../src/lib/attendanceAnalysis';
import { buildAttendanceDays } from '../src/lib/attendanceReport';
const date = '2026-09-20';
const query = { from: date, to: date, empId: '', dept: '' };
const data: any = { employees: [{ id: 'e1', name: 'Employee', dept: 'd1' }], shiftTypes: [{ id: 'S', start: '08:00', end: '17:00' }], schedule: { [date]: { e1: { shiftType: 'S' } } }, settings: { attendanceAnalysis: { graceMinutes: 5 } } };
const now = Date.parse(date + 'T18:00:00+03:00');
const record = (checkIn: string, checkOut?: string) => buildAttendanceDays([{ id: 1, empId: 'e1', empName: 'Employee', dept: 'd1', date, checkIn, checkOut }], {});
test('grace, early departure and potential overtime follow scheduled boundaries', () => {
  let day = analyzeAttendance(record('08:15', '16:40'), data, query, [], now)[0];
  assert.equal(day.analysis.lateMinutes, 10); assert.equal(day.analysis.earlyMinutes, 20); assert.equal(day.analysis.overtimeMinutes, 0);
  day = analyzeAttendance(record('07:00', '17:30'), data, query, [], now)[0];
  assert.equal(day.analysis.lateMinutes, 0); assert.equal(day.analysis.overtimeMinutes, 30);
  assert.equal(analyzeAttendance(record('08:05', '17:00'), data, query, [], now)[0].analysis.lateMinutes, 0);
});
test('absence only follows completed scheduled shifts, never rest, leave or missing checkout', () => {
  assert.equal(analyzeAttendance([], data, query, [], now)[0].analysis.absent, true);
  assert.equal(analyzeAttendance([], data, query, [], Date.parse(date + 'T10:00:00+03:00'))[0].analysis.absent, false);
  assert.equal(analyzeAttendance([], data, query, [{ empId: 'e1', date }], now)[0].analysis.status, 'إجازة معتمدة');
  const rest = { ...data, schedule: { [date]: { e1: { shiftType: 'A' } } } };
  assert.equal(analyzeAttendance([], rest, query, [], now)[0].analysis.status, 'راحة');
  const missing = analyzeAttendance(record('08:00'), data, query, [], now)[0];
  assert.equal(missing.analysis.absent, false); assert.equal(missing.analysis.needsReview, true); assert.equal(missing.analysis.overtimeMinutes, null);
  assert.equal(analyzeAttendance([], { ...data, schedule: {} }, query, [], now).length, 0);
  assert.equal(analyzeAttendance([], data, { ...query, empId: 'other' }, [], now).length, 0);
});
test('overnight shifts remain open until their following-day end, split shifts require review', () => {
  const night = { ...data, shiftTypes: [{ id: 'S', start: '22:00', end: '06:00' }] };
  const midnight = Date.parse('2026-09-21T00:00:00+03:00');
  assert.equal(analyzeAttendance([], night, query, [], midnight)[0].analysis.absent, false);
  assert.equal(shiftWindow(date, night.shiftTypes[0])?.minutes, 480);
  const double = { ...data, shiftTypes: [{ id: 'S', type: 'double', start: '08:00', end: '12:00', start2: '17:00', end2: '21:00' }] };
  const day = analyzeAttendance(record('08:00', '21:30'), double, query, [], now)[0];
  assert.equal(day.minutes, 810); assert.equal(day.analysis.scheduledMinutes, 480); assert.equal(day.analysis.overtimeMinutes, null); assert.equal(day.analysis.needsReview, true);
  assert.equal(shiftWindow(date, { ...double.shiftTypes[0], end: '22:00' }), null);
  assert.equal(shiftWindow(date, { start: '08:00', end: '22:00', type: 'double' }), null);
});

test('department changes do not turn an existing historical punch into synthetic absence', () => {
  const moved = { ...data, employees: [{ ...data.employees[0], dept: 'new-dept' }] };
  assert.equal(analyzeAttendance(record('08:00', '17:00'), moved, { ...query, dept: 'new-dept' }, [], now).length, 0);
  assert.equal(analyzeAttendance(record('08:00', '17:00'), moved, { ...query, dept: 'd1' }, [], now)[0].analysis.absent, false);
});
