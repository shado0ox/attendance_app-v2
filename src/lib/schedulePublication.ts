export function canonicalSchedule(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalSchedule).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonicalSchedule(value[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export const scheduleContent = (data: any) => ({ schedule: data?.schedule || {}, shiftTypes: data?.shiftTypes || [] });
export const effectiveScheduleData = (data: any) => ({ ...data, ...scheduleContent(data?._schedulePublication || data) });
export function employeeScheduleContent(data: any, empId: string) {
  const published = effectiveScheduleData(data);
  const schedule: Record<string, any> = {};
  const codes = new Set<string>();
  for (const [date, entries] of Object.entries(published.schedule)) {
    const entry = (entries as any)?.[empId];
    if (entry) { schedule[date] = entry; codes.add(entry.shiftType); }
  }
  return { schedule, shiftTypes: published.shiftTypes.filter((shift: any) => codes.has(shift.id)).sort((a: any, b: any) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0) };
}
