import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeWeekDates } from '../src/lib/employeeWeek';
test('Riyadh week runs Saturday-Friday across month and year boundaries',()=>{
 assert.deepEqual(employeeWeekDates(Date.parse('2026-10-06T16:00:00Z')),['2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09']);
 assert.equal(employeeWeekDates(Date.parse('2026-10-02T21:30:00Z'))[0],'2026-10-03');
 assert.equal(employeeWeekDates(Date.parse('2026-01-01T10:00:00Z'))[0],'2025-12-27');
 assert.equal(employeeWeekDates(Date.parse('2026-10-06T16:00:00Z'),1)[0],'2026-10-10');
 assert.equal(employeeWeekDates(Date.parse('2026-10-06T16:00:00Z'),-1)[6],'2026-10-02');
});
