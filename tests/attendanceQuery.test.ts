import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttendanceQuery, attendanceReportPage } from '../src/lib/attendanceQuery';
import { buildAttendanceDays } from '../src/lib/attendanceReport';
test('report queries reject impossible dates, excessive ranges and invalid pagination', () => {
  for (const query of [{ from: '2026-02-30' }, { from: '2026-02-10', to: '2026-01-01' }, { from: '2024-01-01', to: '2026-01-01' }, { page: '0' }, { pageSize: '101' }, { page: '1.5' }, { empId: ['x'] }, { status: 'invalid' }]) assert.throws(() => parseAttendanceQuery(query));
  assert.equal(parseAttendanceQuery({ from: '2024-02-29', to: '2024-02-29' }).pageSize, 50);
});
test('server pages whole employee days and uses all filtered days for totals and export', () => {
  const records = Array.from({ length: 55 }, (_, id) => ({ id, empId: String(id), empName: String(id), date: '2026-09-30', checkIn: '08:00', checkOut: '17:00' }));
  const days = buildAttendanceDays([...records, { ...records[0], id: 99 }], {});
  const query = parseAttendanceQuery({ from: '2026-09-30', page: '2' });
  const result = attendanceReportPage(days, query);
  assert.equal(result.items.length, 5);
  assert.equal(result.total, 55);
  assert.equal(result.totalMinutes, 55 * 540);
  const all = attendanceReportPage(days, { ...query, mode: 'all' });
  assert.equal(all.items.length, 55);
  assert.equal(all.items.find(day => day.empId === '0').ids.length, 2);
  assert.equal(attendanceReportPage(days, { ...query, page: 99 }).page, 2);
  const review = attendanceReportPage([...days, { minutes: null }], { ...query, status: 'present' });
  assert.equal(review.total, 1); assert.equal(review.reviewCount, 1); assert.equal(review.totalMinutes, 0);
});
