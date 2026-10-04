import { parseAttendanceQuery } from './attendanceQuery';
export const exceptionLabels = { absent: 'غياب', missing: 'بصمة ناقصة', invalid: 'بصمة / تعريف دوام غير صالح', late: 'تأخير', early: 'انصراف مبكر', unscheduled: 'بصمة بدون جدول', off_day: 'بصمة في يوم راحة', leave_punch: 'بصمة أثناء إجازة', split_shift: 'مراجعة فترتي الدوام', duplicate: 'سجلات متعددة في اليوم', overtime: 'إضافي محتمل' };
export type ExceptionType = keyof typeof exceptionLabels;
export function parseExceptionQuery(query: Record<string, unknown>) {
  const parsed = parseAttendanceQuery({ ...query, status: '', analysis: '1' });
  if ((Date.parse(parsed.to) - Date.parse(parsed.from)) / 86400000 > 30) throw new Error('اختر فترة لا تتجاوز 31 يومًا للاستثناءات');
  const type = query.type ?? '';
  if (typeof type !== 'string' || (type && !Object.hasOwn(exceptionLabels, type))) throw new Error('نوع الاستثناء غير صحيح');
  return { ...parsed, type: type as ExceptionType | '' };
}
/** An ongoing shift does not become a missing checkout before its end. */
export function attendanceExceptions(day: any, now = Date.now()) {
  const analysis = day.analysis || {}, types: ExceptionType[] = [];
  const hasPunch = !!day.first || !!day.last || (day.ids || []).length > 0;
  const issue = day.punchIssue;
  const ongoing = !!day.first && (!day.last || day.lastIn?.time > day.last.time) && analysis.end > now && issue === 'missing_out';
  const invalid = ['invalid', 'duration'].includes(issue) || ['shift_invalid', 'punch_date'].includes(analysis.reason);
  const late = !invalid && day.first && analysis.start && ['missing', 'scheduled', 'double'].includes(analysis.reason)
    ? analysis.lateMinutes ?? Math.max(0, Math.round((day.first.time - analysis.start) / 60000) - (analysis.graceMinutes || 0)) : analysis.lateMinutes || 0;
  if (analysis.absent) types.push('absent');
  if (hasPunch && !ongoing && ['missing_in', 'missing_out'].includes(issue)) types.push('missing');
  if (invalid) types.push('invalid');
  if (late > 0) types.push('late');
  if ((analysis.earlyMinutes || 0) > 0) types.push('early');
  if (hasPunch && analysis.reason === 'unassigned') types.push('unscheduled');
  if (hasPunch && analysis.reason === 'rest') types.push('off_day');
  if (hasPunch && analysis.reason === 'leave') types.push('leave_punch');
  if (analysis.reason === 'double') types.push('split_shift');
  if ((day.ids || []).length > 1) types.push('duplicate');
  if ((analysis.overtimeMinutes || 0) > 0) types.push('overtime');
  const priority = types.some(t => ['invalid', 'missing', 'duplicate'].includes(t)) ? 0 : types.includes('absent') ? 1 : types.some(t => ['unscheduled', 'off_day', 'leave_punch', 'split_shift'].includes(t)) ? 2 : types.some(t => ['late', 'early'].includes(t)) ? 3 : 4;
  return { types, priority, lateMinutes: late || 0 };
}
export function exceptionReportPage(days: any[], query: ReturnType<typeof parseExceptionQuery>, now = Date.now()) {
  const classified = days.map(day => ({ ...day, exceptions: attendanceExceptions(day, now) })).filter(day => day.exceptions.types.length);
  const counts = Object.fromEntries(Object.keys(exceptionLabels).map(type => [type, classified.filter(day => day.exceptions.types.includes(type)).length]));
  const filtered = classified.filter(day => !query.type || day.exceptions.types.includes(query.type)).sort((a,b) => a.exceptions.priority - b.exceptions.priority || b.date.localeCompare(a.date) || String(a.empName).localeCompare(String(b.empName), 'ar') || String(a.empId).localeCompare(String(b.empId)));
  const total = filtered.length, pageCount = Math.max(1, Math.ceil(total / query.pageSize)), page = Math.min(query.page, pageCount);
  return { items: query.mode === 'all' ? filtered : filtered.slice((page-1)*query.pageSize,page*query.pageSize), total, totalExceptionDays: classified.length, counts, page, pageCount };
}
