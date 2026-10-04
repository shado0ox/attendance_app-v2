import { useEffect, useState } from 'react';
import { canonicalSchedule, scheduleContent } from '../lib/schedulePublication';
export default function SchedulePublication({ companyId, schedule, shiftTypes, onPublished }: { companyId: string; schedule: any; shiftTypes: any[]; onPublished: () => Promise<boolean> }) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<any>(null);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setState(null); setError('');
    fetch(`/api/schedule-publication?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر تحميل حالة النشر');
      if (!controller.signal.aborted) setState(result);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [companyId, retry]);
  useEffect(() => {
    let cancelled = false;
    setSignature('');
    if (!globalThis.crypto?.subtle) { setError('افتح البرنامج عبر HTTPS لتجهيز النشر'); return; }
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSchedule(scheduleContent({ schedule, shiftTypes })))).then(buffer => {
      if (!cancelled) setSignature(Array.from(new Uint8Array(buffer)).map(v => v.toString(16).padStart(2, '0')).join(''));
    }).catch(() => { if (!cancelled) setError('تعذر تجهيز النشر؛ افتح البرنامج عبر HTTPS'); });
    return () => { cancelled = true; };
  }, [schedule, shiftTypes]);
  const dirty = !!signature && !!state && signature !== state.publishedSignature;
  const publish = async () => {
    if (busy || !dirty || !window.confirm('نشر جميع جداول الشركة ومواعيد الشيفتات لكل الأقسام والأشهر؟ ستصبح هذه النسخة ظاهرة للموظفين.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/schedule-publication?companyId=${encodeURIComponent(companyId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedSignature: signature }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر النشر');
      setState(result);
      if (!await onPublished()) setError('تم النشر، لكن تعذر تحديث نسخة الإدارة. أعد تحميل البيانات قبل إجراء تعديل جديد.');
    } catch (e: any) { setError(e.message || 'تعذر تأكيد النشر. حدّث الصفحة للتحقق من الحالة قبل المحاولة مجددًا.'); }
    finally { setBusy(false); }
  };
  return <div className={`p-4 rounded-xl border flex flex-col gap-2 text-xs ${dirty ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`} dir="rtl"><strong>{!state || !signature ? 'جارٍ التحقق من حالة النشر…' : dirty ? 'توجد تعديلات مسودة لم تُنشر للموظفين' : 'الجدول المحفوظ مطابق للنسخة الظاهرة للموظفين'}</strong><p>الحفظ يحفظ مسودة الإدارة. النشر يشمل جميع الأقسام والأشهر ومواعيد الشيفتات، وليس القسم أو الشهر المعروض فقط.</p>{state?.publishedAt && <p>آخر نشر: {new Date(state.publishedAt).toLocaleString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh' })} · {state.publishedBy || 'المسؤول'}</p>}<button disabled={busy || !dirty} onClick={publish} className="self-start bg-sky-700 text-white px-4 py-2 rounded-lg disabled:opacity-40">{busy ? 'جارٍ النشر…' : 'نشر جدول جميع الأقسام'}</button>{error && <div><p role="alert" className="text-rose-700">{error}</p><button disabled={busy} onClick={() => setRetry(n => n + 1)} className="underline mt-2">تحديث حالة النشر</button></div>}</div>;
}
