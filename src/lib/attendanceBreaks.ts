import { autoPeriodWindow } from './autoPunch';
import { effectiveScheduleData } from './schedulePublication';
import { employeeAtDate, isActiveEmployee } from './employeeLifecycle';
export type BreakRule = { id: string; name: string; enabled: boolean; scope: 'employees' | 'shifts'; employeeIds: string[]; shiftIds: string[]; period: 1 | 2; mode: 'clock' | 'offset'; time: string; offsetMinutes: number; durationMinutes: number };
export type BreakEntry = { id: string; period: number; ruleId: string; name: string; plannedStart: number; plannedEnd: number; allowedMinutes: number; startedAt: number; endedAt: number | null };
export function parseBreakRules(input: any, employees: any[], shifts: any[]): BreakRule[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error('الحد الأقصى 100 إعداد للاستراحة');
  const seen = new Set<string>(), assignments = new Set<string>();
  return input.map((rule: any) => {
    if (!rule || typeof rule.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(rule.id) || seen.has(rule.id)) throw new Error('معرف الاستراحة غير صالح أو مكرر'); seen.add(rule.id);
    if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 80 || typeof rule.enabled !== 'boolean' || !['employees', 'shifts'].includes(rule.scope) || ![1, 2].includes(rule.period) || !['clock', 'offset'].includes(rule.mode)) throw new Error('أكمل اسم ونوع الاستراحة والفترة');
    if (!Number.isInteger(rule.durationMinutes) || rule.durationMinutes < 1 || rule.durationMinutes > 180 || !Number.isInteger(rule.offsetMinutes) || rule.offsetMinutes < 1 || rule.offsetMinutes > 1440 || typeof rule.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.time)) throw new Error('حدد موعدًا صحيحًا ومدة من 1 إلى 180 دقيقة');
    const ids = (field: string, all: any[]) => { if (!Array.isArray(rule[field]) || rule[field].some((id: any) => typeof id !== 'string' || !all.some(e => String(e.id) === id))) throw new Error('الموظف أو الشيفت خارج الشركة'); return [...new Set<string>(rule[field])]; };
    const employeeIds = ids('employeeIds', employees), shiftIds = ids('shiftIds', shifts), target = rule.scope === 'employees' ? employeeIds : shiftIds;
    if (rule.enabled && !target.length) throw new Error('اختر الموظفين أو الشيفتات المشمولة');
    if (rule.enabled) for (const id of target) { const key = `${rule.scope}:${id}:${rule.period}`; if (assignments.has(key)) throw new Error('يوجد أكثر من إعداد لنفس الموظف أو الشيفت في الفترة نفسها'); assignments.add(key); }
    const parsed: BreakRule = { id: rule.id, name: rule.name.trim(), enabled: rule.enabled, scope: rule.scope, employeeIds, shiftIds, period: rule.period, mode: rule.mode, time: rule.time, offsetMinutes: rule.offsetMinutes, durationMinutes: rule.durationMinutes };
    if (parsed.enabled && parsed.scope === 'shifts') for (const id of parsed.shiftIds) if (!breakWindow('2026-01-01', shifts.find(s => String(s.id) === id), parsed)) throw new Error('موعد الاستراحة ومدتها يجب أن يكونا داخل فترة الشيفت المختارة');
    return parsed;
  });
}
export function breakWindow(date: string, shift: any, rule: BreakRule) {
  if (!shift) return null;
  const window = autoPeriodWindow(date, shift, rule.period === 2); if (!window) return null;
  let start = rule.mode === 'offset' ? window.start + rule.offsetMinutes * 60000 : Date.parse(date + 'T' + rule.time + ':00+03:00');
  if (rule.mode === 'clock') while (start <= window.start) start += 86400000;
  const end = start + rule.durationMinutes * 60000;
  return Number.isFinite(start) && start > window.start && end < window.end ? { start, end, shiftStart: window.start, shiftEnd: window.end } : null;
}
export function employeeBreakPlans(data: any, rules: BreakRule[], employeeId: string, date: string) {
  const employee = data?.employees?.find((e: any) => String(e.id) === employeeId);
  if (!isActiveEmployee(employeeAtDate(employee, date))) return [];
  const published = effectiveScheduleData(data), assignment = published.schedule?.[date]?.[employeeId];
  if (!assignment || ['OFF', 'A'].includes(assignment.shiftType)) return [];
  const shift = published.shiftTypes?.find((s: any) => String(s.id) === String(assignment.shiftType));
  return [1, 2].flatMap(period => {
    const candidates = rules.filter(rule => rule.enabled && rule.period === period);
    const rule = candidates.find(r => r.scope === 'employees' && r.employeeIds.includes(employeeId)) || candidates.find(r => r.scope === 'shifts' && r.shiftIds.includes(String(assignment.shiftType)));
    if (!rule || (period === 2 && shift?.type !== 'double')) return [];
    const window = breakWindow(date, shift, rule);
    return [{ rule, date, period, shiftName: shift?.name || 'الدوام', window, issue: window ? '' : 'موعد الاستراحة المحدد خارج ساعات هذه الفترة؛ راجع الإدارة' }];
  });
}
export function breakMetrics(entry: BreakEntry, now = Date.now()) {
  const elapsedMinutes = Math.max(0, Math.ceil(((entry.endedAt ?? now) - entry.startedAt) / 60000));
  return { elapsedMinutes, excessMinutes: Math.max(0, elapsedMinutes - entry.allowedMinutes), lateReturnMinutes: Math.max(0, Math.ceil(((entry.endedAt ?? now) - entry.plannedEnd) / 60000)) };
}
export const openBreak = (record: any): BreakEntry | undefined => (Array.isArray(record?.breaks) ? record.breaks : []).find((entry: BreakEntry) => entry.startedAt && !entry.endedAt);
export function employeeWorkState(records: any[], now = Date.now()) {
  const entries: BreakEntry[] = records.flatMap(record => Array.isArray(record.breaks) ? record.breaks : []);
  const breakLateMinutes = entries.reduce((sum, entry) => sum + breakMetrics(entry, now).lateReturnMinutes, 0);
  const working = records.flatMap(record => [1, 2].flatMap(period => record[period === 1 ? 'checkIn' : 'checkIn2'] && !record[period === 1 ? 'checkOut' : 'checkOut2'] ? [{ record, period, time: Number(record[period === 1 ? 'checkInTs' : 'checkInTs2']) || record.id || 0 }] : [])).sort((a, b) => b.time - a.time)[0];
  const current = working && (working.record.breaks as BreakEntry[] || []).find(entry => entry.period === working.period && !entry.endedAt);
  return { workStatus: current ? 'break' : working ? 'working' : 'outside', workStatusText: current ? 'في الاستراحة' : working ? 'في العمل' : 'خارج العمل', breakLateMinutes, activeBreakLateMinutes: current ? breakMetrics(current, now).lateReturnMinutes : 0, breakElapsedMinutes: current ? breakMetrics(current, now).elapsedMinutes : null };
}
