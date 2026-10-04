import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAttendance } from '../src/lib/attendanceAnalysis';
import { buildAttendanceDays } from '../src/lib/attendanceReport';
import { attendanceExceptions, exceptionReportPage, parseExceptionQuery } from '../src/lib/attendanceExceptions';
const record = (date: string, values: any = {}) => ({ id: 1, empId: 'a', empName: 'A', dept: 'd', date, checkIn: '08:00', checkOut: null, ...values });
const data = (date: string, shift: any = { id: 'S', start: '08:00', end: '16:00' }) => ({ employees: [{ id: 'a', name: 'A', dept: 'd' }], shiftTypes: [shift], schedule: { [date]: { a: { shiftType: shift.id } } }, settings: { attendanceAnalysis: { graceMinutes: 5 } } });
const analyze = (records: any[], source: any, date: string, now: number) => analyzeAttendance(buildAttendanceDays(records, {}), source, { from: date, to: date, empId: '', dept: '' }, [], now);
test('live checkout and overnight windows become missing only after the shift ends', () => {
  const date = '2026-10-04', source = data(date);
  const liveNow = Date.parse(date + 'T10:00:00+03:00');
  assert.deepEqual(attendanceExceptions(analyze([record(date)], source, date, liveNow)[0], liveNow).types, []);
  const end = Date.parse(date + 'T16:00:00+03:00');
  assert.deepEqual(attendanceExceptions(analyze([record(date)], source, date, end)[0], end).types, ['missing']);
  const overnight = data(date, { id: 'N', start: '22:00', end: '06:00' });
  const during = Date.parse('2026-10-05T02:00:00+03:00');
  assert.deepEqual(attendanceExceptions(analyze([record(date, { checkIn: '22:00' })], overnight, date, during)[0], during).types, []);
  const finished = Date.parse('2026-10-05T06:00:00+03:00');
  assert.ok(attendanceExceptions(analyze([record(date, { checkIn: '22:00' })], overnight, date, finished)[0], finished).types.includes('missing'));
});
test('live late arrival uses published window and grace without requiring checkout', () => {
  const date = '2026-10-04', now = Date.parse(date + 'T10:00:00+03:00');
  const result = attendanceExceptions(analyze([record(date, { checkIn: '08:15' })], data(date), date, now)[0], now);
  assert.deepEqual(result.types, ['late']);
  assert.equal(result.lateMinutes, 10);
  const latestIn = analyze([record(date, { checkOut: '09:00', checkIn2: '09:30' })], data(date), date, now)[0];
  assert.ok(!attendanceExceptions(latestIn, now).types.includes('missing'));
});
test('future shifts, ongoing no-punch shifts and approved leave are not absent', () => {
  const date = '2026-10-04', now = Date.parse(date + 'T10:00:00+03:00');
  assert.deepEqual(attendanceExceptions(analyze([], data(date), date, now)[0], now).types, []);
  const ended = Date.parse(date + 'T17:00:00+03:00');
  const [absent] = analyze([], data(date), date, ended);
  assert.deepEqual(attendanceExceptions(absent, ended).types, ['absent']);
  const [leave] = analyzeAttendance([], data(date), { from: date, to: date, empId: '', dept: '' }, [{ empId: 'a', date }], ended);
  assert.deepEqual(attendanceExceptions(leave, ended).types, []);
});
test('overlapping exceptions retain one employee-day and stable complete-day pagination', () => {
  const day = { date: '2026-10-04', empId: 'a', empName: 'A', ids: [1], first: { time: 1 }, last: { time: 2 }, minutes: 1, analysis: { reason: 'scheduled', lateMinutes: 10, earlyMinutes: 15, overtimeMinutes: 0 } };
  const duplicate = { ...day, empId: 'b', empName: 'B', ids: [2,3], analysis: { reason: 'scheduled' } };
  const query = parseExceptionQuery({ from: '2026-10-01', to: '2026-10-31', pageSize: '1' });
  const result = exceptionReportPage([day, duplicate], query);
  assert.equal(result.totalExceptionDays, 2);
  assert.equal(result.counts.late, 1);
  assert.equal(result.counts.early, 1);
  assert.equal(result.items[0].empId, 'b');
  assert.equal(result.items[0].ids.length, 2);
  assert.equal(exceptionReportPage([day,duplicate], { ...query, page: 2 }).items[0].empId, 'a');
  const late = exceptionReportPage([day,duplicate], { ...query, type: 'late', mode: 'all' });
  assert.equal(late.total, 1);
  assert.equal(late.counts.duplicate, 1, 'summary counts use all exception types within the period/employee/department');
});
test('rest, leave punches and invalid times remain explicit review cases', () => {
  const date = '2026-10-04', now = Date.parse(date + 'T17:00:00+03:00');
  const rest = data(date, { id: 'OFF' });
  assert.ok(attendanceExceptions(analyze([record(date, { checkOut: '16:00' })], rest, date, now)[0], now).types.includes('off_day'));
  const invalid = analyze([record(date, { checkIn: 'bad' })], data(date), date, now)[0];
  assert.ok(attendanceExceptions(invalid, now).types.includes('invalid'));
  assert.equal(attendanceExceptions(invalid, now).lateMinutes, 0);
});
test('exception query rejects long periods and unknown or non-string filters', () => {
  assert.throws(() => parseExceptionQuery({ from: '2026-10-01', to: '2026-11-01' }));
  assert.throws(() => parseExceptionQuery({ type: 'prototype' }));
  assert.throws(() => parseExceptionQuery({ type: '__proto__' }));
  assert.throws(() => parseExceptionQuery({ type: ['late'] }));
  assert.equal(parseExceptionQuery({ from: '2026-10-01', to: '2026-10-31', mode: 'all' }).analysis, true);
});
