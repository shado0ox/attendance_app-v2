import type { Attendance, Bootstrap } from './types';
/** Only authoritative saved timestamps drive progress. Time-only legacy rows stay unknown. */
export function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const numeric = Number(value), parsed = Number.isFinite(numeric) ? numeric : Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
export const duration = (minutes: number | null) => minutes === null ? '—' : `${String(Math.floor(Math.max(0, minutes) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, minutes)) % 60).padStart(2, '0')}`;
export function periodMetrics(record: Attendance | undefined, period: number, plan: NonNullable<Bootstrap['punchPlans']>[number] | undefined, now: number) {
  const start = timestamp(period === 2 ? record?.checkInTs2 : record?.checkInTs);
  const end = timestamp(period === 2 ? record?.checkOutTs2 : record?.checkOutTs);
  const valid = start !== null && start <= now && (end === null || (end >= start && end <= now)) && (end ?? now) - start <= 86400000;
  const elapsed = valid ? Math.floor(((end ?? now) - start) / 60000) : null;
  const remaining = plan && now < plan.end && !end ? Math.max(0, Math.ceil((plan.end - now) / 60000)) : plan ? 0 : null;
  const progress = plan && plan.end > plan.start ? Math.max(0, Math.min(1, (now - plan.start) / (plan.end - plan.start))) : 0;
  // Clip each break to this saved period; merge overlapping intervals instead of double-counting.
  const intervals = (record?.breaks || []).filter(b => b.period === period && b.startedAt > 0 && b.endedAt && b.endedAt >= b.startedAt)
    .map(b => [Math.max(start ?? b.startedAt, b.startedAt), Math.min(end ?? now, b.endedAt!)])
    .filter(([a,b]) => b > a).sort((a,b) => a[0]-b[0]);
  let breakMs = 0, lastEnd = 0;
  for (const [a,b] of intervals) { breakMs += Math.max(0, b-Math.max(a,lastEnd)); lastEnd = Math.max(lastEnd,b); }
  return { start, end, elapsed, remaining, progress, breakMinutes: Math.floor(breakMs / 60000) };
}
export function activePeriod(data: Bootstrap, record: Attendance | undefined, field?: string) {
  const date = record?.date || data.today;
  const period = field?.endsWith('2') || (!!record?.checkIn2 && !record?.checkOut2) ? 2 : 1;
  return { date, period, plan: data.punchPlans?.find(p => p.date === date && p.period === period) };
}
export const identityImage = (value: unknown) => typeof value === 'string' && value.length <= 1500000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
export function fixSite(fix: { latitude: number; longitude: number; accuracy: number }, sites: NonNullable<Bootstrap['attendanceLocations']>) {
  const radians = Math.PI / 180;
  const found = sites.find(site => {
    const a = Math.sin((site.lat-fix.latitude)*radians/2)**2 + Math.cos(site.lat*radians)*Math.cos(fix.latitude*radians)*Math.sin((site.lng-fix.longitude)*radians/2)**2;
    const distance = 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-Math.min(1,a)));
    return distance + fix.accuracy <= site.radius;
  });
  return found ? `داخل نطاق ${found.name}` : 'لم يتأكد وجودك داخل نطاق موقع العمل؛ يتحقق السيرفر عند التسجيل';
}
