import { validAttendanceDate } from './attendanceMonths';
export type EmployeeStatus = 'active' | 'suspended' | 'archived';
export const employeeStatus = (employee: any): EmployeeStatus => employee?.status === 'suspended' || employee?.status === 'archived' ? employee.status : 'active';
export const isActiveEmployee = (employee: any) => !!employee && employeeStatus(employee) === 'active';
export const statusLabels = { active: 'نشط', suspended: 'موقوف', archived: 'مؤرشف' };
const fields = ['name', 'dept', 'phone', 'email', 'username', 'status', 'restrictAttendanceLocations', 'allowedAttendanceLocationIds', 'color', 'statusReason', 'employmentEffectiveDate'];
export function employeeChanges(before: any[], after: any[]) {
  const previous = new Map(before.map(e => [String(e.id), e]));
  return after.flatMap(e => {
    const old = previous.get(String(e.id));
    const changes: Record<string, { before: any; after: any }> = {};
    for (const field of fields) {
      const a = field === 'status' ? employeeStatus(old) : old?.[field] ?? null;
      const b = field === 'status' ? employeeStatus(e) : e[field] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) changes[field] = { before: a, after: b };
    }
    if (old && old.password !== e.password) changes.password = { before: 'محجوب', after: 'تم تغيير رمز الدخول' };
    return !old || Object.keys(changes).length ? [{ id: String(e.id), name: e.name, action: !old ? 'employee.create' : changes.status ? 'employee.status' : 'employee.update', changes }] : [];
  });
}

/** Riyadh business day; evaluating history never writes to the database. */
export const employmentToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export function employeeAtDate(employee: any, date: string) {
  if (!employee) return employee;
  const resolved = { ...employee };
  for (const field of ['dept', 'status']) {
    const history = employee.employmentHistory?.[field] || [];
    for (let index = history.length - 1; index >= 0; index--) {
      if (date < history[index].date) resolved[field] = history[index].before;
    }
  }
  return resolved;
}
/** Only the server constructs history; client-supplied histories are discarded. */
export function saveEmploymentHistory(before: any[], incoming: any[], today = employmentToday()) {
  const previous = new Map(before.map(e => [String(e.id), e]));
  return incoming.map(employee => {
    const old = previous.get(String(employee.id));
    const { employmentHistory: ignored, employmentEffectiveDate: ignoredDate, _employmentEffectiveDate: requestedDate, ...next } = employee;
    if (!old) return next;
    const changed = ['dept', 'status'].filter(field => (field === 'status' ? employeeStatus(old) : old[field]) !== (field === 'status' ? employeeStatus(next) : next[field]));
    if (!changed.length) return { ...next, employmentHistory: old.employmentHistory, employmentEffectiveDate: old.employmentEffectiveDate };
    const date = requestedDate || today;
    if (!validAttendanceDate(date) || date > today) throw new Error('اختر تاريخ سريان صحيحًا حتى اليوم؛ التغييرات المستقبلية غير متاحة بعد');
    const history = { ...(old.employmentHistory || {}) };
    for (const field of changed) {
      const entries = history[field] || [];
      if (entries.length && date < entries[entries.length - 1].date) throw new Error('تاريخ السريان يجب ألا يسبق آخر تغيير مسجل لنفس القسم أو الحالة');
      history[field] = [...entries, { date, before: field === 'status' ? employeeStatus(old) : old[field] || '', after: field === 'status' ? employeeStatus(next) : next[field] || '' }];
    }
    return { ...next, employmentHistory: history, employmentEffectiveDate: date };
  });
}
