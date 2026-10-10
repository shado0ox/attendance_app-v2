import { useEffect, useRef } from 'react';
import { AutoPunchDwell, autoFix } from '../lib/autoPunch';
import { getEmployeeLocations } from '../lib/attendanceLocations';
import { reminderSlot } from '../lib/attendanceReminders';
type Options = {
  scope: string; autoIn: boolean; autoOut: boolean; mode: string; interval: number; scheduled: string;
  currentStatus?: () => string;
  settings: any; status: string; record: any; blocked: boolean;
  window: () => { start: number; end: number } | null;
  refresh: () => Promise<boolean>; punch: (position: GeolocationPosition) => Promise<boolean>;
  message: (text: string) => void; fix: (accuracy: number, distance: number | null) => void;
  missedAlert: boolean; late: (start: number) => void;
  departure: (recordId: number, text: string) => void;
};
export function useAutoPunch(options: Options) {
  const latest = useRef(options); latest.current = options;
  const busy = useRef(false);
  useEffect(() => {
    let stopped = false, generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
    let needsRefresh = true, cooldownUntil = 0;
    let lastDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
    const dwell = new AutoPunchDwell();
    const notified = new Set<string>();
    const enabled = options.autoIn || options.autoOut || options.missedAlert;
    const later = (delay: number) => { if (!stopped) timer = setTimeout(tick, delay); };
    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible' || !navigator.onLine || !enabled) return;
      if (busy.current) { later(2000); return; }
      const epoch = generation;
      busy.current = true;
      let delay = 60000;
      try {
        const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
        if (day !== lastDay) { lastDay = day; needsRefresh = true; dwell.reset(); notified.clear(); }
        if (needsRefresh || latest.current.missedAlert) {
          if (!await latest.current.refresh()) { latest.current.message('تعذر تأكيد الحالة من الخادم؛ البصمة التلقائية متوقفة مؤقتًا'); return; }
          needsRefresh = false;
        }
        const opt = { ...latest.current, status: latest.current.currentStatus?.() ?? latest.current.status };
        if (stopped || epoch !== generation || document.visibilityState !== 'visible') return;
        if (opt.blocked || opt.status === 'checking' || opt.status === 'error' || Date.now() < cooldownUntil) return;
        const incoming = opt.status === 'not-checked-in' || opt.status === 'not-checked-in-2';
        const outgoing = opt.status === 'checked-in' || opt.status === 'checked-in-2';
        if ((!incoming || (!opt.autoIn && !opt.missedAlert)) && (!outgoing || !opt.autoOut)) { opt.message('الفترة مكتملة أو الإجراء التلقائي غير مفعّل'); delay = 300000; return; }
        const window = opt.window(), now = Date.now();
        if (!window) { opt.message('لا يوجد دوام صالح لهذه الفترة؛ استخدم البصمة اليدوية أو راجع الجدول'); return; }
        if (incoming && (now < window.start - 1800000 || now > window.end)) { dwell.reset(); opt.message('انتظار نافذة الحضور: من نصف ساعة قبل الدوام إلى نهايته'); return; }
        if (incoming && opt.missedAlert) {
          const slot = reminderSlot(window.start, window.end, now);
          if (slot !== null) {
            const key = opt.scope + ':' + window.start + ':late:' + slot;
            let alreadySent = notified.has(key);
            try { alreadySent ||= localStorage.getItem('attendanceReminder:' + opt.scope) === key; } catch { /* storage optional */ }
            if (!alreadySent) { notified.add(key); try { localStorage.setItem('attendanceReminder:' + opt.scope, key); } catch { /* storage optional */ } opt.late(window.start); }
          }
        }
        if (incoming && opt.autoIn && opt.mode === 'scheduled') {
          const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(opt.scheduled) ? Date.parse(new Date(window.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }) + 'T' + opt.scheduled + ':00+03:00') : NaN;
          if (!Number.isFinite(time) || now < time) { opt.message('انتظار موعد الفحص المحدد داخل نافذة الدوام'); return; }
        }
        if (incoming && !opt.autoIn) { opt.message('تذكير الدوام مفعّل؛ الحضور يدوي'); return; }
        if (!getEmployeeLocations(opt.settings).length) { opt.message('لا يوجد موقع بصمة مسموح ومفعّل'); return; }
        if (!navigator.geolocation || !windowIsSecure()) { opt.message('يلزم HTTPS وإذن الموقع للبصمة التلقائية'); return; }
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }));
        if (stopped || epoch !== generation || document.visibilityState !== 'visible' || !navigator.onLine || latest.current.blocked) return;
        const fix = autoFix(opt.settings, position, Date.now());
        opt.fix(fix.accuracy, 'distance' in fix && Number.isFinite(fix.distance) ? fix.distance! : null);
        if (incoming && fix.kind === 'outside') {
          dwell.reset(); opt.message('خارج المواقع المسموحة؛ لا يوجد حضور تلقائي');
          delay = now < window.start + 1800000 ? 60000 : Math.min(300000, Math.max(60000, opt.interval * 60000));
          return;
        }
        const confirmed = dwell.observe(fix, Date.now());
        if (fix.kind === 'uncertain') { opt.message('الموقع غير دقيق أو قريب من الحدود؛ لا توجد بصمة تلقائية'); delay = 30000; return; }
        delay = confirmed ? incoming && now < window.start + 1800000 ? 60000 : Math.min(300000, Math.max(60000, opt.interval * 60000)) : 20000;
        if (fix.kind === 'inside') {
          opt.message(`داخل ${fix.name} — ${confirmed ? 'الموقع مؤكد' : 'انتظار ثبات الموقع 30 ثانية'}`);
          if (confirmed && incoming && opt.autoIn) {
            const saved = await opt.punch(position);
            dwell.reset(); needsRefresh = true;
            if (!saved) cooldownUntil = Date.now() + 120000;
            delay = saved ? 60000 : 120000;
          } else if (confirmed && outgoing && opt.autoOut && Date.now() >= window.end) {
            const key = opt.record?.id + ':end';
            if (!notified.has(key)) { notified.add(key); opt.departure(opt.record.id, 'انتهى موعد الدوام؛ أكد الانصراف إذا انتهيت من العمل'); }
          }
        } else {
          opt.message(confirmed ? 'تم تأكيد مغادرة نطاق المواقع المسموحة' : 'خارج الموقع؛ انتظار ثبات المغادرة دقيقتين');
          if (confirmed && outgoing && opt.autoOut) {
            if (opt.settings?.officeLocation?.preventOutCheckout) { opt.message('الانصراف مقيد داخل الموقع؛ راجع الإدارة إذا غادرت دون بصمة'); return; }
            const key = opt.record?.id + ':outside';
            if (!notified.has(key)) { notified.add(key); opt.departure(opt.record.id, 'تم تأكيد مغادرة الموقع؛ أكد الانصراف إذا انتهيت من العمل'); }
          }
        }
      } catch (error: any) {
        dwell.reset();
        if (!stopped && epoch === generation) latest.current.message(error.code === 1 ? 'إذن الموقع مرفوض؛ فعّله من إعدادات الموقع' : 'تعذر قراءة GPS؛ لم تسجل بصمة');
        delay = error.code === 1 ? 300000 : 60000;
      } finally { busy.current = false; if (!stopped && epoch === generation && document.visibilityState === 'visible' && navigator.onLine) later(delay); }
    };
    const resume = () => {
      generation++; clearTimeout(timer); dwell.reset(); needsRefresh = true;
      if (!enabled) { latest.current.message('البصمة التلقائية غير مفعّلة'); return; }
      if (!navigator.onLine) { latest.current.message('لا يوجد اتصال؛ لن تسجل بصمة حتى تأكيد الخادم'); return; }
      if (document.visibilityState !== 'visible') { latest.current.message('الفحص متوقف أثناء إخفاء التطبيق؛ سيستأنف عند فتحه'); return; }
      void tick();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume); window.addEventListener('offline', resume); window.addEventListener('pageshow', resume);
    resume();
    return () => { stopped = true; generation++; clearTimeout(timer); dwell.reset(); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', resume); window.removeEventListener('pageshow', resume); };
  }, [options.scope, options.autoIn, options.autoOut, options.mode, options.interval, options.scheduled, options.settings, options.missedAlert]);
}
const windowIsSecure = () => window.isSecureContext;
