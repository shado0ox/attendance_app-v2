import { useEffect, useRef, useState } from 'react';
import { formatMinutes, formatPunch } from '../lib/attendanceReport';
import { statusLabels } from '../lib/employeeLifecycle';
import { type ProfileSection } from '../lib/employeeProfile';
import { EmployeeAuditEntries } from './EmployeeHistory';
const sections: { id: ProfileSection; label: string }[] = [{ id: 'overview', label: 'البيانات' }, { id: 'schedule', label: 'جدول الدوام' }, { id: 'attendance', label: 'الحضور والانصراف' }, { id: 'requests', label: 'الطلبات' }, { id: 'history', label: 'سجل التعديلات' }];
const requestTypes: Record<string, string> = { leave: 'إجازة', swap: 'تبديل شيفت', shift_change: 'تغيير شيفت', attendance_adjustment: 'تصحيح بصمة' };
const requestStatuses: Record<string, string> = { pending: 'بانتظار المراجعة', approved: 'موافق عليه', rejected: 'مرفوض' };
const dayName = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' });
const dateTime = (date?: string) => date ? new Date(date).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', numberingSystem: 'latn' }) : 'غير مسجل';
export default function EmployeeProfile({ employee, companyId, departments, onClose, onEdit }: { employee: any; companyId: string; departments: any[]; onClose: () => void; onEdit: () => void }) {
  const [section, setSection] = useState<ProfileSection>('overview');
  const [month, setMonth] = useState(() => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 7));
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data: any } | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cache = useRef(new Map<string, any>());
  const panel = useRef<HTMLElement>(null);
  const monthly = ['schedule', 'attendance', 'requests'].includes(section);
  const key = `${companyId}|${employee.id}|${section}|${monthly ? month : ''}|${section === 'requests' ? page : 1}`;
  const data = result?.key === key ? result.data : null;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]') || [])];
      const first = focusable[0], last = focusable.at(-1);
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    const cached = cache.current.get(key);
    setError('');
    if (cached) { setResult({ key, data: cached }); setLoading(false); return () => controller.abort(); }
    setLoading(true);
    const query = new URLSearchParams({ companyId, section, month, page: String(page) });
    fetch(`/api/employees/${encodeURIComponent(employee.id)}/profile?${query}`, { signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'تعذر تحميل الملف');
      if (controller.signal.aborted) return;
      cache.current.set(key, payload); setResult({ key, data: payload });
      if (payload.employee) setProfile(payload.employee);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || 'تعذر الاتصال بالسيرفر'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, refresh, companyId, employee.id, section, month, page]);
  const retry = () => { cache.current.delete(key); setRefresh(n => n + 1); };
  const tableClass = 'w-full min-w-[650px] text-xs text-right';
  return <div className="fixed inset-0 z-[100] bg-black/40 p-2 sm:p-5 flex items-center justify-center" dir="rtl"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="employee-profile-title" className="bg-white rounded-2xl w-full max-w-5xl max-h-[94dvh] flex flex-col min-h-0 outline-none">
    <header className="p-4 border-b shrink-0"><div className="flex items-start justify-between gap-3"><div><h2 id="employee-profile-title" className="font-bold text-lg">ملف {profile?.name || employee.name}</h2><p className="text-xs text-slate-500 mt-1">{profile?.departmentName || departments.find(d => d.id === employee.dept)?.name || 'بدون قسم'} · {statusLabels[(profile?.status || employee.status || 'active') as keyof typeof statusLabels]}</p></div><div className="flex gap-2 shrink-0"><button onClick={onEdit} className="border rounded-lg px-3 py-2 text-xs">تعديل البيانات</button><button onClick={onClose} className="border rounded-lg px-3 py-2 text-xs">إغلاق</button></div></div>
      <nav aria-label="أقسام ملف الموظف" className="flex gap-2 flex-wrap mt-4">{sections.map(tab => <button key={tab.id} aria-pressed={section === tab.id} onClick={() => { setSection(tab.id); setPage(1); }} className={`rounded-lg px-3 py-2 text-xs ${section === tab.id ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{tab.label}</button>)}</nav>
    </header>
    <div className="p-4 overflow-y-auto min-h-0 overscroll-contain"><div className="flex flex-wrap items-center justify-between gap-3 mb-4">{monthly ? <label className="text-xs flex items-center gap-2">الشهر <input aria-label="شهر ملف الموظف" type="month" min="2000-01" value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setPage(1); } }} className="border rounded-lg p-2" /></label> : <span className="text-xs text-slate-500">{section === 'history' ? 'آخر 100 تعديل مسجل' : 'بيانات الموظف الحالية'}</span>}<button disabled={loading} onClick={retry} className="text-sky-700 text-xs border rounded-lg px-3 py-2 disabled:opacity-50">تحديث هذا القسم</button></div>
    {loading || (!data && !error) ? <p role="status" className="py-10 text-center text-slate-500">جارٍ التحميل…</p> : error ? <div role="alert" className="p-4 bg-rose-50 text-rose-700 rounded-xl"><p>{error}</p><button onClick={retry} className="underline text-xs mt-2">إعادة المحاولة</button></div> : <>
      {section === 'overview' && <><dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[['الاسم', data.employee.name], ['القسم', data.employee.departmentName], ['حالة الحساب', statusLabels[data.employee.status as keyof typeof statusLabels]], ['اسم المستخدم', data.employee.username], ['البريد الإلكتروني', data.employee.email], ['الجوال', data.employee.phone], ['آخر تاريخ سريان مسجل', data.employee.employmentEffectiveDate], ['سبب تغيير الحالة', data.employee.statusReason]].map(([label, value]) => <div key={label} className="p-4 border rounded-xl"><dt className="text-xs text-slate-500 mb-2">{label}</dt><dd className="text-sm break-words whitespace-pre-wrap">{value || 'غير مسجل'}</dd></div>)}</dl><p className="text-xs text-slate-500 mt-4">الجداول والحضور والطلبات متاحة في الأقسام بالأعلى. البيانات تُحمّل عند الحاجة؛ استخدم زر التحديث لجلب آخر نسخة.</p></>}
      {section === 'schedule' && <><p className="text-xs bg-sky-50 rounded-lg p-3 mb-3">الجدول المنشور للموظف، حسب القسم والحالة في كل يوم. {data.publishedAt ? `آخر نشر: ${dateTime(data.publishedAt)}` : 'جدول قائم بدون تاريخ نشر مسجل.'}</p><div className="overflow-x-auto border rounded-xl"><table className={tableClass}><thead className="bg-slate-50"><tr>{['التاريخ / اليوم', 'القسم', 'الدوام', 'المواعيد', 'الحالة', 'الملاحظات'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.items.map((item: any) => <tr key={item.date} className="border-t"><td className="p-3">{item.date}<span className="block text-slate-500">{dayName(item.date)}</span></td><td className="p-3">{item.departmentName}</td><td className="p-3">{item.shiftName}</td><td className="p-3" dir="ltr">{item.start && item.end ? `${item.start} – ${item.end}` : '—'}{item.start2 && <span className="block">{item.start2} – {item.end2}</span>}</td><td className="p-3">{statusLabels[item.status as keyof typeof statusLabels]}</td><td className="p-3 whitespace-pre-wrap">{item.note || '—'}</td></tr>)}</tbody></table></div></>}
      {section === 'attendance' && <><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">{[['ساعات الحضور المحسوبة', formatMinutes(data.totalMinutes)], ['أيام الغياب', data.absentDays], ['دقائق التأخير بعد السماح', data.lateMinutes], ['أيام تحتاج مراجعة', data.reviewCount]].map(([label, value]) => <div key={label} className="bg-slate-50 border rounded-xl p-3 text-xs"><p className="text-slate-500 mb-2">{label}</p><strong>{value}</strong></div>)}</div><p className="text-xs text-slate-500 mb-3">الحساب من أول حضور لآخر انصراف حسب إعدادات التحليل والجدول المنشور. ليس اعتمادًا للرواتب. الغياب يظهر بعد انتهاء الشيفت.</p>{!data.items.length ? <p className="p-6 text-center text-sm">لا توجد بصمات أو أيام مجدولة لهذا الشهر.</p> : <div className="overflow-x-auto border rounded-xl"><table className={tableClass}><thead className="bg-slate-50"><tr>{['التاريخ / اليوم', 'القسم', 'أول حضور / الموقع', 'آخر انصراف / الموقع', 'المدة', 'نتيجة التحليل', 'الملاحظات'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.items.map((item: any) => <tr key={item.date} className="border-t"><td className="p-3">{item.date}<span className="block text-slate-500">{dayName(item.date)}</span></td><td className="p-3">{item.departmentName}</td><td className="p-3"><span dir="ltr">{formatPunch(item.first)}</span><span className="block text-slate-500 mt-1">{item.first?.location || '—'}</span></td><td className="p-3"><span dir="ltr">{formatPunch(item.last)}</span><span className="block text-slate-500 mt-1">{item.last?.location || '—'}</span></td><td className="p-3">{formatMinutes(item.minutes)}</td><td className="p-3">{item.analysis?.status || item.reportStatus}</td><td className="p-3 whitespace-pre-wrap">{item.note || '—'}</td></tr>)}</tbody></table></div>}</>}
      {section === 'requests' && <><p className="text-xs text-slate-500 mb-3">حسب تاريخ اليوم المطلوب في الشهر، وليس تاريخ إرسال الطلب.</p><div className="flex flex-wrap gap-3 text-xs mb-4"><span>الإجمالي: {data.total}</span><span>بانتظار المراجعة: {data.pending}</span><span>الموافق عليها: {data.approved}</span><span>المرفوضة: {data.rejected}</span></div>{!data.items.length ? <p className="p-6 text-center text-sm">لا توجد طلبات لهذا الشهر.</p> : <div className="space-y-3">{data.items.map((item: any) => <article key={item.id} className="border rounded-xl p-4 text-xs"><div className="flex gap-2 justify-between"><strong>{requestTypes[item.type] || item.type} · {item.date}</strong><span>{requestStatuses[item.status] || item.status}</span></div><p className="whitespace-pre-wrap my-2">{item.notes || 'بدون ملاحظات'}</p>{item.swapWithEmpName && <p>التبديل مع: {item.swapWithEmpName}</p>}{item.targetShift && <p>الشيفت المطلوب: {item.targetShiftName || item.targetShift}</p>}{item.type === 'attendance_adjustment' && <div className="mt-2 space-y-1"><p>الفترة: {item.period === 2 ? 'الثانية' : 'الأولى'}</p><p>البصمة الأصلية: حضور {item.originalCheckIn || 'غير مسجل'} · انصراف {item.originalCheckOut || 'غير مسجل'}</p><p>الحضور المطلوب: {item.checkInTime || 'بدون تغيير'}{item.checkInNextDay ? ' (اليوم التالي)' : ''} · الانصراف المطلوب: {item.checkOutTime || 'بدون تغيير'}{item.checkOutNextDay ? ' (اليوم التالي)' : ''}</p></div>}<p className="text-slate-500 mt-2">أُرسل: {dateTime(item.createdAt)}</p>{item.reviewedAt && <p className="text-slate-500">المراجعة: {dateTime(item.reviewedAt)}</p>}{item.reviewReason && <p className="whitespace-pre-wrap mt-2">سبب القرار: {item.reviewReason}</p>}</article>)}</div>}<div className="flex justify-between items-center mt-4 text-xs"><span>صفحة {data.page} من {data.pageCount}</span><div className="flex gap-2"><button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="border rounded px-3 py-2 disabled:opacity-40">السابق</button><button disabled={data.page >= data.pageCount} onClick={() => setPage(data.page + 1)} className="border rounded px-3 py-2 disabled:opacity-40">التالي</button></div></div><p className="mt-3 text-xs text-slate-500">مراجعة الطلب والموافقة أو الرفض من شاشة الطلبات.</p></>}
      {section === 'history' && (data.items.length ? <EmployeeAuditEntries rows={data.items} departments={departments} /> : <p className="text-sm p-6 text-center">لا توجد تعديلات مسجلة. التعديلات قبل بدء التسجيل غير متاحة.</p>)}
    </>}
    </div>
  </section></div>;
}
