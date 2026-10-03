import { useEffect, useRef, useState } from 'react';

export default function SystemUpdateNotice({ blocked }: { blocked: boolean }) {
  const [available, setAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const requested = useRef(false);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false, checking = false, lastCheck = 0;
    let hadController = !!navigator.serviceWorker.controller;
    const watched = new Set<ServiceWorker>();
    const installed = () => {
      if (!cancelled && navigator.serviceWorker.controller && (registration.current?.waiting || registration.current?.installing?.state === 'installed')) setAvailable(true);
    };
    const watchInstalling = () => {
      const worker = registration.current?.installing;
      if (worker && !watched.has(worker)) { watched.add(worker); worker.addEventListener('statechange', installed); }
      installed();
    };
    const controlled = () => {
      if (cancelled) return;
      if (!hadController) { hadController = true; return; }
      if (requested.current && !blockedRef.current) window.location.reload();
      else { requested.current = false; setApplying(false); setAvailable(true); }
    };
    const check = async () => {
      if (cancelled || document.hidden || !navigator.onLine || checking || Date.now() - lastCheck < 60000) return;
      checking = true; lastCheck = Date.now();
      try {
        if (!registration.current) {
          const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
          if (cancelled) return;
          registration.current = reg;
          reg.addEventListener('updatefound', watchInstalling);
          watchInstalling();
        }
        await registration.current.update(); installed();
      }
      catch { /* A network failure must not interrupt the running app. */ }
      finally { checking = false; }
    };
    navigator.serviceWorker.addEventListener('controllerchange', controlled);
    void check();
    const interval = window.setInterval(check, 5 * 60000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.addEventListener('pageshow', check);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      registration.current?.removeEventListener('updatefound', watchInstalling);
      for (const worker of watched) worker.removeEventListener('statechange', installed);
      navigator.serviceWorker.removeEventListener('controllerchange', controlled);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      window.removeEventListener('pageshow', check);
    };
  }, []);
  if (!available) return null;
  return <div role="status" dir="rtl" className="sticky top-0 z-[125] p-3 bg-sky-900 text-white flex flex-wrap justify-center items-center gap-3 text-sm">
    <span>تحديث جديد للنظام متاح. اضغط لتحديث التطبيق إلى آخر نسخة.</span>
    <button type="button" disabled={blocked || applying} className="px-4 py-2 rounded-lg bg-white text-sky-900 font-bold disabled:opacity-50" onClick={() => {
      if (blockedRef.current) return;
      setError('');
      const waiting = registration.current?.waiting;
      if (!waiting) { window.location.reload(); return; }
      try {
        requested.current = true; setApplying(true);
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch { requested.current = false; setApplying(false); setError('تعذر تفعيل التحديث؛ أعد المحاولة'); }
    }}>{applying ? 'جارٍ تحديث النظام…' : 'تحديث النظام الآن'}</button>
    {blocked && <span>احفظ التعديلات الحالية أولاً، ثم حدّث النظام.</span>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
