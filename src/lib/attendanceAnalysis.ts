import { employeeAtDate, isActiveEmployee } from './employeeLifecycle';
import { validAttendanceDate } from './attendanceMonths';
const clock = (value: unknown) => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute;
};
export function shiftWindow(date: string, shift: any) {
  const start = clock(shift?.start), end = clock(shift?.end);
  if (start === null || end === null || start === end) return null;
  const base = Date.parse(date + 'T00:00:00+03:00');
  const endMinute = end < start ? end + 1440 : end;
  let finalEnd = endMinute, minutes = endMinute - start;
  if (shift.type === 'double') {
    const start2 = clock(shift.start2), end2 = clock(shift.end2);
    if (start2 === null || end2 === null || start2 === end2) return null;
    const secondStart = start2 < start ? start2 + 1440 : start2;
    const secondEnd = end2 <= start2 ? end2 + (secondStart >= 1440 ? 2880 : 1440) : end2 + (secondStart >= 1440 ? 1440 : 0);
    if (secondStart < endMinute || secondEnd - start > 1440) return null;
    finalEnd = secondEnd; minutes += secondEnd - secondStart;
  }
  return { start: base + start * 60000, end: base + finalEnd * 60000, minutes, double: shift.type === 'double' };
}
export function analyzeAttendance(days: any[], mainData: any, query: { from: string; to: string; empId: string; dept: string }, approvedLeaves: any[] = [], now = Date.now()) {
  const employees = new Map((mainData?.employees || []).map((emp: any) => [String(emp.id), emp]));
  const shifts = new Map((mainData?.shiftTypes || []).map((shift: any) => [String(shift.id), shift]));
  const schedule = mainData?.schedule || {};
  const leaveKeys = new Set(approvedLeaves.map(leave => `${leave.empId}|${leave.date}`));
  const grouped = new Map(days.map(day => [`${day.empId}|${day.date}`, day]));
  for (const [date, assignments] of Object.entries(schedule)) {
    if (!validAttendanceDate(date) || date < query.from || date > query.to || !assignments || typeof assignments !== 'object') continue;
    for (const [empId, assigned] of Object.entries(assignments)) {
      const emp: any = employeeAtDate(employees.get(empId), date);
      if (!isActiveEmployee(emp) || !(assigned as any)?.shiftType || (query.empId && query.empId !== empId) || (query.dept && query.dept !== emp.dept)) continue;
      const key = `${empId}|${date}`;
      if (!grouped.has(key)) grouped.set(key, { id: key, ids: [], empId, empName: emp.name, dept: emp.dept || '', date, minutes: null, ignored: 0, note: (assigned as any).note || '', reportStatus: 'بدون بصمة' });
    }
  }
  const configured = Number(mainData?.settings?.attendanceAnalysis?.graceMinutes ?? 0);
  const grace = Number.isInteger(configured) && configured >= 0 && configured <= 120 ? configured : 0;
  return [...grouped.values()].map(day => {
    const assigned = schedule[day.date]?.[day.empId];
    const shift: any = shifts.get(String(assigned?.shiftType));
    const analysis: any = { reason: 'unassigned', status: 'غير مجدول', absent: false, needsReview: false, lateMinutes: null, earlyMinutes: null, overtimeMinutes: null, scheduledMinutes: null, graceMinutes: grace };
    const hasPunch = !!day.first || !!day.last || day.ids.length > 0;
    if (leaveKeys.has(`${day.empId}|${day.date}`) || (assigned?.shiftType === 'A' && /إجازة معتمدة/.test(assigned.note || ''))) {
      analysis.reason = 'leave'; analysis.status = hasPunch ? 'إجازة مع بصمة — للمراجعة' : 'إجازة معتمدة'; analysis.needsReview = hasPunch;
    } else if (['A', 'OFF'].includes(assigned?.shiftType)) { analysis.reason = 'rest'; analysis.status = hasPunch ? 'بصمة في يوم راحة — للمراجعة' : 'راحة'; }
    else if (assigned?.shiftType) {
      const window = shiftWindow(day.date, shift);
      if (!window) { analysis.reason = 'shift_invalid'; analysis.status = 'تعريف الدوام ناقص أو متداخل — للمراجعة'; analysis.needsReview = true; }
      else {
        analysis.reason = 'scheduled';
        analysis.scheduledMinutes = window.minutes; analysis.start = window.start; analysis.end = window.end;
        if (!hasPunch) {
          analysis.reason = 'awaiting';
          analysis.absent = now >= window.end;
          analysis.status = analysis.absent ? 'غياب' : now < window.start ? 'لم يبدأ الدوام' : 'الدوام جارٍ — بدون بصمة';
        } else if (day.minutes !== null && (day.first.time < window.start - 86400000 || day.last.time > window.end + 86400000)) { analysis.reason = 'punch_date'; analysis.status = 'تاريخ البصمة لا يوافق الدوام — للمراجعة'; analysis.needsReview = true; }
        else if (day.minutes === null) { analysis.reason = 'missing'; analysis.status = 'بصمة ناقصة أو غير صالحة — للمراجعة'; analysis.needsReview = true; }
        else {
          analysis.lateMinutes = Math.max(0, Math.round((day.first.time - window.start) / 60000) - grace);
          analysis.earlyMinutes = Math.max(0, Math.round((window.end - day.last.time) / 60000));
          if (window.double) { analysis.reason = 'double'; analysis.status = 'فترتان — راجع بصمات كل فترة'; analysis.needsReview = true; }
          else { analysis.overtimeMinutes = Math.max(0, Math.round((day.last.time - window.end) / 60000)); analysis.status = 'محلل حسب الجدول'; }
        }
      }
    }
    if (analysis.status === 'غير مجدول' && day.minutes === null && hasPunch) analysis.needsReview = true;
    if (analysis.status === 'بصمة في يوم راحة — للمراجعة') analysis.needsReview = true;
    return { ...day, reportStatus: hasPunch ? day.reportStatus : analysis.status, analysis };
  }).filter(day => !query.dept || day.dept === query.dept).sort((a, b) => b.date.localeCompare(a.date) || String(a.empName).localeCompare(String(b.empName), 'ar'));
}
