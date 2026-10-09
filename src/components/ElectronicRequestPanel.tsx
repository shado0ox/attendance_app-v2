import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Plus, RefreshCw, Link2 } from 'lucide-react';

type FormState = {
  date: string;
  requestType: string;
  absenceType: string;
  expectedReturnTime: string;
  exitTime: string;
  actualAttendanceTime: string;
  absenceFrom: string;
  absenceTo: string;
  reason: string;
  employeeCommitment: boolean;
};

const getRiyadhDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const initialForm = (): FormState => ({
  date: getRiyadhDate(),
  requestType: 'temporary_exit',
  absenceType: 'annual',
  expectedReturnTime: '',
  exitTime: '',
  actualAttendanceTime: '',
  absenceFrom: '',
  absenceTo: '',
  reason: '',
  employeeCommitment: false,
});

function SignaturePad({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const moved = useRef(false);
  const [empty, setEmpty] = useState(!value);

  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!;
    canvas.setPointerCapture(event.pointerId);
    const point = position(event);
    const context = canvas.getContext('2d')!;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    drawing.current = true;
    moved.current = false;
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const point = position(event);
    const context = ref.current!.getContext('2d')!;
    context.lineTo(point.x, point.y);
    context.stroke();
    moved.current = true;
    setEmpty(false);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (moved.current) onChange(ref.current!.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = ref.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange('');
  };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-bold">{label}</label>
        <button type="button" onClick={clear} className="text-[10px] text-rose-600">
          مسح
        </button>
      </div>
      <canvas
        ref={ref}
        width={640}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="w-full h-28 bg-white border-2 border-dashed border-slate-200 rounded-xl touch-none"
      />
      {empty && <div className="text-[9px] text-slate-400 mt-1">وقّع داخل المربع</div>}
    </div>
  );
}

const statusLabel = (status: string) =>
  ({
    employee_signed: 'اعتمده الموظف — جاهز لمشاركة رابط المدير',
    manager_ready: 'جاهز لمشاركة رابط المدير',
    admin_rejected: 'مرفوض من الإدارة',
    pending_manager: 'بانتظار اعتماد المدير',
    approved: 'معتمد',
    rejected: 'مرفوض',
    cancelled: 'ملغي',
  })[status] || status;

const statusClass = (status: string) =>
  status === 'approved'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'rejected' || status === 'admin_rejected' || status === 'cancelled'
      ? 'bg-rose-50 text-rose-700'
      : status === 'pending_manager'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-sky-50 text-sky-700';

const requestTypeLabel = (requestType: string) =>
  ({
    temporary_exit: 'استئذان (خروج مؤقت)',
    early_exit: 'خروج مبكر',
    late_arrival: 'تأخير عن الدوام',
    absence: 'غياب عن الدوام',
  })[requestType] || requestType;

export default function ElectronicRequestPanel({
  companyId,
  appSettings,
  active = true,
}: {
  active?: boolean;
  employee: any;
  companyId: string;
  appSettings: any;
  departmentName: string;
}) {
  const [link,setLink]=useState<{id:number;url:string;expiresAt:string}|null>(null);
  const [loadError,setLoadError]=useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareBusy, setShareBusy] = useState<number | null>(null);
  const [cancelBusy, setCancelBusy] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        '/api/electronic-documents?companyId=' + encodeURIComponent(companyId),
      );
      if(!response.ok) throw new Error('تعذر تحديث حالة الطلبات');
      const rows=await response.json();setDocs(rows);setLoadError('');
      setLink(current=>current&&rows.some((doc:any)=>doc.id===current.id&&['employee_signed','manager_ready','pending_manager'].includes(doc.status))?current:null);
    } catch(error:any){setLoadError(error.message||'تعذر الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if(!active)return;
    const timer=setInterval(()=>{if(!document.hidden)void load();},60000);
    const visible=()=>{if(!document.hidden)void load();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  }, [companyId,active]);

  const update = (key: keyof FormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const create = async () => {
    if (!form.date || !form.reason || !signature || !form.employeeCommitment) {
      alert('أكمل التاريخ والسبب والتوقيع والإقرار قبل الإرسال.');
      return;
    }

    if(!confirm('بعد اعتماد الطلب لن تستطيع تعديل النموذج أو فتحه مرة أخرى. هل تريد الاعتماد وإرسال رابط المدير للتوقيع؟'))return;
    setSaving(true);
    try {
      const response = await fetch('/api/electronic-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          formData: form,
          employeeSignature: signature,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر إنشاء الطلب');

      setLink({id:result.id,url:result.url,expiresAt:result.expiresAt});
      setOpen(false);
      setForm(initialForm());
      setSignature('');
      await load();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const share = async(id:number)=>{
    setShareBusy(id);
    try {
      const response=await fetch('/api/electronic-documents/'+id+'/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'تعذر إنشاء الرابط');
      setLink({...result,id});await load();
    } catch(error:any){alert(error.message);}finally{setShareBusy(null);}
  };

  return (
    <div className="flex flex-col gap-5">
      {loadError&&<p role="alert" className="text-xs text-rose-600">{loadError}</p>}
      <button disabled={loading} onClick={()=>void load()} className="self-start border rounded-lg px-3 py-2 text-xs flex items-center gap-2"><RefreshCw size={14}/> تحديث حالة الطلبات</button>
      {link&&<div className="border rounded-xl bg-sky-50 p-4 text-xs space-y-3"><b>رابط المدير للتوقيع</b><input readOnly value={link.url} dir="ltr" className="w-full border rounded-lg p-2" onFocus={event=>event.target.select()}/><p>صالح حتى {new Date(link.expiresAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn')}</p><div className="flex gap-2 flex-wrap"><button onClick={async()=>{try{if(navigator.share)await navigator.share({title:'طلب استئذان للتوقيع',text:'يرجى مراجعة طلب الاستئذان والتوقيع',url:link.url});else if(navigator.clipboard){await navigator.clipboard.writeText(link.url);alert('تم نسخ الرابط؛ أرسله عبر البرنامج المطلوب');}}catch(error:any){if(error.name!=='AbortError')alert('تعذرت المشاركة؛ انسخ الرابط أو استخدم واتساب');}}} className="bg-sky-600 text-white rounded-lg p-2">مشاركة عبر تطبيقات الهاتف</button><button onClick={()=>{void navigator.clipboard?.writeText(link.url).then(()=>alert('تم نسخ الرابط')).catch(()=>alert('حدد الرابط وانسخه يدويًا'));}} className="border rounded-lg p-2">نسخ الرابط</button><a target="_blank" rel="noopener noreferrer" href={'https://wa.me/?text='+encodeURIComponent('يرجى مراجعة طلب الاستئذان والتوقيع: '+link.url)} className="bg-emerald-600 text-white rounded-lg p-2">إرسال عبر واتساب</a><button onClick={()=>setLink(null)} className="border rounded-lg p-2">إغلاق</button></div></div>}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-slate-800 text-sm">المستندات والطلبات الإلكترونية</h3>
          <p className="text-[10px] text-slate-400 mt-1">
            بعد توقيعك واعتماد الطلب يتاح رابط مشاركته مع المدير مباشرة، وتتابع الإدارة جميع المراحل. الاعتماد يحفظ المستند ولا يغيّر حساب الحضور أو الخصومات تلقائيًا.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold shadow"
        >
          <Plus size={14} /> نموذج استئذان
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-3xl max-h-[94svh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-5" dir="rtl">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h3 className="font-black text-base">نموذج استئذان إلكتروني</h3>
                <p className="text-[10px] text-slate-400">{appSettings?.companyName || 'الشركة'}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400">
                ✕
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <label>
                التاريخ
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => update('date', event.target.value)}
                  className="mt-1 w-full border rounded-lg p-2"
                />
              </label>

              <label>
                نوع الطلب
                <select
                  value={form.requestType}
                  onChange={(event) => update('requestType', event.target.value)}
                  className="mt-1 w-full border rounded-lg p-2"
                >
                  <option value="temporary_exit">استئذان (خروج مؤقت)</option>
                  <option value="early_exit">خروج مبكر</option>
                  <option value="late_arrival">تأخير عن الدوام</option>
                  <option value="absence">غياب عن الدوام</option>
                </select>
              </label>

              {form.requestType === 'absence' && (
                <label>
                  نوع الغياب
                  <select
                    value={form.absenceType}
                    onChange={(event) => update('absenceType', event.target.value)}
                    className="mt-1 w-full border rounded-lg p-2"
                  >
                    <option value="annual">إجازة سنوية</option>
                    <option value="sick">مرضية</option>
                    <option value="other">أخرى</option>
                  </select>
                </label>
              )}

              {(form.requestType === 'temporary_exit' || form.requestType === 'early_exit') && (
                <>
                  <label>
                    وقت الخروج
                    <input
                      type="time"
                      value={form.exitTime}
                      onChange={(event) => update('exitTime', event.target.value)}
                      className="mt-1 w-full border rounded-lg p-2"
                    />
                  </label>
                  <label>
                    وقت العودة المتوقع
                    <input
                      type="time"
                      value={form.expectedReturnTime}
                      onChange={(event) => update('expectedReturnTime', event.target.value)}
                      className="mt-1 w-full border rounded-lg p-2"
                    />
                  </label>
                </>
              )}

              {form.requestType === 'late_arrival' && (
                <label>
                  وقت الحضور الفعلي
                  <input
                    type="time"
                    value={form.actualAttendanceTime}
                    onChange={(event) => update('actualAttendanceTime', event.target.value)}
                    className="mt-1 w-full border rounded-lg p-2"
                  />
                </label>
              )}

              {form.requestType === 'absence' && (
                <>
                  <label>
                    من
                    <input
                      type="date"
                      value={form.absenceFrom}
                      onChange={(event) => update('absenceFrom', event.target.value)}
                      className="mt-1 w-full border rounded-lg p-2"
                    />
                  </label>
                  <label>
                    إلى
                    <input
                      type="date"
                      value={form.absenceTo}
                      onChange={(event) => update('absenceTo', event.target.value)}
                      className="mt-1 w-full border rounded-lg p-2"
                    />
                  </label>
                </>
              )}

              <label className="sm:col-span-2">
                سبب الطلب
                <textarea
                  value={form.reason}
                  onChange={(event) => update('reason', event.target.value)}
                  rows={3}
                  className="mt-1 w-full border rounded-lg p-2"
                />
              </label>

              <div className="sm:col-span-2">
                <SignaturePad
                  value={signature}
                  onChange={setSignature}
                  label="توقيع الموظف الإلكتروني"
                />
              </div>

              <label className="sm:col-span-2 flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                <input
                  type="checkbox"
                  checked={form.employeeCommitment}
                  onChange={(event) => update('employeeCommitment', event.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[10px] leading-5">
                  أقر بصحة البيانات وألتزم بما يترتب على هذا الطلب، وأوافق على استخدام التوقيع الإلكتروني لإثبات تقديم الطلب.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5 border-t pt-4">
              <button onClick={() => setOpen(false)} className="px-4 py-2 border rounded-lg text-xs">
                إلغاء
              </button>
              <button
                disabled={saving}
                onClick={create}
                className="px-5 py-2 bg-sky-600 text-white rounded-lg text-xs font-bold"
              >
                {saving ? 'جاري الاعتماد...' : 'اعتماد الطلب'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-sky-100 rounded-2xl shadow-sm p-4">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">جاري تحميل المستندات...</div>
        ) : docs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">لا توجد مستندات إلكترونية بعد.</div>
        ) : (
          <div className="flex flex-col divide-y">
            {docs.map((doc) => (
              <div key={doc.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-extrabold text-xs text-slate-800">نموذج استئذان — #{doc.id}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {doc.date || doc.formData?.date || doc.createdAt?.slice(0, 10)} · {requestTypeLabel(doc.requestType||doc.formData?.requestType)}
                  </div>
                  {doc.status === 'approved' && doc.managerName && (
                    <div className="text-[10px] text-emerald-700 mt-1">اعتمد بواسطة: {doc.managerName}</div>
                  )}
                  {(doc.status === 'rejected'||doc.status === 'admin_rejected') && (
                    <div className="text-[10px] text-rose-700 mt-1">
                      {doc.managerName ? 'المدير: ' + doc.managerName + ' · ' : ''}
                      سبب الرفض: {doc.reviewReason || 'لم يتم تسجيل سبب.'}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={'px-2.5 py-1 rounded-full text-[9px] font-bold ' + statusClass(doc.status)}>
                    {statusLabel(doc.status)}
                  </span>

                  {(doc.status==='employee_signed'||doc.status==='manager_ready'||doc.status==='pending_manager')&&<button disabled={shareBusy===doc.id} onClick={()=>void share(doc.id)} className="px-3 py-1.5 border border-sky-200 text-sky-700 rounded-lg text-[10px] font-bold"><Link2 size={12} className="inline ml-1"/>{shareBusy===doc.id?'جاري التحميل…':'رابط المدير / مشاركة'}</button>}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
