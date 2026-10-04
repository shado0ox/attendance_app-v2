import { useEffect, useState } from 'react';
const labels: Record<string, string> = { employmentEffectiveDate: 'تاريخ سريان التغيير', name: 'الاسم', dept: 'القسم', phone: 'الجوال', email: 'البريد', username: 'اسم المستخدم', status: 'الحالة', password: 'رمز الدخول', restrictAttendanceLocations: 'تقييد المواقع', allowedAttendanceLocationIds: 'المواقع المسموحة', color: 'اللون', statusReason: 'سبب تغيير الحالة' };
const actions: Record<string, string> = { 'employee.email.verify': 'تأكيد البريد الإلكتروني', 'employee.email.verification.send': 'إرسال رمز تأكيد البريد', 'employee.create': 'إضافة موظف', 'employee.update': 'تعديل البيانات', 'employee.status': 'تغيير الحالة', 'employee.email': 'تسجيل البريد بواسطة الموظف' };
export default function EmployeeHistory({ employee, companyId, departments, onClose }: { employee: any; companyId: string; departments: any[]; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/employee-audit?${new URLSearchParams({ companyId, empId: employee.id })}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر تحميل السجل');
      if (!controller.signal.aborted) setRows(result);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, employee.id, refresh]);

  return <div className="fixed inset-0 bg-black/40 z-[100] p-4 flex items-center justify-center" dir="rtl"><section role="dialog" aria-modal="true" aria-labelledby="employee-history-title" className="bg-white rounded-2xl w-full max-w-2xl max-h-[85dvh] overflow-y-auto p-5"><div className="flex justify-between gap-3 items-center"><h2 id="employee-history-title" className="font-bold">سجل {employee.name}</h2><button onClick={onClose} className="border rounded px-3 py-1">إغلاق</button></div><p className="text-xs text-slate-500 my-3">آخر 100 تعديل. يبدأ التسجيل من هذا التحديث؛ التعديلات القديمة غير متاحة.</p><button disabled={loading} onClick={() => setRefresh(n => n + 1)} className="text-sky-700 text-xs mb-3">تحديث السجل</button>{loading ? <p>جارٍ التحميل…</p> : error ? <p role="alert" className="text-rose-600">{error}</p> : !rows.length ? <p className="text-sm">لا توجد تعديلات مسجلة بعد.</p> : <EmployeeAuditEntries rows={rows} departments={departments} />}</section></div>;
}

export function EmployeeAuditEntries({ rows, departments }: { rows: any[]; departments: any[] }) {
  const display = (field: string, value: any) => value === null || value === undefined ? 'غير مسجل' : field === 'dept' ? departments.find(d => d.id === value)?.name || String(value) : field === 'status' ? ({ active: 'نشط', suspended: 'موقوف', archived: 'مؤرشف' } as any)[value] || String(value) : typeof value === 'boolean' ? value ? 'نعم' : 'لا' : Array.isArray(value) ? value.join('، ') || 'لا توجد' : String(value);
  return <div className="space-y-3">{rows.map(row => <article key={row.id} className="border rounded-xl p-3 text-xs"><strong>{actions[row.action] || row.action}</strong><p className="text-slate-500 my-2">{row.details?.actorName || row.actorId} · {new Date(row.createdAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</p>{row.details?.email && <p className="my-1">البريد: {row.details.email}</p>}{Object.entries(row.details?.changes || {}).map(([field, raw]) => { const change = raw as any; return <p key={field} className="my-1 break-words"><strong>{labels[field] || field}: </strong>{display(field, change.before)} ← {display(field, change.after)}</p>; })}</article>)}</div>;
}
