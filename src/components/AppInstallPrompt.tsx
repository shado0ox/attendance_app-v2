import { useEffect, useRef, useState } from 'react';
import { Download, Smartphone, Share, EllipsisVertical, PlusSquare, X, ExternalLink } from 'lucide-react';
import { storeForPlatform } from '../lib/appInstallation';
import type { useAppInstallation } from '../hooks/useAppInstallation';
export default function AppInstallPrompt({ installation, employee = false }: { installation: ReturnType<typeof useAppInstallation>; employee?: boolean }) {
  const [showTop, setShowTop] = useState(true);
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'ios' | 'android'>(installation.platform === 'android' ? 'android' : 'ios');
  const dialog = useRef<HTMLDialogElement>(null);
  const storeUrl = storeForPlatform(installation.links, installation.platform), selectedStore = storeForPlatform(installation.links, tab);
  useEffect(() => { if (installation.installed) setOpen(false); }, [installation.installed]);
  useEffect(() => { if (open) { if (!dialog.current?.open) dialog.current?.showModal(); } else if (dialog.current?.open) dialog.current.close(); }, [open]);
  if (installation.installed) return null;
  const action = () => { if (storeUrl) window.location.assign(storeUrl); else { setTab(installation.platform === 'android' ? 'android' : 'ios'); setOpen(true); } };
  const steps = tab === 'ios' ? [
    { title: 'افتح الموقع في Safari', detail: 'افتح رابط وفر دوام في متصفح سفاري.', Icon: Smartphone },
    { title: 'اضغط مشاركة', detail: 'زر المشاركة، أو قائمة الصفحة ثم «مشاركة».', Icon: Share },
    { title: 'أضف إلى الشاشة الرئيسية', detail: 'اختر «إضافة إلى الشاشة الرئيسية»، وفعّل «فتح كتطبيق ويب» إن ظهر، ثم «إضافة».', Icon: PlusSquare },
  ] : [
    { title: 'افتح الموقع في Chrome', detail: 'افتح رابط وفر دوام في متصفح كروم.', Icon: Smartphone },
    { title: 'افتح القائمة ⋮', detail: 'القائمة بجانب شريط العنوان.', Icon: EllipsisVertical },
    { title: 'اختر تثبيت التطبيق', detail: '«التثبيت وإنشاء اختصار» ثم «تثبيت»، أو «إضافة إلى الشاشة الرئيسية» حسب المتصفح.', Icon: Download },
  ];
  return <>
    {showTop && <aside className="app-install-top flex w-full items-center justify-between gap-3 border-b px-3 py-2 sm:px-5" dir="rtl" aria-label="تنزيل تطبيق وفر دوام">
      <div className="flex items-center gap-2 min-w-0"><button aria-label="إخفاء رسالة تنزيل التطبيق" onClick={() => setShowTop(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"><X size={18} /></button><img src="/icons/icon-192.png" alt="" width="38" height="38" className="shrink-0 rounded-xl" /><div className="min-w-0"><p className="text-sm font-bold text-stone-900">وفر دوام</p><p className="text-xs text-stone-600">احصل على التطبيق على هاتفك</p></div></div>
      <button aria-label="تنزيل التطبيق" onClick={action} className="flex min-h-11 min-w-16 shrink-0 items-center justify-center rounded-full bg-teal-700 px-5 py-3 text-sm font-bold text-white" dir="ltr">Get</button>
    </aside>}

    <button aria-label="تنزيل التطبيق — الزر الثابت" onClick={action} className="app-install-fab fixed right-4 z-40 flex min-h-11 items-center gap-2 rounded-full border border-white/70 bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-lg" style={{ bottom: employee ? 'calc(108px + env(safe-area-inset-bottom))' : 'calc(20px + env(safe-area-inset-bottom))' }}><Download size={18} /><span dir="ltr">Get</span></button>
    <dialog ref={dialog} aria-labelledby="install-guide-title" className="app-install-dialog w-[calc(100%_-_24px)] max-w-lg rounded-3xl border-0 p-0 shadow-2xl" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} dir="rtl">
      <div className="max-h-[85dvh] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 id="install-guide-title" className="text-lg font-bold text-slate-900">تنزيل وفر دوام</h2><p className="mt-1 text-xs text-slate-500">اختر جهازك واتبع الخطوات المصورة.</p></div><button aria-label="إغلاق شرح التنزيل" onClick={() => dialog.current?.close()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"><X size={20} /></button></div>
        <div className="my-4 grid grid-cols-2 gap-2" role="group" aria-label="نوع الجهاز"><button aria-pressed={tab === 'ios'} className={`rounded-xl border px-3 py-3 font-semibold ${tab === 'ios' ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200'}`} onClick={() => setTab('ios')}>iPhone / iPad</button><button aria-pressed={tab === 'android'} className={`rounded-xl border px-3 py-3 font-semibold ${tab === 'android' ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-slate-200'}`} onClick={() => setTab('android')}>Android</button></div>
        {selectedStore && <a href={selectedStore} className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white"><ExternalLink size={18} />{tab === 'ios' ? 'تنزيل من App Store' : 'تنزيل من Google Play'}</a>}
        {tab === 'android' && installation.platform === 'android' && installation.canPrompt && !selectedStore && <button disabled={installation.busy} onClick={() => void installation.install()} className="mb-4 w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-50">تثبيت الآن من المتصفح</button>}
        <ol className="space-y-3">{steps.map((step, index) => <li key={tab + index} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"><img src={`/install-guide/${tab}-${index + 1}.svg`} alt={`رسم توضيحي: ${step.title}`} width="88" height="102" className="h-[102px] w-[88px] shrink-0 rounded-xl bg-slate-50" /><div className="min-w-0"><span className="mb-1 inline-flex items-center gap-2 text-xs font-bold text-teal-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100">{index + 1}</span><step.Icon size={16} /></span><h3 className="text-sm font-bold text-slate-900">{step.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-600">{step.detail}</p></div></li>)}</ol>
        <p className="mt-3 text-xs text-slate-500">الصور توضيحية؛ قد تختلف أسماء الخيارات قليلًا حسب إصدار المتصفح.</p>
        <p className="mt-3 rounded-xl bg-teal-50 p-3 text-xs leading-relaxed text-teal-900">بعد الإضافة افتح وفر دوام من الأيقونة. اسمح بالموقع عند تسجيل البصمة، وفعّل الإشعارات من إعداداتك داخل التطبيق.</p>
        {installation.message && <p role="status" className="mt-3 text-sm">{installation.message}</p>}
      </div>
    </dialog>
  </>;
}
