import { autoPeriodWindow } from './autoPunch';
import { effectiveScheduleData } from './schedulePublication';
import { employeeAtDate, isActiveEmployee } from './employeeLifecycle';
export type WhatsAppSettings = {
  enabled: boolean; mode: 'all' | 'selected'; employeeIds: string[];
  phoneNumberId: string; sender: string; apiVersion: string; language: string;
  attendanceTemplate: string; departureTemplate: string; portalUrl: string;
  attendanceEnabled: boolean; departureEnabled: boolean;
  attendanceDelay: number; departureDelay: number; interval: number;
  contacts: Record<string, { phone: string; consent: boolean; consentAt?: string }>;
};
export const whatsappDefaults = (): WhatsAppSettings => ({ enabled: false, mode: 'selected', employeeIds: [], phoneNumberId: '', sender: '', apiVersion: 'v26.0', language: 'ar', attendanceTemplate: '', departureTemplate: '', portalUrl: '', attendanceEnabled: true, departureEnabled: true, attendanceDelay: 10, departureDelay: 0, interval: 10, contacts: {} });
export function whatsappPhone(value: unknown) {
  const phone = String(value || '').replace(/[\s()+-]/g, '').replace(/^00/, '');
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : '';
}
export function parseWhatsAppSettings(input: any, employees: any[], previous = whatsappDefaults()) {
  if (!input || !['all', 'selected'].includes(input.mode)) throw new Error('حدد نطاق الموظفين');
  const out = whatsappDefaults();
  for (const key of ['enabled', 'attendanceEnabled', 'departureEnabled'] as const) {
    if (typeof input[key] !== 'boolean') throw new Error('إعداد تشغيل غير صالح'); out[key] = input[key];
  }
  for (const key of ['attendanceDelay', 'departureDelay', 'interval'] as const) {
    if (!Number.isInteger(input[key]) || input[key] < (key === 'interval' ? 10 : 0) || input[key] > (key === 'interval' ? 60 : 50)) throw new Error('وقت التذكير غير صالح'); out[key] = input[key];
  }
  for (const key of ['phoneNumberId', 'sender', 'apiVersion', 'language', 'attendanceTemplate', 'departureTemplate', 'portalUrl'] as const) {
    if (typeof input[key] !== 'string' || input[key].length > 500) throw new Error('بيانات الربط غير صالحة'); out[key] = input[key].trim();
  }
  if (out.phoneNumberId && !/^\d{5,30}$/.test(out.phoneNumberId)) throw new Error('Phone Number ID غير صالح');
  if (!/^v\d{2}\.0$/.test(out.apiVersion) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(out.language)) throw new Error('الإصدار أو لغة القالب غير صالح');
  for (const name of [out.attendanceTemplate, out.departureTemplate]) if (name && !/^[a-z0-9_]{1,100}$/.test(name)) throw new Error('اسم القالب غير صالح');
  if (out.portalUrl) { const url = new URL(out.portalUrl); if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('رابط البوابة يجب أن يكون HTTPS'); }
  if (!Array.isArray(input.employeeIds) || input.employeeIds.some((id: any) => typeof id !== 'string' || !employees.some(e => String(e.id) === id))) throw new Error('موظف خارج الشركة');
  out.mode = input.mode; out.employeeIds = [...new Set<string>(input.employeeIds)];
  if (!input.contacts || typeof input.contacts !== 'object' || Array.isArray(input.contacts)) throw new Error('بيانات الموظفين غير صالحة');
  out.contacts = Object.create(null);
  for (const [id, contact] of Object.entries<any>(input.contacts)) {
    if (!employees.some(e => String(e.id) === id) || !contact || typeof contact.consent !== 'boolean') throw new Error('بيانات موافقة غير صالحة');
    const phone = whatsappPhone(contact.phone);
    if (contact.phone && !phone) throw new Error('أدخل رقم واتساب بمفتاح الدولة');
    if (contact.consent && !phone) throw new Error('الرقم مطلوب لتوثيق الموافقة');
    out.contacts[id] = { phone, consent: contact.consent, consentAt: contact.consent ? (previous.contacts[id]?.consent && previous.contacts[id]?.phone === phone ? previous.contacts[id].consentAt : new Date().toISOString()) : undefined };
  }
  return out;
}
export function whatsappReady(settings: WhatsAppSettings, token: boolean, appSecret: boolean, verifyToken: boolean) {
  return !!(token && appSecret && verifyToken && settings.phoneNumberId && settings.portalUrl && (settings.attendanceEnabled || settings.departureEnabled) && (!settings.attendanceEnabled || settings.attendanceTemplate) && (!settings.departureEnabled || settings.departureTemplate));
}
export function dueWhatsAppReminders(data: any, employeeId: string, records: any[], leaves: any[], settings: WhatsAppSettings, now = Date.now()) {
  const employee = data?.employees?.find((e: any) => String(e.id) === employeeId);
  if (!isActiveEmployee(employee) || !settings.enabled || (settings.mode === 'selected' && !settings.employeeIds.includes(employeeId)) || !settings.contacts[employeeId]?.consent || !settings.contacts[employeeId]?.phone) return [];
  const published = effectiveScheduleData(data), result: { key: string; date: string; period: number; kind: 'attendance' | 'departure'; expiresAt: number; shiftName: string }[] = [];
  for (const offset of [-2 * 86400000, -86400000, 0]) {
    const date = new Date(now + 3 * 3600000 + offset).toISOString().slice(0, 10);
    if (!isActiveEmployee(employeeAtDate(employee, date)) || leaves.some(r => String(r.empId) === employeeId && r.date === date && r.status === 'approved')) continue;
    const assignment = published.schedule?.[date]?.[employeeId];
    if (!assignment || ['A', 'OFF'].includes(assignment.shiftType)) continue;
    const shift = published.shiftTypes?.find((s: any) => s.id === assignment.shiftType);
    if (!shift) continue;
    for (const period of [1, 2]) {
      const window = autoPeriodWindow(date, shift, period === 2); if (!window) continue;
      const rows = records.filter(r => r.date === date && String(r.empId) === employeeId);
      const checkedIn = rows.some(r => r[period === 1 ? 'checkIn' : 'checkIn2']);
      const checkedOut = rows.some(r => r[period === 1 ? 'checkOut' : 'checkOut2']);
      for (const kind of ['attendance', 'departure'] as const) {
        if (kind === 'attendance' ? !settings.attendanceEnabled || checkedIn : !settings.departureEnabled || !checkedIn || checkedOut) continue;
        const base = kind === 'attendance' ? window.start : window.end;
        const delay = kind === 'attendance' ? settings.attendanceDelay : settings.departureDelay;
        const expiresAt = kind === 'attendance' ? Math.min(window.end, base + 3600000) : base + 3600000;
        if (now < base + delay * 60000 || now >= expiresAt) continue;
        const slot = Math.floor((now - base - delay * 60000) / (settings.interval * 60000));
        // Deduplication is stable even when a schedule time is edited.
        result.push({ key: `${date}:${period}:${kind}:${slot}`, date, period, kind, expiresAt, shiftName: shift.name || 'الدوام' });
      }
    }
  }
  return result;
}
