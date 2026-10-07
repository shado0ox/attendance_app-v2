import { useEffect, useRef, useState } from 'react';
import { attendanceToday } from '../../lib/attendanceQuery';
import { dateOffset, notificationCategories, type AdminNotification } from '../../lib/adminNotifications';
export default function NotificationsView({ companyId, departments, onOpen, onUnread }: { companyId: string; departments: any[]; onOpen: (target: AdminNotification['target']) => void; onUnread: (count: number) => void }) {
  const today = attendanceToday();
  const [draft, setDraft] = useState({ from: dateOffset(today, -6), to: dateOffset(today, 6), dept: '', category: '', read: '' });
  const [applied, setApplied] = useState(draft), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<any>(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const unreadCallback = useRef(onUnread); unreadCallback.current = onUnread;
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setReport(null); setError('');
    fetch(`/api/notifications?${new URLSearchParams({ companyId, ...applied, page: String(page), pageSize: '30' })}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر تحميل التنبيهات');
      if (!controller.signal.aborted) { setReport(data); unreadCallback.current(data.unread); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message || 'تعذر الاتصال'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, applied, page, refresh]);
  const mark = async (ids: string[], read: boolean) => {
    if (!ids.length || saving) return; setSaving(true); setError('');
    try {
      const response = await fetch(`/api/notifications/read?${new URLSearchParams({ companyId, ...applied })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, read }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر حفظ القراءة');
      setRefresh(value => value + 1);
    } catch (error: any) { setError(error.message || 'تعذر حفظ القراءة'); } finally { setSaving(false); }
  };
  return <div dir="rtl" className="space-y-4 min-w-0">
    <section className="bg-white border rounded-2xl p-4 space-y-3">
      <h2 className="font-bold text-slate-800">مركز التنبيهات</h2>
      <p className="text-xs text-slate-500 leading-relaxed">الطلبات المعلقة واستثناءات الحضور ضمن الفترة، ونقص التغطية من اليوم للأيام القادمة حسب الجدول المنشور والإجازات المعتمدة. القراءة تخص حسابك، والحالات المحلولة تختفي عند تحديث القائمة.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 text-xs">
        <label>من<input type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} className="block w-full border rounded-lg p-2 mt-1" /></label>
        <label>إلى<input type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} className="block w-full border rounded-lg p-2 mt-1" /></label>
        <label>القسم<select value={draft.dept} onChange={e => setDraft({ ...draft, dept: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"><option value="">كل الأقسام المسموحة</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>النوع<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"><option value="">كل الأنواع المتاحة</option>{Object.entries(notificationCategories).filter(([key]) => !report || report.permissions[key]).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>القراءة<select value={draft.read} onChange={e => setDraft({ ...draft, read: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"><option value="">الكل</option><option value="unread">غير مقروء</option><option value="read">مقروء</option></select></label>
      </div>
      <div className="flex flex-wrap gap-2 items-center text-xs"><button disabled={loading || saving} onClick={() => { setApplied({ ...draft }); setPage(1); setRefresh(v => v + 1); }} className="bg-sky-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{loading ? 'جارٍ التحميل…' : 'بحث / تحديث'}</button><button disabled={loading || saving || !report?.items.some((item: AdminNotification) => !item.read)} onClick={() => mark(report.items.filter((item: AdminNotification) => !item.read).map((item: AdminNotification) => item.id), true)} className="border rounded-lg px-4 py-2 disabled:opacity-50">تحديد غير المقروء في الصفحة كمقروء</button><span className="text-slate-500">حتى 31 يومًا · الأرقام حسب الفترة والقسم المحددين</span>{dirty && <span className="text-amber-700">اضغط بحث لتطبيق الفلاتر الجديدة.</span>}</div>
    </section>
    {error && <p role="alert" className="bg-rose-50 text-rose-700 p-3 rounded-xl text-sm">{error}</p>}
    {report && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['غير مقروء', report.unread], ...Object.entries(notificationCategories).filter(([key]) => report.permissions[key]).map(([key,label]) => [label, `${report.counts[key].unread} / ${report.counts[key].total}`])].map(([label,value]) => <div key={label} className="bg-white border rounded-xl p-3"><p className="text-xs text-slate-500">{label}</p><strong className="text-xl text-slate-800">{value}</strong></div>)}</div>
      <p className="text-xs text-slate-500">الأرقام تعرض غير المقروء / الإجمالي قبل فلتر النوع والقراءة. آخر تحديث: {new Date(report.generatedAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', calendar: 'gregory' })}</p>
      <section className="space-y-3" aria-label="قائمة التنبيهات">{report.items.map((item: AdminNotification) => <article key={item.id} className={`border rounded-xl p-4 bg-white space-y-2 ${item.read ? 'border-slate-200' : 'border-sky-300'}`}>
        <div className="flex flex-wrap justify-between gap-2"><div className="flex flex-wrap gap-2 text-xs"><span className="bg-slate-100 rounded px-2 py-1">{notificationCategories[item.category]}</span><span className={`rounded px-2 py-1 ${item.priority <= 1 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{item.priority <= 1 ? 'أولوية مرتفعة' : 'للمراجعة'}</span><span className="text-slate-500 py-1">{item.date} · {item.departmentName}</span></div><span className="text-xs text-sky-700">{item.read ? 'مقروء' : 'غير مقروء'}</span></div>
        <h3 className="font-bold text-sm">{item.title}</h3><p className="text-xs text-slate-600 whitespace-pre-wrap break-words">{item.message}</p>
        <div className="flex flex-wrap gap-2"><button disabled={saving || loading} onClick={() => onOpen(item.target)} className="rounded-lg px-3 py-2 text-xs border text-sky-700 disabled:opacity-50">{item.category === 'coverage' ? 'فتح جدول القسم' : item.category === 'attendance' ? 'مراجعة يوم الموظف' : 'فتح طلبات الموظف'}</button><button disabled={saving || loading} onClick={() => mark([item.id], !item.read)} className="rounded-lg px-3 py-2 text-xs border disabled:opacity-50">{item.read ? 'إرجاع لغير مقروء' : 'تحديد كمقروء'}</button></div>
      </article>)}{!report.items.length && <p className="text-center bg-white border rounded-xl p-8 text-sm text-slate-500">لا توجد تنبيهات مطابقة للفلاتر ضمن صلاحياتك.</p>}</section>
      <div className="flex flex-wrap gap-3 items-center text-xs"><button disabled={loading || saving || report.page <= 1} onClick={() => setPage(report.page - 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">السابق</button><span>صفحة {report.page} / {report.pageCount} · {report.total} نتيجة</span><button disabled={loading || saving || report.page >= report.pageCount} onClick={() => setPage(report.page + 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">التالي</button></div>
    </>}
  </div>;
}
