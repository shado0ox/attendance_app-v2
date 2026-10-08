import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Ban, Link2, Plus, Printer } from 'lucide-react';

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
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const point = position(event);
    const context = ref.current!.getContext('2d')!;
    context.lineTo(point.x, point.y);
    context.stroke();
    setEmpty(false);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current!.toDataURL('image/png'));
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
    employee_signed: 'موقّع من الموظف',
    pending_manager: 'بانتظار اعتماد المدير',
    approved: 'معتمد',
    rejected: 'مرفوض',
    cancelled: 'ملغي',
  })[status] || status;

const statusClass = (status: string) =>
  status === 'approved'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'rejected' || status === 'cancelled'
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
}: {
  employee: any;
  companyId: string;
  appSettings: any;
  departmentName: string;
}) {
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
      if (response.ok) setDocs(await response.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const update = (key: keyof FormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const create = async () => {
    if (!form.date || !form.reason || !signature || !form.employeeCommitment) {
      alert('أكمل التاريخ والسبب والتوقيع والإقرار قبل الإرسال.');
      return;
    }

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

  const share = async (id: number) => {
    setShareBusy(id);
    try {
      const response = await fetch('/api/electronic-documents/' + id + '/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر إنشاء الرابط');

      let copied = false;
      try {
        await navigator.clipboard?.writeText(result.url);
        copied = true;
      } catch {
        copied = false;
      }

      await load();
      if (copied) {
        alert('تم إنشاء رابط المدير ونسخه. الرابط صالح لمدة 72 ساعة ويُستخدم مرة واحدة.');
      } else {
        window.prompt('تم إنشاء الرابط. انسخه يدويًا:', result.url);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setShareBusy(null);
    }
  };

  const cancel = async (id: number) => {
    if (!confirm('هل تريد إلغاء هذا الطلب؟ لن يمكن استخدام رابط المدير بعد الإلغاء.')) return;

    setCancelBusy(id);
    try {
      const response = await fetch('/api/electronic-documents/' + id + '/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر إلغاء الطلب');
      await load();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setCancelBusy(null);
    }
  };

  const print = (doc: any) => {
    const windowRef = window.open('', '_blank', 'width=900,height=1000');
    if (!windowRef) return;
    windowRef.document.write(doc.finalHtml || '<p>لا توجد نسخة قابلة للطباعة.</p>');
    windowRef.document.close();
    windowRef.focus();
    setTimeout(() => windowRef.print(), 300);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-slate-800 text-sm">المستندات والطلبات الإلكترونية</h3>
          <p className="text-[10px] text-slate-400 mt-1">
            نموذج استئذان إلكتروني بتوقيع الموظف واعتماد المدير.
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
                {saving ? 'جاري الحفظ...' : 'توقيع وإرسال للمدير'}
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
                    {doc.formData?.date || doc.createdAt?.slice(0, 10)} · {requestTypeLabel(doc.formData?.requestType)}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={'px-2.5 py-1 rounded-full text-[9px] font-bold ' + statusClass(doc.status)}>
                    {statusLabel(doc.status)}
                  </span>

                  {doc.status === 'employee_signed' && (
                    <button
                      onClick={() => share(doc.id)}
                      disabled={shareBusy === doc.id}
                      className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-bold"
                    >
                      <Link2 size={12} className="inline ml-1" />
                      {shareBusy === doc.id ? '...' : 'إرسال للمدير'}
                    </button>
                  )}

                  {doc.status === 'pending_manager' && (
                    <button
                      onClick={() => share(doc.id)}
                      disabled={shareBusy === doc.id}
                      className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-bold"
                    >
                      <Link2 size={12} className="inline ml-1" />
                      {shareBusy === doc.id ? '...' : 'إعادة إصدار الرابط'}
                    </button>
                  )}

                  {(doc.status === 'employee_signed' || doc.status === 'pending_manager') && (
                    <button
                      onClick={() => void cancel(doc.id)}
                      disabled={cancelBusy === doc.id}
                      className="px-3 py-1.5 border border-rose-200 text-rose-600 rounded-lg text-[10px] font-bold"
                    >
                      <Ban size={12} className="inline ml-1" />
                      {cancelBusy === doc.id ? '...' : 'إلغاء'}
                    </button>
                  )}

                  {doc.status === 'approved' && (
                    <button
                      onClick={() => print(doc)}
                      className="px-3 py-1.5 border rounded-lg text-[10px] font-bold"
                    >
                      <Printer size={12} className="inline ml-1" /> طباعة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
