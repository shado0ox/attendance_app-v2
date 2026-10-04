import { employeeEmailVerified } from './emailVerification';
import { validMonth } from './attendanceMonths';
import { employeeAtDate, employeeStatus } from './employeeLifecycle';
import { effectiveScheduleData } from './schedulePublication';
export const profileSections = ['overview', 'schedule', 'attendance', 'requests', 'history'] as const;
export type ProfileSection = typeof profileSections[number];
export function parseEmployeeProfileQuery(query: Record<string, unknown>) {
  const section = query.section ?? 'overview';
  const month = query.month ?? new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 7);
  const page = query.page ?? '1';
  if (typeof section !== 'string' || !profileSections.includes(section as ProfileSection)) throw new Error('قسم الملف غير صحيح');
  if (!validMonth(month) || Number(month.slice(0, 4)) > 9999) throw new Error('اختر شهرًا صحيحًا');
  if (typeof page !== 'string' || !/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000) throw new Error('رقم الصفحة غير صحيح');
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return { section: section as ProfileSection, month, from: month + '-01', to: month + '-' + lastDay, page: Number(page), pageSize: 20 };
}
/** Explicit public-to-administrator fields: passwords and credential material stay out. */
export function employeeProfileData(employee: any, departments: any[]) {
  return {
    id: String(employee.id), name: employee.name || '', dept: employee.dept || '',
    departmentName: departments.find(d => d.id === employee.dept)?.name || 'بدون قسم',
    emailVerified: employeeEmailVerified(employee), emailVerifiedAt: employeeEmailVerified(employee) ? employee.emailVerifiedAt : null,
    phone: employee.phone || '', email: employee.email || '', username: employee.username || '',
    status: employeeStatus(employee), statusReason: employee.statusReason || '',
    employmentEffectiveDate: employee.employmentEffectiveDate || null,
  };
}
export function employeeProfileSchedule(mainData: any, employee: any, query: ReturnType<typeof parseEmployeeProfileQuery>) {
  const published = effectiveScheduleData(mainData);
  const shifts = new Map((published.shiftTypes || []).map((s: any) => [String(s.id), s]));
  const items = [];
  for (let day = 1; day <= Number(query.to.slice(-2)); day++) {
    const date = query.month + '-' + String(day).padStart(2, '0');
    const state = employeeAtDate(employee, date);
    const entry = published.schedule?.[date]?.[employee.id];
    const shift: any = shifts.get(String(entry?.shiftType));
    items.push({ date, departmentName: mainData.departments?.find((d: any) => d.id === state.dept)?.name || state.dept || 'بدون قسم', status: employeeStatus(state),
      shiftName: !entry?.shiftType ? 'غير مجدول' : ['A', 'OFF'].includes(entry.shiftType) ? 'راحة / إجازة' : shift?.name || 'شيفت غير معروف',
      start: shift?.start || '', end: shift?.end || '', start2: shift?.type === 'double' ? shift.start2 || '' : '', end2: shift?.type === 'double' ? shift.end2 || '' : '', note: entry?.note || '' });
  }
  return { items, publishedAt: mainData._schedulePublication?.publishedAt || null };
}
