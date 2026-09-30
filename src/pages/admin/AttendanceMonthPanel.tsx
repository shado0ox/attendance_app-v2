import { useEffect, useState } from 'react';
import { previousMonth } from '../../lib/attendanceMonths';
import { csvCell, formatMinutes, formatPunch } from '../../lib/attendanceReport';

export default function AttendanceMonthPanel({ companyId, employeeId, requestConfirm }: {
  companyId: string; employeeId: string; requestConfirm: (message: string, callback: () => void) => void;
}) {
  const [month, setMonth] = useState(previousMonth());
  const [state, setState] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(null); setError(''); setReason('');
    fetch(`/api/attendance-months?companyId=${encodeURIComponent(companyId)}&month=${encodeURIComponent(month)}`)
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!cancelled) setState(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'تعذر قراءة حالة الشهر'); });
    return () => { cancelled = true; };
  }, [month, companyId, refresh]);
  const change = async (action: string) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/attendance-months', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, month, action, reason, expectedStatus: state.status, expectedRevision: state.revision || 0 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data); setReason('');
    } catch (err: any) { setError(err.message || 'تعذر تحديث الشهر'); }
    finally { setBusy(false); }
  };
  const exportSnapshot = () => {
    const days = state.snapshot.days.filter((day: any) => !employeeId || day.empId === employeeId);
    const rows = [['الشركة', 'الشهر', 'تاريخ الاعتماد', 'التاريخ', 'الموظف', 'القسم', 'أول حضور', 'آخر انصراف', 'مدة العمل', 'الساعات العشرية', 'مكان الحضور', 'مكان الانصراف']];
    for (const day of days) rows.push([state.snapshot.companyName, month, state.approvedAt, day.date, day.empName, day.departmentName,
      formatPunch(day.first), formatPunch(day.last), formatMinutes(day.minutes), (day.minutes / 60).toFixed(2), day.first?.location, day.last?.location]);
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `كشف_معتمد_${month}_${employeeId || 'الكل'}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="p-5 bg-white border border-sky-100 rounded-2xl flex flex-col gap-3 min-w-0" dir="rtl">
    <h3 className="font-extrabold text-sm">اعتماد كشف الشهر</h3>
    <p className="text-xs text-slate-600">الاعتماد للشهور المنتهية بعد مراجعة السجلات الناقصة. يغلق إضافة وتعديل وحذف البصمات، ويحفظ نسخة ثابتة للتصدير.</p>
    <div className="flex flex-wrap items-center gap-3 min-w-0">
      <label className="flex items-center gap-2 text-xs">الشهر <input aria-label="شهر الاعتماد" type="month" value={month} disabled={busy} onChange={event => setMonth(event.target.value)} className="p-2 border rounded-lg min-w-0 max-w-full" /></label>
      <button disabled={busy} onClick={() => setRefresh(value => value + 1)} className="px-3 py-2 border rounded-lg text-xs">تحديث الحالة</button>
      <strong className="text-xs">{state ? state.status === 'approved' ? 'معتمد ومغلق' : 'مفتوح' : 'جارٍ قراءة الحالة'}</strong>
      {state?.status === 'open' && <button disabled={busy} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs disabled:opacity-50" onClick={() => requestConfirm(`اعتماد شهر ${month} وإغلاق تعديل البصمات؟`, () => { void change('approve'); })}>اعتماد وإغلاق الشهر</button>}
      {state?.status === 'approved' && <button disabled={busy || !state.snapshot.days.some((day: any) => !employeeId || day.empId === employeeId)} onClick={exportSnapshot} className="px-4 py-2 bg-sky-50 border border-sky-200 rounded-lg text-xs disabled:opacity-50">تصدير النسخة المعتمدة {employeeId ? 'للموظف المختار' : 'للشهر'}</button>}
    </div>
    {state?.status === 'approved' && <>
      <p className="text-xs text-slate-500">اعتمد بواسطة {state.approvedBy} في {new Date(state.approvedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })} — إجمالي {formatMinutes(state.snapshot.totalMinutes)}</p>
      <div className="flex flex-wrap gap-2 min-w-0">
        <input aria-label="سبب إعادة فتح الشهر" placeholder="سبب إعادة الفتح (5 أحرف على الأقل)" maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className="p-2 border rounded-lg text-xs flex-1 min-w-0 basis-64" />
        <button disabled={busy || reason.trim().length < 5} onClick={() => requestConfirm(`إعادة فتح شهر ${month} للتعديل؟ سيتم تسجيل السبب.`, () => { void change('reopen'); })} className="px-4 py-2 border border-amber-300 text-amber-800 rounded-lg text-xs disabled:opacity-50">إعادة فتح الشهر</button>
      </div>
    </>}
    {state?.status === 'open' && state.reopenReason && <p className="text-xs text-amber-700">آخر سبب لإعادة الفتح: {state.reopenReason}</p>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
  </section>;
}
