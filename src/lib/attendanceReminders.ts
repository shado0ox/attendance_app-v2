import { autoPeriodWindow } from './autoPunch';
import { effectiveScheduleData } from './schedulePublication';
import { employeeAtDate, isActiveEmployee } from './employeeLifecycle';

export const REMINDER_INTERVAL = 10 * 60000;
export const REMINDER_DURATION = 60 * 60000;
export function reminderSlot(start: number, end: number, now: number) {
  if (![start, end, now].every(Number.isFinite) || end <= start || now < start || now >= Math.min(end, start + REMINDER_DURATION)) return null;
  return Math.floor((now - start) / REMINDER_INTERVAL);
}
export function dueAttendanceReminders(data: any, employeeId: string, records: any[], leaves: any[], now = Date.now()) {
  const employee = data?.employees?.find((e: any) => String(e.id) === employeeId);
  if (!isActiveEmployee(employee)) return [];
  const published = effectiveScheduleData(data);
  const result: { key: string; date: string; period: number; start: number; expiresAt: number; shiftName: string }[] = [];
  for (const offset of [-86400000, 0]) {
    const date = new Date(now + 3 * 3600000 + offset).toISOString().slice(0, 10);
    if (!isActiveEmployee(employeeAtDate(employee, date)) || leaves.some(r => String(r.empId) === employeeId && r.date === date && r.status === 'approved')) continue;
    const assignment = published.schedule?.[date]?.[employeeId];
    if (!assignment || ['A', 'OFF'].includes(assignment.shiftType)) continue;
    const shift = published.shiftTypes?.find((s: any) => s.id === assignment.shiftType);
    for (const period of [1, 2]) {
      const window = autoPeriodWindow(date, shift, period === 2);
      if (!window) continue;
      const slot = reminderSlot(window.start, window.end, now);
      if (slot === null || records.some(r => r.date === date && String(r.empId) === employeeId && r[period === 1 ? 'checkIn' : 'checkIn2'])) continue;
      result.push({ key: `${date}:${period}:${window.start}:${slot}`, date, period, start: window.start, expiresAt: Math.min(window.end, window.start + REMINDER_DURATION), shiftName: shift.name || 'الدوام' });
    }
  }
  return result;
}
