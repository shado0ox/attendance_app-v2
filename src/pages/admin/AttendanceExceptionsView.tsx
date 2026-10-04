import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { attendanceToday } from '../../lib/attendanceQuery';
import { exceptionLabels, type ExceptionType } from '../../lib/attendanceExceptions';
import { csvCell, formatMinutes, formatPunch } from '../../lib/attendanceReport';
const labels = (item: any) => item.exceptions.types.map((type: ExceptionType) => exceptionLabels[type]).join('، ');
const punchLabel = (punch: { time: number } | undefined, date: string) => {
  if (!punch) return '—';
  const actualDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(punch.time));
  return `${formatPunch(punch)}${actualDate !== date ? ` (${actualDate})` : ''}`;
};
const dayName = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' });
export default function AttendanceExceptionsView({ canExport = true, companyId, employees, departments, onOpenDay }: { canExport?: boolean; companyId: string; employees: any[]; departments: any[]; onOpenDay: (empId: string, date: string) => void }) {
  const today = attendanceToday();
  const [draft, setDraft] = useState({ from: today.slice(0, 7) + '-01', to: today, empId: '', dept: '', type: '' });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const detail = useRef<HTMLElement>(null);
  const pending = JSON.stringify(draft) !== JSON.stringify(applied);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setReport(null); setSelected(null); setError('');
    fetch(`/api/attendance-exceptions?${new URLSearchParams({ companyId, ...applied, page: String(page), pageSize: '50' })}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر التحميل');
      if (!controller.signal.aborted) setReport(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'تعذر الاتصال'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, applied, page, refresh]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    detail.current?.focus();
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key !== 'Tab') return;
      const nodes = [...(detail.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || [])];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === detail.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === detail.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyDown);
    return () => { document.removeEventListener('keydown', keyDown); document.body.style.overflow = overflow; previous?.focus(); };
  }, [selected]);
  const apply = () => { setApplied({ ...draft }); setPage(1); setRefresh(n => n + 1); };
  const csv = async () => {
    setExporting(true); setError('');
    try {
      const response = await fetch(`/api/attendance-exceptions?${new URLSearchParams({ companyId, ...applied, mode: 'all' })}`);
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر التصدير');
      const rows = [['الموظف', 'التاريخ', 'اليوم', 'القسم', 'الاستثناءات', 'الشيفت المنشور', 'أول حضور', 'آخر انصراف', 'الدقائق المحسوبة', 'تأخير بعد السماح', 'انصراف مبكر', 'إضافي محتمل', 'مكان الحضور', 'مكان الانصراف', 'طلبات تصحيح معلقة', 'ملاحظات']];
      for (const item of data.items) rows.push([item.empName, item.date, dayName(item.date), item.departmentName, labels(item), item.shiftName, punchLabel(item.first, item.date), punchLabel(item.last, item.date), item.minutes ?? '', item.exceptions.lateMinutes, item.analysis.earlyMinutes ?? '', item.analysis.overtimeMinutes ?? '', item.first?.location || '', item.last?.location || '', item.pendingCorrections.length, item.note]);
      const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `استثناءات_الحضور_${applied.from}_${applied.to}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) { setError(e.message || 'تعذر التصدير'); } finally { setExporting(false); }
  };
  return <div className="space-y-4 min-w-0" dir="rtl">
    <div className="bg-white border rounded-2xl p-4 space-y-3"><h2 className="font-bold">استثناءات الحضور للمراجعة</h2><p className="text-xs text-slate-500">حسب الجدول المنشور وتاريخ القسم والحالة. الغياب بعد نهاية الشيفت، والانصراف غير المسجل أثناء الدوام الجاري لا يعتبر بصمة ناقصة. البيانات للمراجعة ولا تُعدل البصمات أو تعتمد خصومات.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 text-xs">
        <label>من تاريخ<input type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} className="border rounded-lg p-2 w-full mt-1" /></label>
        <label>إلى تاريخ<input type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} className="border rounded-lg p-2 w-full mt-1" /></label>
        <label>القسم<select value={draft.dept} onChange={e => setDraft({ ...draft, dept: e.target.value })} className="border rounded-lg p-2 w-full mt-1"><option value="">كل الأقسام</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>الموظف<select value={draft.empId} onChange={e => setDraft({ ...draft, empId: e.target.value })} className="border rounded-lg p-2 w-full mt-1"><option value="">كل الموظفين</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>نوع الاستثناء<select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })} className="border rounded-lg p-2 w-full mt-1"><option value="">كل الاستثناءات</option>{Object.entries(exceptionLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      </div><div className="flex gap-2 flex-wrap items-center"><button disabled={loading || exporting} onClick={apply} className="bg-sky-600 text-white rounded-lg px-4 py-2 text-xs disabled:opacity-50">{loading ? 'جارٍ التحميل…' : 'بحث / تحديث'}</button><button disabled={!canExport || !report || loading || exporting || !report.total} onClick={csv} className="border rounded-lg px-4 py-2 text-xs disabled:opacity-50">{exporting ? 'جارٍ التصدير…' : 'تصدير كل النتائج CSV'}</button><span className="text-xs text-slate-500">حتى 31 يومًا · التصدير حسب الفلاتر المطبقة</span>{pending && <span className="text-xs text-amber-700">الفلاتر تغيرت؛ اضغط بحث لتطبيقها.</span>}</div>
    </div>
    {error && <p role="alert" className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm">{error}</p>}
    {report && <><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">{[['أيام فيها استثناءات', report.totalExceptionDays], ['غياب', report.counts.absent], ['بصمات ناقصة', report.counts.missing], ['تأخير', report.counts.late]].map(([label,value]) => <div key={label} className="border rounded-xl bg-white p-4"><p className="text-slate-500 mb-2">{label}</p><strong className="text-lg">{value}</strong></div>)}</div><p className="text-xs text-slate-500">الإجماليات للقسم والموظف والفترة قبل فلتر نوع الاستثناء. اليوم قد يحمل أكثر من استثناء. النتائج مرتبة بأولوية المراجعة، ثم الأحدث.</p>
      <div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full min-w-[800px] text-xs text-right"><thead className="bg-slate-50"><tr>{['التاريخ / اليوم', 'الموظف / القسم', 'الاستثناءات', 'الدوام / البصمات', 'التصحيح', 'المراجعة'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{report.items.map((item: any) => <tr key={item.id} className="border-t"><td className="p-3">{item.date}<p className="text-slate-500 mt-1">{dayName(item.date)}</p></td><td className="p-3"><strong>{item.empName}</strong><p className="text-slate-500 mt-1">{item.departmentName}</p></td><td className="p-3"><div className="flex flex-wrap gap-1">{item.exceptions.types.map((type: ExceptionType) => <span key={type} className={`rounded px-2 py-1 ${item.exceptions.priority === 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{exceptionLabels[type]}</span>)}</div>{item.exceptions.lateMinutes > 0 && <p className="mt-1 text-slate-500">تأخير: {item.exceptions.lateMinutes} د</p>}</td><td className="p-3">{item.shiftName}<p dir="ltr" className="text-right mt-1">{punchLabel(item.first, item.date)} — {punchLabel(item.last, item.date)}</p><p className="text-slate-500">{formatMinutes(item.minutes)}</p></td><td className="p-3">{item.pendingCorrections.length ? <span className="text-sky-700">{item.pendingCorrections.length} طلب قيد المراجعة</span> : 'لا يوجد طلب معلق'}</td><td className="p-3"><button onClick={() => setSelected(item)} className="border rounded-lg px-3 py-2 text-sky-700">تفاصيل اليوم</button></td></tr>)}</tbody></table>{!report.items.length && <p className="p-8 text-center text-sm text-slate-500">لا توجد استثناءات مطابقة للفلاتر.</p>}</div>
      <div className="flex justify-between items-center text-xs"><span>{report.total} يوم مطابق · صفحة {report.page} من {report.pageCount}</span><div className="flex gap-2"><button disabled={loading || report.page <= 1} onClick={() => setPage(report.page - 1)} className="border rounded px-3 py-2 disabled:opacity-40">السابق</button><button disabled={loading || report.page >= report.pageCount} onClick={() => setPage(report.page + 1)} className="border rounded px-3 py-2 disabled:opacity-40">التالي</button></div></div>
    </>}
    {selected && <div className="fixed inset-0 z-[100] bg-black/40 p-3 flex items-center justify-center"><section ref={detail} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="exception-detail-title" className="bg-white rounded-2xl p-5 w-full max-w-3xl max-h-[92dvh] overflow-y-auto outline-none space-y-4">
      <div className="flex justify-between gap-3"><h3 id="exception-detail-title" className="font-bold">{selected.empName} · {selected.date}</h3><button onClick={() => setSelected(null)} className="border rounded px-3 py-1 text-xs">إغلاق</button></div><p className="text-sm">{labels(selected)}</p><dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">{[['القسم في السجل', selected.departmentName], ['الدوام المنشور', selected.shiftName], ['الموعد المجدول', selected.analysis.start ? `${punchLabel({ time: selected.analysis.start }, selected.date)} — ${punchLabel({ time: selected.analysis.end }, selected.date)}` : 'غير معروف'], ['سماح التأخير', `${selected.analysis.graceMinutes} دقيقة`], ['مكان أول حضور', selected.first?.location || 'غير مسجل'], ['مكان آخر انصراف', selected.last?.location || 'غير مسجل'], ['ملاحظة الجدول', selected.shiftNote || '—'], ['ملاحظة البصمة', selected.note || '—']].map(([label,value]) => <div key={label} className="border rounded-xl p-3"><dt className="text-slate-500 mb-1">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl>
      <h4 className="text-sm font-bold">السجلات الأصلية لهذا اليوم</h4>{!selected.records.length ? <p className="text-xs text-slate-500">يوم مجدول بدون سجل بصمة.</p> : <div className="space-y-2">{selected.records.map((row: any) => <article key={row.id} className="border rounded-xl p-3 text-xs space-y-1"><p>السجل {row.id} · {row.source || 'مصدر غير مسجل'}</p><p>الفترة الأولى: حضور {row.checkIn || 'غير مسجل'} · انصراف {row.checkOut || 'غير مسجل'}</p>{(row.checkIn2 || row.checkOut2) && <p>الفترة الثانية: حضور {row.checkIn2 || 'غير مسجل'} · انصراف {row.checkOut2 || 'غير مسجل'}</p>}<p className="whitespace-pre-wrap text-slate-500">{row.note || 'بدون ملاحظة'}</p></article>)}</div>}
      {selected.pendingCorrections.length > 0 && <div className="bg-sky-50 rounded-xl p-3 space-y-2 text-xs"><strong>طلبات تصحيح قيد المراجعة</strong>{selected.pendingCorrections.map((request: any) => <p key={request.id} className="whitespace-pre-wrap">طلب {request.id} · الفترة {request.period}: {request.notes || 'بدون ملاحظة'} · حضور {request.checkInTime || 'بدون تغيير'}{request.checkInNextDay ? ' (اليوم التالي)' : ''} · انصراف {request.checkOutTime || 'بدون تغيير'}{request.checkOutNextDay ? ' (اليوم التالي)' : ''}</p>)}</div>}
      <div className="flex gap-2 flex-wrap text-xs"><button onClick={() => onOpenDay(selected.empId, selected.date)} className="bg-sky-600 text-white rounded-lg px-4 py-2">فتح كشف هذا اليوم</button><Link to="/admin/requests" className="border rounded-lg px-4 py-2">مراجعة الطلبات</Link></div><p className="text-xs text-slate-500">هذه شاشة مراجعة. تصحيح السجلات واعتماد الطلبات يتمان بالمسارات الحالية، والإضافي المحتمل يحتاج اعتماد الإدارة.</p>
    </section></div>}
  </div>;
}
