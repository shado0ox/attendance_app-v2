import { useEffect, useRef, useState, type FormEvent } from 'react';
import { validEmployeeEmail } from '../lib/employeeDirectory';
import { employeeEmailVerified, normalizedEmail } from '../lib/emailVerification';
export default function EmployeeEmailVerification({ employee, companyId, onSaved }: { employee: any; companyId: string; onSaved: () => Promise<boolean> }) {
  const [open, setOpen] = useState(!validEmployeeEmail(employee.email));
  const [draft, setDraft] = useState(employee.email || '');
  const [status, setStatus] = useState<any>({ email: employee.email || '', verified: employeeEmailVerified(employee), available: false });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusReload, setStatusReload] = useState(0);
  const [checking, setChecking] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [retryUntil, setRetryUntil] = useState(0);
  const serverOffset = useRef(0);
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const dialog = useRef<HTMLElement>(null);
  const base = `/api/employee-profile/email-verification?companyId=${encodeURIComponent(companyId)}`;
  const applyStatus = (result: any) => {
    if (result.email !== undefined) setStatus((old: any) => ({ ...old, ...result }));
    else if (result.attemptsRemaining !== undefined) setStatus((old: any) => ({ ...old, attemptsRemaining: result.attemptsRemaining }));
    if (result.serverTime) serverOffset.current = result.serverTime - Date.now();
    if (result.retryAfter !== undefined) setRetryUntil(Date.now() + result.retryAfter * 1000);
    setNow(Date.now());
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const request of requests.current) request.abort(); requests.current.clear(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    fetch(base, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر تحميل حالة البريد');
      if (!controller.signal.aborted) applyStatus(result);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'تعذر الاتصال'); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [companyId, employee.id, employee.email, employee.emailVerifiedAt, statusReload]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || [])];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);
  const cooldown = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const expiresIn = Math.max(0, Math.ceil(((status.expiresAt || 0) - (now + serverOffset.current)) / 1000));
  const hasCode = status.codePending && expiresIn > 0 && status.attemptsRemaining > 0;
  const invoke = async (url: string, method: string, body: any) => {
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const result = await response.json();
      if (!mounted.current) return null;
      applyStatus(result);
      if (!response.ok) { setError(result.error || 'تعذر إتمام الطلب'); return null; }
      return result;
    } catch { if (mounted.current) setError('تعذر تأكيد العملية. تحقق من الاتصال وحاول مرة أخرى.'); return null; }
    finally { requests.current.delete(controller); }
  };
  const saveAndSend = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || checking) return;
    if (!validEmployeeEmail(draft.trim())) { setError('أدخل بريدًا إلكترونيًا صحيحًا'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await invoke(`/api/employee-profile/email?companyId=${encodeURIComponent(companyId)}`, 'PATCH', { email: draft.trim() });
      if (!saved) return;
      const changed = normalizedEmail(saved.email) !== normalizedEmail(status.email);
      if (changed) { setCode(''); setStatus((old: any) => ({ ...old, email: saved.email, verified: false, verifiedAt: null, codePending: false })); }
      if (status.available && cooldown === 0 && !(status.verified && !changed)) {
        const sent = await invoke(base.replace('email-verification?', 'email-verification/send?'), 'POST', {});
        if (sent) { setCode(''); setMessage(sent.message || 'تم طلب الرمز'); }
      } else setMessage(status.verified && !changed ? 'بريدك مؤكد بالفعل' : status.available ? `تم حفظ البريد؛ يمكنك إرسال الرمز بعد ${cooldown} ثانية.` : 'تم حفظ البريد. خدمة إرسال رموز التأكيد غير مفعلة حاليًا.');
      if (changed) await onSaved();
    } finally { if (mounted.current) setBusy(false); }
  };
  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await invoke(base.replace('email-verification?', 'email-verification/confirm?'), 'POST', { code });
      if (result) { setCode(''); setMessage('تم تأكيد بريدك بنجاح'); await onSaved(); }
    } finally { if (mounted.current) setBusy(false); }
  };
  const editChanged = normalizedEmail(draft) !== normalizedEmail(status.email);
  return <>
    <div className={`border-b p-3 text-center text-xs ${status.verified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} dir="rtl">
      {status.verified ? 'بريدك الإلكتروني مؤكد.' : validEmployeeEmail(status.email) ? 'بريدك محفوظ ويحتاج تأكيدًا.' : 'أكمل بريدك الإلكتروني للتواصل مع الإدارة.'} <button className="font-bold underline" onClick={() => { setDraft(status.email || employee.email || ''); setError(''); setMessage(''); setNow(Date.now()); setStatusReload(n => n + 1); setOpen(true); }}>{status.verified ? 'تعديل البريد' : 'إضافة / تأكيد البريد'}</button>
    </div>
    {open && <div className="fixed inset-0 z-[100] bg-black/40 p-3 flex items-center justify-center" dir="rtl"><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="employee-email-title" className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-xl space-y-4">
      <div className="flex justify-between items-center gap-2"><h2 id="employee-email-title" className="font-bold text-lg">البريد الإلكتروني وتأكيده</h2><button disabled={busy} onClick={() => setOpen(false)} className="border rounded px-3 py-2 text-xs">لاحقًا</button></div>
      <p className="text-sm text-slate-600">احفظ بريدك ثم أكد ملكيته برمز يصلك عليه. تأكيد البريد لا يغيّر كلمة المرور، ويمكنك استخدام الجدول والبصمة أثناء ذلك.</p>
      {checking ? <p role="status" className="text-xs">جارٍ تحميل حالة البريد…</p> : !status.available && <p className="text-xs bg-slate-50 rounded p-3">خدمة إرسال رموز التأكيد غير مفعلة حاليًا؛ يمكنك حفظ بريدك والتأكيد لاحقًا.</p>}
      <form onSubmit={saveAndSend} className="space-y-3"><label className="block text-sm">البريد الإلكتروني<input required type="email" maxLength={254} dir="ltr" value={draft} onChange={e => setDraft(e.target.value)} autoComplete="email" className="border rounded-lg p-3 w-full mt-2" placeholder="name@example.com" /></label>
        {editChanged && status.verified && <p className="text-xs text-amber-700">تغيير البريد سيلغي تأكيد العنوان السابق.</p>}
        <button disabled={busy || checking || (status.available && cooldown > 0 && !editChanged && !status.verified)} className="bg-sky-600 text-white rounded-lg px-4 py-2 disabled:opacity-50 w-full">{busy ? 'جارٍ التنفيذ…' : status.verified && !editChanged ? 'حفظ البريد' : status.available ? editChanged && cooldown > 0 ? 'حفظ البريد' : cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : hasCode ? 'إرسال رمز جديد' : 'حفظ البريد وإرسال الرمز' : 'حفظ البريد'}</button>
      </form>
      {hasCode && !editChanged && <form onSubmit={confirm} className="border-t pt-4 space-y-3"><label className="block text-sm">رمز التأكيد<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '').slice(0, 6))} dir="ltr" className="border rounded-lg p-3 w-full mt-2 text-center text-xl tracking-widest" placeholder="000000" /></label><p className="text-xs text-slate-500">استخدم أحدث رمز. المتبقي {Math.ceil(expiresIn / 60)} دقيقة · المحاولات المتبقية {status.attemptsRemaining}</p><button disabled={busy || code.length !== 6} className="bg-emerald-600 text-white rounded-lg px-4 py-2 w-full disabled:opacity-50">تأكيد البريد</button></form>}
      {status.expiresAt && !status.verified && expiresIn === 0 && <p className="text-xs text-amber-700">انتهت صلاحية الرمز؛ اطلب رمزًا جديدًا.</p>}
      {status.attemptsRemaining === 0 && !status.verified && <p className="text-xs text-rose-700">انتهت المحاولات المسموحة؛ انتظر مهلة الإرسال واطلب رمزًا جديدًا.</p>}
      {error && <div role="alert"><p className="text-sm text-rose-600">{error}</p><button disabled={busy || checking} onClick={() => { setError(''); setStatusReload(n => n + 1); }} className="text-xs underline mt-2">تحديث حالة البريد</button></div>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <p className="text-xs text-slate-500">راجع الرسائل غير المرغوب فيها. لا تشارك الرمز مع أي شخص.</p>
    </section></div>}
  </>;
}
