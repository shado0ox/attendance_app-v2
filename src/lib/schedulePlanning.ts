export type Period = 'morning' | 'evening';
export type Schedule = Record<string, Record<string, { shiftType: string; note?: string; [key: string]: any }>>;

/** Explicit classification wins; legacy codes are supported only when type is absent. */
export function shiftPeriods(shift: any): Period[] {
  if (!shift || ['A', 'OFF'].includes(shift.id)) return [];
  const type = shift.type || ({ S: 'morning', E: 'evening', D: 'double' } as any)[shift.id];
  return type === 'double' ? ['morning', 'evening'] : type === 'morning' ? ['morning'] : type === 'evening' ? ['evening'] : [];
}
export function coverage(employees: any[], shifts: any[], schedule: Schedule, date: string) {
  const result = { morning: 0, evening: 0 };
  const byId = new Map(shifts.map(s => [s.id, s]));
  for (const e of employees) for (const p of shiftPeriods(byId.get(schedule[date]?.[e.id]?.shiftType))) result[p]++;
  return result;
}
export function requirements(dept: any, date: string, morning = dept.needsMorning ? 1 : 0, evening = dept.needsEvening ? 1 : 0) {
  if (new Date(date + 'T00:00:00Z').getUTCDay() === 5) {
    if (dept.friday === 'off') return { morning: 0, evening: 0, any: 0 };
    if (dept.friday === 'partial') return { morning: 0, evening: 0, any: Math.max(morning, evening, 1) };
  }
  return { morning, evening, any: 0 };
}
export function coverageAlerts(departments: any[], employees: any[], shifts: any[], schedule: Schedule, dates: string[]) {
  const alerts: any[] = [];
  for (const date of dates) for (const dept of departments) {
    const staff = employees.filter(e => e.dept === dept.id);
    const count = coverage(staff, shifts, schedule, date);
    const needed = requirements(dept, date);
    for (const p of ['morning', 'evening'] as Period[]) if (count[p] < needed[p]) {
      alerts.push({ id: `${date}_${dept.id}_${p}`, date, dept: dept.name,
        msg: `تغطية ناقصة: الشيفت ${p === 'morning' ? 'الصباحي' : 'المسائي'} فارغ في القسم ${dept.name}` });
    }
    if (needed.any && !staff.some(e => shiftPeriods(shifts.find(s => s.id === schedule[date]?.[e.id]?.shiftType)).length)) {
      alerts.push({ id: `${date}_${dept.id}_friday`, date, dept: dept.name, msg: 'يوم الجمعة: لا يوجد أي تعيين لدوام الشيفت في القسم' });
    }
  }
  return alerts;
}
const dayMs = 86400000;
const dateMs = (date: string) => Date.parse(date + 'T00:00:00Z');
const offset = (date: string, n: number) => new Date(dateMs(date) + n * dayMs).toISOString().slice(0, 10);
export function planningDates(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      !Number.isFinite(dateMs(from)) || !Number.isFinite(dateMs(to)) || offset(from, 0) !== from || offset(to, 0) !== to ||
      to < from || dateMs(to) - dateMs(from) > 30 * dayMs) throw new Error('اختر فترة صحيحة لا تتجاوز 31 يوماً');
  const dates: string[] = [];
  for (let date = from; date <= to; date = offset(date, 1)) dates.push(date);
  return dates;
}
export interface PlanOptions {
  from: string; to: string; morning: number; evening: number;
  shiftIds: string[]; employeeIds: string[];
  restDays: number; maxConsecutive: number; minRestHours: number;
  // Employee-specific unavailable weekdays, Sunday=0. Existing cells are always preserved.
  unavailable: Record<string, number[]>;
}
function timeMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return NaN;
  const [h, m] = value.split(':').map(Number); return h * 60 + m;
}
function span(shift: any, date: string): [number, number] | null {
  if (!shift) return null;
  const start = timeMinutes(shift.start), end = timeMinutes(shift.end);
  if (!Number.isFinite(start + end) || start === end) return null;
  let finish = end <= start ? end + 1440 : end;
  if (shift.type === 'double') {
    const s2 = timeMinutes(shift.start2), e2 = timeMinutes(shift.end2);
    if (!Number.isFinite(s2 + e2) || s2 === e2) return null;
    const secondStart = s2 < finish ? s2 + 1440 : s2;
    finish = secondStart + ((e2 - s2 + 1440) % 1440);
  }
  return [dateMs(date) + start * 60000, dateMs(date) + finish * 60000];
}
/** Checks both past and future cells so existing overnight shifts remain protected. */
function allowed(schedule: Schedule, shifts: any[], employeeId: string, date: string, shift: any, o: PlanOptions) {
  const byId = new Map(shifts.map(s => [s.id, s]));
  const work = (d: string) => {
    const id = schedule[d]?.[employeeId]?.shiftType;
    return d === date || (!!id && !['A', 'OFF'].includes(id));
  };
  let before = 0, after = 0;
  for (let n = 1; n <= 7 && work(offset(date, -n)); n++) before++;
  for (let n = 1; n <= 7 && work(offset(date, n)); n++) after++;
  if (before + 1 + after > o.maxConsecutive) return false;
  for (let start = -6; start <= 0; start++) {
    let days = 0;
    for (let n = start; n < start + 7; n++) if (work(offset(date, n))) days++;
    if (days > 7 - o.restDays) return false;
  }
  const proposed = span(shift, date);
  if (!proposed) return false;
  for (let n = -7; n <= 7; n++) {
    if (!n) continue;
    const d = offset(date, n), id = schedule[d]?.[employeeId]?.shiftType;
    if (!id || ['A', 'OFF'].includes(id)) continue;
    const other = span(byId.get(id), d);
    if (!other) return false; // Unknown shift times cannot safely satisfy rest.
    const gap = n < 0 ? proposed[0] - other[1] : other[0] - proposed[1];
    if (gap < o.minRestHours * 3600000) return false;
  }
  return true;
}
export function proposeSchedule(dept: any, employees: any[], shifts: any[], base: Schedule, o: PlanOptions) {
  const dates = planningDates(o.from, o.to);
  for (const [v, min, max] of [[o.morning, 0, 100], [o.evening, 0, 100], [o.restDays, 0, 6], [o.maxConsecutive, 1, 7], [o.minRestHours, 0, 24]]) {
    if (!Number.isInteger(v) || v < min || v > max) throw new Error('راجع الحدود الرقمية للشروط');
  }
  const staff = employees.filter(e => e.dept === dept.id && o.employeeIds.includes(e.id)).sort((a,b) => a.id.localeCompare(b.id));
  if (!staff.length) throw new Error('اختر موظفاً واحداً على الأقل من القسم');
  const selected = shifts.filter(s => o.shiftIds.includes(s.id) && shiftPeriods(s).length && span(s, dates[0]));
  if (!selected.length && (o.morning || o.evening)) throw new Error('اختر شيفتات ذات مواعيد صحيحة؛ الشيفت المزدوج يحتاج مواعيد الفترتين');
  const departmentStaff = employees.filter(e => e.dept === dept.id);
  const schedule: Schedule = { ...base };
  for (const date of dates) schedule[date] = { ...base[date] };
  const changes: { date: string; employeeId: string; shiftType: string; note: string }[] = [];
  const issues: string[] = [];
  const totals: Record<string, { work: number; morning: number; evening: number; rest: number }> = {};
  for (const e of staff) {
    totals[e.id] = { work: 0, morning: 0, evening: 0, rest: 0 };
    for (const date of dates) {
      const entry = base[date]?.[e.id];
      if (entry && ['A', 'OFF'].includes(entry.shiftType)) totals[e.id].rest++;
      if (entry && !['A', 'OFF'].includes(entry.shiftType)) {
        totals[e.id].work++;
        for (const p of shiftPeriods(shifts.find(s => s.id === entry.shiftType))) totals[e.id][p]++;
      }
    }
  }
  const assign = (date: string, e: any, shiftType: string) => {
    const note = shiftType === 'A' ? 'راحة مقترحة' : 'توزيع مقترح';
    schedule[date][e.id] = { shiftType, note };
    changes.push({ date, employeeId: e.id, shiftType, note });
    if (shiftType === 'A') totals[e.id].rest++;
    else {
      totals[e.id].work++;
      for (const p of shiftPeriods(shifts.find(s => s.id === shiftType))) totals[e.id][p]++;
    }
  };
  for (const date of dates) {
    const need = requirements(dept, date, o.morning, o.evening);
    const counts = coverage(departmentStaff, shifts, schedule, date);
    const anyCount = () => departmentStaff.filter(e => shiftPeriods(shifts.find(s => s.id === schedule[date]?.[e.id]?.shiftType)).length).length;
    for (let attempt = 0; attempt < staff.length; attempt++) {
      const missing = (['morning', 'evening'] as Period[]).filter(p => counts[p] < need[p]);
      if (!missing.length && anyCount() >= need.any) break;
      const candidates: { e: any; s: any; gain: number; score: number }[] = [];
      for (const e of staff) {
        if (schedule[date]?.[e.id] || (o.unavailable[e.id] || []).includes(new Date(dateMs(date)).getUTCDay())) continue;
        for (const s of selected) {
          const periods = shiftPeriods(s), gain = missing.filter(p => periods.includes(p)).length + (need.any > anyCount() ? 1 : 0);
          if (!gain || !allowed(schedule, shifts, e.id, date, s, o)) continue;
          candidates.push({ e, s, gain, score: totals[e.id].work * 10 + periods.reduce((sum,p) => sum + totals[e.id][p], 0) });
        }
      }
      candidates.sort((a,b) => b.gain - a.gain || a.score - b.score || a.e.id.localeCompare(b.e.id) || a.s.id.localeCompare(b.s.id));
      const candidate = candidates[0];
      if (!candidate) break;
      assign(date, candidate.e, candidate.s.id);
      for (const p of shiftPeriods(candidate.s)) counts[p]++;
    }
    for (const p of ['morning', 'evening'] as Period[]) if (counts[p] < need[p]) issues.push(`${date}: نقص ${need[p] - counts[p]} في ${p === 'morning' ? 'الصباحي' : 'المسائي'}`);
    if (anyCount() < need.any) issues.push(`${date}: نقص ${need.any - anyCount()} في دوام الجمعة الجزئي`);
    for (const e of staff) if (!schedule[date]?.[e.id]) assign(date, e, 'A');
  }
  for (const date of dates) for (const e of staff) {
    const entry = base[date]?.[e.id];
    if (!entry || ['A', 'OFF'].includes(entry.shiftType)) continue;
    const shift = shifts.find(s => s.id === entry.shiftType);
    if ((o.unavailable[e.id] || []).includes(new Date(dateMs(date)).getUTCDay()) ||
        !allowed(schedule, shifts, e.id, date, shift, o)) {
      issues.push(`${date}: تعيين محفوظ للموظف ${e.name} يتعارض مع شروط الراحة أو عدم الإتاحة؛ راجعه يدوياً`);
    }
  }
  return { changes, issues, totals, schedule };
}
export function applyProposal(base: Schedule, changes: {date: string; employeeId: string; shiftType: string; note: string}[]): Schedule {
  const next = { ...base };
  for (const c of changes) {
    if (base[c.date]?.[c.employeeId]) throw new Error('تغير الجدول؛ أعد توليد الاقتراح');
    next[c.date] = { ...next[c.date], [c.employeeId]: { shiftType: c.shiftType, note: c.note } };
  }
  return next;
}
