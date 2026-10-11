import { useEffect, useState } from 'react';
const labels: Record<string, string> = { employees: 'موظفون', departments: 'أقسام', photos: 'صور الموظفين', attendance: 'سجلات حضور', requests: 'طلبات الموظفين', registrationRequests: 'طلبات تسجيل', electronicDocuments: 'مستندات وتوقيعات', electronicDocumentAudit: 'سجل المستندات', attendanceMonths: 'كشوف شهرية', auditLog: 'سجل التعديلات' };
const dateTime = (value: string) => new Date(value).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh' });
export default function CompanyBackupPanel({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<any>(null), [action, setAction] = useState(''), [message, setMessage] = useState(''), [file, setFile] = useState(''), [fileName, setFileName] = useState(''), [preview, setPreview] = useState<any>(null), [confirmation, setConfirmation] = useState(''), [restored, setRestored] = useState(false);
  const endpoint = (path: string) => '/api/company-backup/' + path + '?' + new URLSearchParams({ companyId });
  const json = async (path: string, body?: any) => { const response = await fetch(endpoint(path), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) } : {}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ العملية'); return data; };
  useEffect(() => { let active = true; setStatus(null); setFile(''); setFileName(''); setPreview(null); setConfirmation(''); setMessage(''); setRestored(false); json('status').then(data => { if (active) setStatus(data); }).catch(e => { if (active) setMessage(e.message); }); return () => { active = false; }; }, [companyId]);
  const run = async (name: string, job: () => Promise<void>) => { if (action) return; setAction(name); setMessage(''); try { await job(); } catch (e: any) { setMessage(e.message || 'تعذر تأكيد العملية؛ حدّث الحالة قبل إعادة المحاولة'); } finally { setAction(''); } };
  const download = async (path: string, name: string, post = false) => {
    const response = await fetch(endpoint(path), post ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(120000) } : {});
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'تعذر تنزيل النسخة'); }
    const url = URL.createObjectURL(await response.blob()), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus(await json('status')); setMessage('تم تجهيز وتنزيل نسخة بيانات شركتك؛ احتفظ بها في مكان آمن خارج السيرفر.');
  };
  return <section className="bg-white border rounded-2xl p-4 space-y-4" dir="rtl">
    <h3 className="font-bold">نسخة بيانات شركتك واسترجاعها</h3>
    <p className="text-sm text-slate-600">تشمل الموظفين والجداول والفروع والحضور والطلبات والمستندات والتوقيعات والصور والكشوف الشهرية. الملف مشفر ومخصص لنفس الشركة على هذا السيرفر. حسابات الإدارة وصلاحياتها وإعدادات ربط واتساب ومفاتيح الباس كي الحالية لا تُستبدل.</p>
    <p className="text-xs text-amber-800">للرجوع بعد فقد السيرفر بالكامل، يجب الاحتفاظ بمفتاح COMPANY_BACKUP_KEY أو نسخة قاعدة البيانات التي تحتوي مفتاح النسخ؛ ملف الشركة وحده لا يكفي في تلك الحالة.</p>
    <div className="flex flex-wrap gap-2">
      <button disabled={!!action || restored} className="bg-teal-700 text-white rounded-xl px-4 py-3 disabled:opacity-50" onClick={() => void run('download', () => download('download', 'wafr-company-' + new Date().toISOString().slice(0, 10) + '.wafr-backup', true))}>تنزيل نسخة بيانات شركتي</button>
      <button disabled={!!action} className="border rounded-xl px-4 py-3 disabled:opacity-50" onClick={() => void run('status', async () => { setStatus(await json('status')); })}>تحديث حالة النسخ</button>
    </div>
    {status?.lastExport && <p className="text-xs">آخر إنشاء نسخة للشركة: {dateTime(status.lastExport.createdAt)} · {(status.lastExport.bytes / 1024 / 1024).toFixed(2)} MB</p>}
    {status?.lastRestore && <div className="text-xs space-y-2"><p>آخر استرجاع: {dateTime(status.lastRestore.at)}</p><button disabled={!!action} className="border rounded-xl px-4 py-3" onClick={() => void run('rollback', () => download('rollback/' + status.lastRestore.rollback.id, 'wafr-company-before-restore.wafr-backup'))}>تنزيل نسخة ما قبل آخر استرجاع</button></div>}
    {!restored && <details className="border rounded-xl p-3"><summary className="cursor-pointer py-2 font-semibold">استرجاع نسخة سابقة للشركة</summary><div className="space-y-3 pt-3">
      <p className="text-sm text-rose-700">الاسترجاع يستبدل بيانات شركتك الحالية ببيانات النسخة، ولا يدمجها. تُحفظ نسخة رجوع تلقائيًا قبل التنفيذ، وتتوقف العملية إن تعذر حفظها. روابط توقيع المستندات القديمة تُلغى ويمكن إصدار روابط جديدة.</p>
      <label className="block text-sm">ملف نسخة الشركة<input aria-label="ملف نسخة الشركة" type="file" accept=".wafr-backup" disabled={!!action} className="block w-full border rounded-xl p-3 mt-2" onChange={event => { const selected = event.target.files?.[0]; setFile(''); setFileName(''); setPreview(null); setConfirmation(''); if (!selected) return; if (selected.size > 50 * 1024 * 1024) { setMessage('الحد الأقصى لملف النسخة 50 MB'); return; } void run('read', async () => { setFile(await selected.text()); setFileName(selected.name); }); }} /></label>
      {fileName && <p className="text-xs break-all">الملف المختار: {fileName}</p>}
      <button disabled={!!action || !file} className="border rounded-xl px-4 py-3 disabled:opacity-50" onClick={() => void run('preview', async () => { setPreview(await json('preview', { file })); setConfirmation(''); })}>فحص النسخة ومعاينة المحتوى</button>
      {preview && <div className="space-y-3"><p className="text-sm">الشركة: {preview.companyName} · تاريخ النسخة: {dateTime(preview.createdAt)}</p><div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead><tr><th className="p-2">البيانات</th><th>الحالية</th><th>داخل النسخة</th></tr></thead><tbody>{Object.entries(labels).map(([key, label]) => <tr key={key} className="border-t"><td className="p-2">{label}</td><td>{preview.current[key]}</td><td>{preview.incoming[key]}</td></tr>)}</tbody></table></div>
        <label className="block text-sm">للتأكيد اكتب «استرجاع»<input aria-label="تأكيد استرجاع الشركة" className="block border rounded-xl p-3 mt-2 w-full" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={!!action} autoComplete="off" /></label>
        <button disabled={!!action || confirmation !== 'استرجاع'} className="bg-rose-700 text-white rounded-xl px-4 py-3 disabled:opacity-50" onClick={() => void run('restore', async () => { const result = await json('restore', { file, token: preview.token, confirm: confirmation }); setRestored(true); setPreview(null); setFile(''); setConfirmation(''); setStatus((current: any) => ({ ...current, lastRestore: { at: new Date().toISOString(), rollback: result.rollback } })); setMessage(result.message); void json('status').then(setStatus).catch(() => {}); })}>استبدال بيانات شركتي بهذه النسخة</button>
      </div>}
    </div></details>}
    {restored && <button className="bg-teal-700 text-white rounded-xl px-4 py-3" onClick={() => window.location.reload()}>إعادة تحميل البيانات المسترجعة</button>}
    {action && <p role="status" className="text-sm">جارٍ تنفيذ العملية… لا تغلق الصفحة حتى ظهور النتيجة.</p>}
    {message && <p role="status" className="text-sm whitespace-pre-wrap">{message}</p>}
  </section>;
}
