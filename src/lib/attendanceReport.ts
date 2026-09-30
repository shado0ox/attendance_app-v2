import { matchAttendanceLocation } from './attendanceLocations';
const digits = (text: string) => text.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
function punchTime(ts: any, time: any, date: string): number | null {
  if (ts != null && ts !== '') {
    const value = Number(ts);
    if (Number.isFinite(value) && value > 0) return value;
    const parsed = Date.parse(String(ts));
    if (Number.isFinite(parsed)) return parsed;
  }
  const text = digits(String(time || ''));
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  if (/م|PM/i.test(text) && hour < 12) hour += 12;
  if (/ص|AM/i.test(text) && hour === 12) hour = 0;
  const value = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00+03:00`);
  return Number.isFinite(value) ? value : null;
}
function locationName(record: any, suffix: string, settings: any, out: boolean) {
  const saved = record[`${out ? 'checkOut' : 'checkIn'}Location${suffix}`];
  if (saved) return saved;
  if (/الإدارة|الادارة/.test(record.source || record.note || '')) return 'تسجيل إداري';
  if (out) return 'غير مسجل';
  const lat = record[`checkInLat${suffix}`], lng = record[`checkInLng${suffix}`];
  if (lat == null || lng == null) return 'غير مسجل';
  const match = matchAttendanceLocation(settings, Number(lat), Number(lng));
  return match.inside ? `${match.location?.name} (تقديري)` : 'خارج المواقع المعتمدة';
}
export function buildAttendanceDays(records: any[], settings: any) {
  const groups = new Map<string, any[]>();
  for (const record of records) {
    const key = `${record.empId}|${record.date}`;
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  return [...groups.values()].map(rows => {
    const events: { time: number; kind: 'in' | 'out'; location: string }[] = [];
    let invalid = false;
    for (const row of rows) for (const suffix of ['', '2']) {
      const start = punchTime(row[`checkInTs${suffix}`], row[`checkIn${suffix}`], row.date);
      let end = punchTime(row[`checkOutTs${suffix}`], row[`checkOut${suffix}`], row.date);
      // Only time-only records can be rolled to the following day; timestamps are authoritative.
      if (start !== null && end !== null && end < start && !row[`checkOutTs${suffix}`]) end += 86400000;
      if (start !== null) events.push({ time: start, kind: 'in', location: locationName(row, suffix, settings, false) });
      if (end !== null) events.push({ time: end, kind: 'out', location: locationName(row, suffix, settings, true) });
      if ((row[`checkIn${suffix}`] && start === null) || (row[`checkOut${suffix}`] && end === null) || (start !== null && end !== null && end < start)) invalid = true;
    }
    const unique = events.filter((event, index) => events.findIndex(e => e.kind === event.kind && e.time === event.time) === index);
    const ins = unique.filter(e => e.kind === 'in').sort((a,b) => a.time-b.time);
    const outs = unique.filter(e => e.kind === 'out').sort((a,b) => a.time-b.time);
    const first = ins[0], last = outs.at(-1);
    let status = 'مكتمل';
    let minutes: number | null = null;
    if (invalid) status = 'بيانات غير صالحة — للمراجعة';
    else if (!first) status = 'حضور ناقص';
    else if (!last || ins.at(-1)!.time > last.time) status = 'انصراف ناقص';
    else if (last.time <= first.time || last.time-first.time > 86400000) status = 'مدة غير منطقية — للمراجعة';
    else minutes = Math.round((last.time-first.time)/60000);
    return { ...rows[0], ids: rows.map(r => r.id), first, last, minutes, reportStatus: status, ignored: Math.max(0, events.length - (first ? 1 : 0) - (last ? 1 : 0)) };
  }).sort((a,b) => b.date.localeCompare(a.date) || String(a.empName).localeCompare(String(b.empName), 'ar'));
}
export const formatMinutes = (minutes: number | null) => minutes === null ? '—' : `${Math.floor(minutes / 60)} س ${minutes % 60} د`;
export const formatPunch = (punch: { time: number } | undefined) => punch ? new Date(punch.time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }) : '—';
export function csvCell(value: any) {
  let text = String(value ?? '');
  if (/^[=+@-]/.test(text.trimStart())) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
