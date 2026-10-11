type Props = { name: string; status: { required: boolean; approvedCount: number; pendingCount: number } | null; error: string; supported: boolean; busy: boolean; message: string; onEnroll: () => void; onRefresh: () => void; onLogout: () => void };
export default function AttendancePasskeyGate({ name, status, error, supported, busy, message, onEnroll, onRefresh, onLogout }: Props) {
  const pending = !!status?.pendingCount;
  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
    <section className="w-full max-w-lg rounded-2xl bg-white border border-teal-100 p-6 space-y-4 shadow-sm">
      <p className="text-teal-700 font-semibold">وفر دوام — {name}</p>
      <h1 className="text-xl font-bold">{!status ? 'التحقق من إعدادات الأمان' : pending ? 'بانتظار اعتماد مفتاحك' : 'إنشاء Passkey مطلوب للمتابعة'}</h1>
      {!status ? <p>{error || 'جاري التحقق من سياسة الشركة…'}</p> : <>
        <p className="text-slate-700">فعّلت الإدارة تأكيد الهوية لحسابك. يلزم تسجيل مفتاح Passkey واعتماده قبل استخدام بوابة الموظف.</p>
        <ol className="list-decimal list-inside space-y-2 text-sm"><li>أنشئ المفتاح من نافذة جهازك.</li><li>اطلب من الإدارة اعتماده بعد التحقق من هويتك.</li><li>بعد الاعتماد، أكّد كل حضور وانصراف بالمفتاح.</li></ol>
        <p className="text-sm text-slate-600">لا نلتقط أو نرسل صورة وجه أو بصمة إصبع؛ جهازك يحدد طريقة التحقق.</p>
        {pending && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">تم تسجيل مفتاح غير معتمد. تواصل مع الإدارة؛ الصفحة تتحدث تلقائيًا أثناء فتحها.</p>}
        {!supported && <p className="text-red-700">هذا الجهاز أو المتصفح لا يدعم Passkey. افتح التطبيق على جهاز يدعمه أو تواصل مع الإدارة لتوفير بديل. لا يمكن تجاوز الخطوة من هنا.</p>}
        <button disabled={busy || !supported} onClick={onEnroll} className="w-full min-h-11 rounded-xl bg-teal-700 text-white px-4 py-3 disabled:opacity-50">{busy ? 'جاري إنشاء المفتاح…' : pending ? 'تسجيل مفتاح آخر عند الحاجة' : 'إنشاء Passkey الآن'}</button>
      </>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {status && error && <p role="alert">{error}</p>}
      <div className="flex gap-4 flex-wrap"><button disabled={busy} className="min-h-11 underline text-teal-800" onClick={onRefresh}>إعادة التحقق من الاعتماد</button><button disabled={busy} className="min-h-11 text-slate-600" onClick={onLogout}>تسجيل الخروج</button></div>
    </section>
  </main>;
}
