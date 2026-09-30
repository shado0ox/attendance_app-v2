import { getEmployeeLocations, distanceMeters } from './attendanceLocations';
import { shiftWindow } from './attendanceAnalysis';
export function autoPeriodWindow(date: string, shift: any, second = false) {
  if (!shiftWindow(date, shift)) return null;
  const first = shiftWindow(date, { start: shift.start, end: shift.end })!;
  if (!second) return first;
  if (shift.type !== 'double') return null;
  const window = shiftWindow(date, { start: shift.start2, end: shift.end2 });
  if (!window) return null;
  if (window.start < first.start) return { ...window, start: window.start + 86400000, end: window.end + 86400000 };
  return window;
}
export function autoFix(settings: any, position: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }, now: number) {
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  if (![lat, lng, accuracy, position.timestamp].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy <= 0 || accuracy > 50 || now - position.timestamp > 15000 || position.timestamp > now + 2000) return { kind: 'uncertain' as const, accuracy };
  const sites = getEmployeeLocations(settings).map(location => ({ location, distance: distanceMeters(lat, lng, location.lat, location.lng) })).sort((a, b) => a.distance - b.distance);
  const inside = sites.find(site => accuracy <= site.location.radius / 2 && site.distance + accuracy <= site.location.radius);
  if (inside) return { kind: 'inside' as const, id: inside.location.id, name: inside.location.name, distance: inside.distance, accuracy };
  const nearest = sites[0];
  const outside = sites.length > 0 && sites.every(site => site.distance - accuracy > site.location.radius + 30);
  return { kind: outside ? 'outside' as const : 'uncertain' as const, distance: nearest?.distance, accuracy };
}
export class AutoPunchDwell {
  private candidate: { key: string; start: number; last: number; count: number } | null = null;
  reset() { this.candidate = null; }
  observe(fix: ReturnType<typeof autoFix>, now: number) {
    if (fix.kind === 'uncertain') { this.reset(); return false; }
    const key = fix.kind + ':' + ('id' in fix ? fix.id : '');
    if (!this.candidate || this.candidate.key !== key || now - this.candidate.last > 45000 || now < this.candidate.last) this.candidate = { key, start: now, last: now, count: 1 };
    else if (now > this.candidate.last) { this.candidate.last = now; this.candidate.count++; }
    return this.candidate.count >= 2 && now - this.candidate.start >= (fix.kind === 'inside' ? 30000 : 120000);
  }
}
