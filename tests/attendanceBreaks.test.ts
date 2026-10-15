import test from 'node:test';
import assert from 'node:assert/strict';
import { breakMetrics, breakWindow, employeeBreakPlans, employeeWorkState, openBreak, parseBreakRules, type BreakRule } from '../src/lib/attendanceBreaks';
import { allowedAdminRoute, fullAdminAccess } from '../src/lib/adminAccess';
const date = '2026-10-15', shift = { id: 'S', name: 'Morning', start: '08:00', end: '17:00' }, start = Date.parse(date + 'T13:00:00+03:00');
const rule: BreakRule = { id: 'r', name: 'Lunch', enabled: true, scope: 'shifts', employeeIds: [], shiftIds: ['S'], period: 1, mode: 'clock', time: '13:00', offsetMinutes: 120, durationMinutes: 30 };
const data: any = { employees: [{ id: 'e' }], shiftTypes: [shift], schedule: { [date]: { e: { shiftType: 'S' } } } };
test('break configuration validates company targets, duration and overlapping assignments', () => {
  assert.deepEqual(parseBreakRules([rule], data.employees, [shift]), [rule]);
  for (const bad of [{ ...rule, shiftIds: ['foreign'] }, { ...rule, durationMinutes: 0 }, { ...rule, time: '25:00' }, { ...rule, time: '16:50' }, { ...rule, period: 2 }]) assert.throws(() => parseBreakRules([bad], data.employees, [shift]));
  assert.throws(() => parseBreakRules([rule, { ...rule, id: 'other' }], data.employees, [shift]));
});
test('employee override wins shift default and only published assignments produce valid plans', () => {
  const personal = { ...rule, id: 'personal', scope: 'employees' as const, employeeIds: ['e'], shiftIds: [], time: '12:00' };
  assert.equal(employeeBreakPlans(data, [rule, personal], 'e', date)[0].rule.id, 'personal');
  assert.equal(employeeBreakPlans({ ...data, _schedulePublication: { schedule: {}, shiftTypes: [shift] } }, [rule], 'e', date).length, 0);
  assert.equal(employeeBreakPlans({ ...data, employees: [{ id: 'e', status: 'archived' }] }, [rule], 'e', date).length, 0);
  assert.equal(employeeBreakPlans({ ...data, schedule: { [date]: { e: { shiftType: 'OFF' } } } }, [rule], 'e', date).length, 0);
  assert.equal(employeeBreakPlans(data, [{ ...personal, period: 2 }], 'e', date).length, 0);
});
test('offset and clock times use Saudi time and overnight second period keeps original schedule date', () => {
  assert.equal(breakWindow(date, shift, rule)?.start, start);
  assert.equal(breakWindow(date, shift, { ...rule, mode: 'offset', offsetMinutes: 120 })?.start, Date.parse(date + 'T10:00:00+03:00'));
  const double = { id: 'D', type: 'double', start: '20:00', end: '23:00', start2: '00:30', end2: '04:00' };
  assert.equal(breakWindow(date, double, { ...rule, period: 2, time: '01:00' })?.start, Date.parse('2026-10-16T01:00:00+03:00'));
});
test('work state follows check-in, break, late return, return and checkout without changing work minutes', () => {
  const entry = { id: 'b', period: 1, ruleId: 'r', name: 'Lunch', plannedStart: start, plannedEnd: start + 30 * 60000, allowedMinutes: 30, startedAt: start, endedAt: null };
  const record: any = { id: 1, checkIn: '08:00', checkInTs: start - 5 * 3600000, breaks: [] };
  assert.equal(employeeWorkState([]).workStatusText, 'خارج العمل'); assert.equal(employeeWorkState([record]).workStatusText, 'في العمل');
  record.breaks.push(entry); assert.ok(openBreak(record)); assert.equal(employeeWorkState([record], start).workStatusText, 'في الاستراحة');
  assert.equal(employeeWorkState([record], start + 40 * 60000).activeBreakLateMinutes, 10);
  entry.endedAt = start + 40 * 60000;
  assert.equal(employeeWorkState([record], start + 50 * 60000).workStatusText, 'في العمل'); assert.equal(employeeWorkState([record]).breakLateMinutes, 10); assert.equal(openBreak(record), undefined);
  record.checkOut = '17:00'; assert.equal(employeeWorkState([record]).workStatusText, 'خارج العمل');
  record.checkIn2 = '18:00'; assert.equal(employeeWorkState([record]).workStatusText, 'في العمل');
  assert.equal(breakMetrics(entry).elapsedMinutes, 40); assert.equal(breakMetrics(entry).excessMinutes, 10);
});
test('late start with shorter actual break still shows return delay against the scheduled deadline', () => {
  const entry: any = { plannedEnd: start + 30 * 60000, allowedMinutes: 30, startedAt: start + 20 * 60000, endedAt: start + 40 * 60000 };
  assert.deepEqual(breakMetrics(entry), { elapsedMinutes: 20, excessMinutes: 0, lateReturnMinutes: 10 });
});
test('department managers can read scoped reports but cannot edit policies or close breaks', () => {
  const full = fullAdminAccess(), scoped = { ...full, departmentIds: ['d'] };
  assert.equal(allowedAdminRoute(full, 'POST', '/api/attendance-breaks/policy'), true);
  assert.equal(allowedAdminRoute(scoped, 'GET', '/api/attendance-breaks/report'), true);
  assert.equal(allowedAdminRoute(scoped, 'POST', '/api/attendance-breaks/policy'), false);
  assert.equal(allowedAdminRoute(scoped, 'POST', '/api/attendance-breaks/close'), false);
});
