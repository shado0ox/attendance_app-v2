import { useEffect, useState } from 'react';
export default function AttendancePasskeySettings({ companyId }: { companyId: string }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [search, setSearch] = useState('');
  const load = async () => { const r = await fetch('/api/attendance-passkey/policy'); const value = await r.json(); if (!r.ok) throw new Error(value.error); setData(value); };
  useEffect(() => { setData(null); load().catch(e => setError(e.message)); }, [companyId]);
  const save = async (url: string, body: any) => {
    setBusy(true); setError('');
    try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const value = await r.json(); if (!r.ok) throw new Error(value.error); await load(); setError('تم الحفظ'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="p-5 bg-white border rounded-2xl space-y-4" dir="rtl">
    <h3 className="font-bold text-lg">تأكيد الحضور باستخدام Passkey</h3>
    <p className="text-sm text-slate-600">يطلب تأكيد الجهاز عند كل حضور وانصراف، دون التقاط صورة. سجّل المفتاح تحت إشراف الإدارة قبل اعتماده. السماح بالمفتاح لا يثبت أنه محصور في جوال واحد.</p>
    {data && <>
      <label className="block">تطبيق الخدمة<select aria-label="تطبيق خدمة Passkey" disabled={busy} className="block p-3 border rounded-xl w-full" value={data.mode} onChange={e => setData({ ...data, mode: e.target.value })}><option value="off">معطلة للجميع</option><option value="all">مفعلة لجميع الموظفين</option><option value="selected">مفعلة لموظفين محددين للتجربة</option></select></label>
      {data.mode === 'selected' && <div className="max-h-64 overflow-auto border rounded-xl p-3">{data.employees.map((e: any) => <label key={e.id} className="flex gap-3 py-2"><input disabled={busy} type="checkbox" checked={data.employeeIds.includes(e.id)} onChange={event => setData({ ...data, employeeIds: event.target.checked ? [...data.employeeIds, e.id] : data.employeeIds.filter((id: string) => id !== e.id) })} />{e.name}</label>)}</div>}
      <p className="text-sm text-amber-800">عند التفعيل، الموظف الذي لم يُعتمد مفتاحه لن يستطيع تسجيل البصمة من البوابة. يظل التصحيح الإداري متاحًا بصلاحياته الحالية.</p>
      <button disabled={busy} className="bg-teal-700 text-white px-4 py-3 rounded-xl disabled:opacity-50" onClick={() => void save('/api/attendance-passkey/policy', { mode: data.mode, employeeIds: data.employeeIds })}>حفظ نطاق التفعيل</button>
      <label className="block">بحث الموظفين<input className="block w-full border rounded-xl p-3" value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم الموظف" /></label><details><summary className="cursor-pointer py-3 font-semibold">اعتماد مفاتيح الموظفين وإلغاء اعتمادها</summary>{data.employees.filter((e: any) => e.name.toLowerCase().includes(search.toLowerCase())).map((e: any) => <div className="border-t py-3" key={e.id}><strong>{e.name}</strong>{!e.credentials.length && <p className="text-sm">لم يسجل مفتاحًا بعد</p>}{e.credentials.map((c: any, index: number) => <div key={c.id} className="flex flex-wrap gap-3 items-center py-2"><span>المفتاح {index + 1} — {c.approved ? 'معتمد' : 'بانتظار الاعتماد'}{c.backedUp ? ' — قابل للمزامنة' : ''}</span><button disabled={busy} className="border rounded-lg px-3 py-2" onClick={() => void save('/api/attendance-passkey/credential', { employeeId: e.id, credentialId: c.id, approved: !c.approved })}>{c.approved ? 'إلغاء الاعتماد' : 'اعتماد بعد التحقق من الموظف'}</button></div>)}</div>)}</details>
    </>}
    <p role="status">{error}</p>
  </section>;
}
