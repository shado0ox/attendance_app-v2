export type Fix = { timestamp: number; mocked?: boolean; coords: { latitude: number; longitude: number; accuracy: number | null } };
export function usableFix(fix: Fix, now = Date.now()) {
  return !fix.mocked && Number.isFinite(fix.timestamp) && now - fix.timestamp >= -5000 && now - fix.timestamp <= 60000 &&
    Number.isFinite(fix.coords.latitude) && Math.abs(fix.coords.latitude) <= 90 &&
    Number.isFinite(fix.coords.longitude) && Math.abs(fix.coords.longitude) <= 180 &&
    fix.coords.accuracy !== null && Number.isFinite(fix.coords.accuracy) && fix.coords.accuracy >= 0 && fix.coords.accuracy <= 100;
}
/** Native GPS errors must never be rendered as developer stack traces. */
export function locationMessage(error: unknown, simulator = false) {
  if (simulator) return 'المحاكي لا يملك موقع GPS فعليًا. اختر Features ← Location من قائمة Simulator وحدد موقعًا، أو جرّب على آيفون حقيقي.';
  const code = String((error as { code?: string })?.code || '');
  if (/PERMISSION|UNAUTHORIZED/.test(code)) return 'إذن الموقع غير متاح. افتح إعدادات الهاتف واسمح بالموقع الدقيق أثناء استخدام وفر دوام.';
  if (code === 'WAFR_GPS_TIMEOUT') return 'تعذر تحديد موقع دقيق خلال المهلة. تأكد من تشغيل الموقع الدقيق، واقترب من نافذة ثم أعد المحاولة.';
  return 'تعذر تحديد موقعك الآن. تأكد من تشغيل خدمات الموقع والموقع الدقيق، ثم أعد المحاولة. لم تُرسل بصمة حضور.';
}
