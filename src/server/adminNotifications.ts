import { validAttendanceDate } from '../lib/attendanceMonths';
import { type AdminAccess, ownsDay } from '../lib/adminAccess';
import { type AdminNotification, type NotificationCategory, dateOffset, parseNotificationQuery } from '../lib/adminNotifications';
import { mainDataVersion } from '../lib/mainDataVersion';
import { employeeAtDate } from '../lib/employeeLifecycle';
import { effectiveScheduleData } from '../lib/schedulePublication';
import { coverageAlerts } from '../lib/schedulePlanning';
import { analyzeAttendance } from '../lib/attendanceAnalysis';
import { buildAttendanceDays } from '../lib/attendanceReport';
import { attendanceExceptions, exceptionLabels } from '../lib/attendanceExceptions';
export function notificationPermissions(access: AdminAccess) {
  const p = access.permissions;
  return { requests: !!(p.canApproveRequests || p.canViewReports), coverage: !!(p.canEditSchedule || p.canViewReports || p.canPrint || p.canManageDepts), attendance: !!p.canViewReports };
}
export const notificationStateKey = (companyId: string, auth: { role: string; id?: unknown; username?: string }) => 'notificationRead:' + mainDataVersion({ companyId, role: auth.role, account: auth.id !== undefined ? { id: auth.id } : { username: auth.username || 'master' } });
/** Derived active alerts only. Reading this builder does not persist anything or send mail/push. */
export function buildAdminNotifications(companyId: string, data: any, records: any[], requests: any[], access: AdminAccess, query: ReturnType<typeof parseNotificationQuery>, now = Date.now()) {
  const items: AdminNotification[] = [], permissions = notificationPermissions(access), published = effectiveScheduleData(data);
  const today = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
  const name = (id: string) => data?.departments?.find((d: any) => d.id === id)?.name || id || 'بدون قسم';
  const inScope = (row: any) => validAttendanceDate(row.date) && row.date >= query.from && row.date <= query.to && ownsDay(access, data, row) && (!query.dept || row.dept === query.dept || (!row.dept && employeeAtDate(data?.employees?.find((e: any) => String(e.id) === String(row.empId)), row.date)?.dept === query.dept));
  const add = (category: NotificationCategory, identity: any, item: Omit<AdminNotification, 'id' | 'category'>) => items.push({ ...item, category, id: category + '-' + mainDataVersion({ companyId, identity }) });
  const typeNames: Record<string, string> = { leave: 'إجازة', swap: 'تبديل دوام', shift_change: 'تغيير شيفت', attendance_adjustment: 'تصحيح بصمة' };
  if (permissions.requests) for (const r of requests.filter(r => r.status === 'pending' && inScope(r))) {
    const emp = data?.employees?.find((e: any) => String(e.id) === String(r.empId)), dept = r.dept || employeeAtDate(emp, r.date)?.dept || '';
    add('requests', { id: r.id, date: r.date, empId: r.empId, type: r.type, notes: r.notes, targetShift: r.targetShift, swap: r.swapWithEmpId, in: r.checkInTime, out: r.checkOutTime, details: r.details }, { date: r.date, dept, departmentName: name(dept), empId: r.empId, title: `طلب ${typeNames[r.type] || 'موظف'} معلق`, message: `${emp?.name || r.empName} · ${r.notes || 'بانتظار المراجعة'}`, priority: 2, target: { view: 'requests', date: r.date, dept, empId: r.empId } });
  }
  const leaves = requests.filter(r => r.type === 'leave' && r.status === 'approved');
  if (permissions.coverage) for (let date = query.from; date <= query.to; date = dateOffset(date, 1)) {
    if (date < today) continue;
    const available = (data?.employees || []).filter((e: any) => !leaves.some(r => r.date === date && String(r.empId) === String(e.id)));
    for (const dept of (data?.departments || []).filter((d: any) => (!query.dept || d.id === query.dept) && (access.departmentIds === null || access.departmentIds.includes(d.id)))) {
      for (const gap of coverageAlerts([dept], available, published.shiftTypes || [], published.schedule || {}, [date])) {
        const assignments = Object.entries(published.schedule?.[date] || {}).filter(([id]) => employeeAtDate(data.employees?.find((e: any) => String(e.id) === id), date)?.dept === dept.id).sort(([a], [b]) => a.localeCompare(b));
        add('coverage', { gap: gap.id, dept: {id:dept.id,name:dept.name,needsMorning:dept.needsMorning,needsEvening:dept.needsEvening,friday:dept.friday}, assignments, available: available.filter((e: any) => employeeAtDate(e, date)?.dept === dept.id).map((e: any) => ({id:e.id,status:employeeAtDate(e,date)?.status})).sort((a: any,b: any) => String(a.id).localeCompare(String(b.id))), shifts: (published.shiftTypes || []).filter((s: any) => assignments.some(([,entry]: any) => entry.shiftType === s.id)).sort((a: any,b: any) => String(a.id).localeCompare(String(b.id))) }, { date, dept: dept.id, departmentName: dept.name, title: 'نقص تغطية الدوام', message: gap.msg, priority: 1, target: { view: 'schedule', date, dept: dept.id } });
      }
    }
  }
  if (permissions.attendance && query.from <= today) {
    const to = query.to < today ? query.to : today;
    const scopedRecords = records.filter(inScope);
    const days = analyzeAttendance(buildAttendanceDays(scopedRecords, data?.settings), published, { from: query.from, to, dept: query.dept, empId: '' }, leaves, now);
    for (const day of days.filter(inScope)) {
      const exception = attendanceExceptions(day, now), types = exception.types.filter(type => !['split_shift', 'overtime'].includes(type));
      if (!types.length) continue;
      add('attendance', { empId: day.empId, date: day.date, dept: day.dept, ids: day.ids, first: day.first?.time, last: day.last?.time, minutes: day.minutes, types, late: exception.lateMinutes, early: day.analysis?.earlyMinutes, note: day.note }, { date: day.date, dept: day.dept, departmentName: name(day.dept), empId: day.empId, title: types.map(type => exceptionLabels[type]).join('، '), message: `${day.empName} · ${day.analysis?.shiftName || 'مراجعة بصمات اليوم'}`, priority: exception.priority, target: { view: 'exceptions', date: day.date, dept: day.dept, empId: day.empId } });
    }
  }
  return items;
}
