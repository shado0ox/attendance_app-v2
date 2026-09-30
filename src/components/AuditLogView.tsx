import { useState } from 'react';
export default function AuditLogView({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const labels: Record<string, string> = { 'punch.checkIn':'حضور', 'punch.checkOut':'انصراف', 'punch.checkIn2':'حضور الفترة الثانية', 'punch.checkOut2':'انصراف الفترة الثانية', 'attendance.correct':'تصحيح إداري', 'attendance.create':'إضافة إدارية', 'attendance.delete':'حذف سجل' };
  return <section className="p-6 bg-white border rounded-2xl flex flex-col gap-3">
    <div className="flex justify-between"><h3 className="font-bold">سجل البصمات والتعديلات</h3><button disabled={loading} className="text-sky-700 underline" onClick={async () => {
      setLoading(true); setMessage('');
      try { const response = await fetch(`/api/audit-log?companyId=${encodeURIComponent(companyId)}`); if (!response.ok) throw new Error('تعذر تحميل السجل'); setRows(await response.json()); }
      catch (error: any) { setMessage(error.message); } finally { setLoading(false); }
    }}>{loading ? 'جاري التحميل...' : 'تحميل آخر 200 عملية'}</button></div>
    <p className="text-xs text-slate-500">يبدأ التسجيل بعد التحديث. السجل يحتفظ بالبصمة الأصلية وبالبيانات قبل وبعد التصحيح أو الحذف.</p>
    {message && <p role="status">{message}</p>}
    <div className="overflow-auto max-h-96"><table className="w-full text-xs text-right"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>السجل</th><th>التفاصيل</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b"><td className="p-2">{new Date(row.createdAt).toLocaleString('ar-SA', { timeZone:'Asia/Riyadh' })}</td><td>{row.actorId} ({row.actorRole})</td><td>{labels[row.action] || row.action}</td><td>{row.entityId}</td><td><details><summary>عرض</summary><pre className="whitespace-pre-wrap" dir="ltr">{JSON.stringify(row.details, null, 2)}</pre></details></td></tr>)}</tbody>
    </table></div>
  </section>;
}
