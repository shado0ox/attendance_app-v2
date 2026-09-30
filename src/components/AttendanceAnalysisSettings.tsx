import { useEffect, useState } from 'react';
export default function AttendanceAnalysisSettings({ settings, save }: { settings: any; save: (settings: any) => Promise<boolean> }) {
  const [grace, setGrace] = useState(String(settings?.attendanceAnalysis?.graceMinutes ?? 0));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setGrace(String(settings?.attendanceAnalysis?.graceMinutes ?? 0)); }, [settings?.attendanceAnalysis?.graceMinutes]);
  const valid = /^\d+$/.test(grace) && Number(grace) <= 120;
  return <section className="p-5 bg-white border rounded-2xl flex flex-col gap-3">
    <h3 className="text-sm font-bold">تحليل الحضور حسب جدول الدوام</h3>
    <p className="text-xs text-slate-600">السماح يُخصم من دقائق التأخير. الغياب بعد نهاية الدوام فقط، مع استبعاد الراحة والإجازة المعتمدة. الإضافي المحتمل هو الوقت بعد نهاية الدوام، ولا يعني استحقاق صرف.</p>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label>سماح التأخير بالدقائق <input type="number" min={0} max={120} value={grace} onChange={event => setGrace(event.target.value)} disabled={busy} className="p-2 border rounded-lg w-24" /></label>
      <button disabled={!valid || busy} className="px-4 py-2 bg-sky-600 text-white rounded-lg disabled:opacity-50" onClick={async () => {
        setBusy(true); setMessage('');
        try { if (await save({ ...settings, attendanceAnalysis: { ...settings.attendanceAnalysis, graceMinutes: Number(grace) } })) setMessage('تم حفظ السماح'); else setMessage('تعذر الحفظ؛ راجع رسالة النظام'); }
        catch { setMessage('تعذر حفظ السماح'); } finally { setBusy(false); }
      }}>حفظ السماح</button>
    </div>
    {message && <p role="status" className="text-xs">{message}</p>}
  </section>;
}
