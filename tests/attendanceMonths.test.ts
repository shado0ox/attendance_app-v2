import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validMonth, validAttendanceDate, previousMonth } from '../src/lib/attendanceMonths';
test('monthly report dates reject malformed values and impossible calendar dates', () => {
  for (const month of ['2026-00', '2026-13', '26-01', '', null]) assert.equal(validMonth(month), false);
  assert.equal(validMonth('2026-01'), true);
  assert.equal(validAttendanceDate('2026-02-30'), false);
  assert.equal(validAttendanceDate('2026-02-29'), false);
  assert.equal(validAttendanceDate('2024-02-29'), true);
  assert.equal(previousMonth('2026-01'), '2025-12');
});
