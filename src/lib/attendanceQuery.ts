import { validAttendanceDate } from './attendanceMonths';
export const attendanceToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
export function parseAttendanceQuery(query: Record<string, unknown>) {
  const from = query.from ?? attendanceToday(), to = query.to ?? from;
  if (!validAttendanceDate(from) || !validAttendanceDate(to) || from > to) throw new Error('حدد فترة صحيحة من تاريخ إلى تاريخ');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 365) throw new Error('اختر فترة لا تتجاوز 366 يومًا');
  const text = (key: string) => {
    const value = query[key] ?? '';
    if (typeof value !== 'string' || value.length > 200) throw new Error('قيمة البحث غير صالحة');
    return value;
  };
  const empId = text('empId'), dept = text('dept'), status = text('status'), mode = text('mode'), analysis = text('analysis');
  if (!['', 'present', 'checkedout', 'absent', 'late', 'early', 'overtime'].includes(status) || !['', 'all'].includes(mode)) throw new Error('نوع البحث غير صالح');
  if (!['', '1'].includes(analysis) || (['absent', 'late', 'early', 'overtime'].includes(status) && analysis !== '1')) throw new Error('فعّل تحليل الدوام لهذا الفلتر');
  const integer = (key: string, fallback: number, max: number) => {
    const raw = query[key] ?? String(fallback);
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) throw new Error('رقم الصفحة أو حجمها غير صالح');
    return Number(raw);
  };
  return { from, to, empId, dept, status, mode, analysis: analysis === '1', page: integer('page', 1, 1000000), pageSize: integer('pageSize', 50, 100) };
}
export function attendanceReportPage(days: any[], query: ReturnType<typeof parseAttendanceQuery>) {
  const filtered = days.filter(day => query.status === 'absent' ? day.analysis?.absent : ['late', 'early', 'overtime'].includes(query.status) ? (day.analysis?.[query.status + 'Minutes'] || 0) > 0 : query.status === 'present' ? (day.analysis ? day.analysis.needsReview : day.minutes === null) : query.status === 'checkedout' ? day.minutes !== null : true);
  const total = filtered.length, pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  return { items: query.mode === 'all' ? filtered : filtered.slice((page - 1) * query.pageSize, page * query.pageSize), total, page, pageCount,
    totalMinutes: filtered.reduce((sum, day) => sum + (day.minutes || 0), 0), reviewCount: filtered.filter(day => day.analysis ? day.analysis.needsReview : day.minutes === null).length,
    absentDays: filtered.filter(day => day.analysis?.absent).length, lateDays: filtered.filter(day => day.analysis?.lateMinutes > 0).length,
    lateMinutes: filtered.reduce((sum, day) => sum + (day.analysis?.lateMinutes || 0), 0), earlyMinutes: filtered.reduce((sum, day) => sum + (day.analysis?.earlyMinutes || 0), 0), overtimeMinutes: filtered.reduce((sum, day) => sum + (day.analysis?.overtimeMinutes || 0), 0) };
}
