import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link2, Plus, Printer } from 'lucide-react';

type FormState = {
  date:string; requestType:string; absenceType:string; expectedReturnTime:string; exitTime:string;
  actualAttendanceTime:string; absenceFrom:string; absenceTo:string; reason:string; employeeCommitment:boolean;
};
const initialForm:FormState={date:new Date().toISOString().slice(0,10),requestType:'temporary_exit',absenceType:'annual',expectedReturnTime:'',exitTime:'',actualAttendanceTime:'',absenceFrom:'',absenceTo:'',reason:'',employeeCommitment:false};

function SignaturePad({value,onChange,label}:{value:string;onChange:(v:string)=>void;label:string}) {
  const ref=useRef<HTMLCanvasElement|null>(null); const drawing=useRef(false);
  const [empty,setEmpty]=useState(!value);
  const position=(e:PointerEvent<HTMLCanvasElement>)=>{const c=ref.current!;const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};};
  const start=(e:PointerEvent<HTMLCanvasElement>)=>{const c=ref.current!;c.setPointerCapture(e.pointerId);const p=position(e);const ctx=c.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=2.5;ctx.lineCap='round';drawing.current=true;};
  const move=(e:PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const p=position(e);const ctx=ref.current!.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();setEmpty(false);};
  const end=()=>{if(!drawing.current)return;drawing.current=false;onChange(ref.current!.toDataURL('image/png'));};
  const clear=()=>{const c=ref.current!;c.getContext('2d')!.clearRect(0,0,c.width,c.height);setEmpty(true);onChange('');};
  useEffect(()=>{const c=ref.current;if(!c)return;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);if(value){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,c.width,c.height);img.src=value;}},[value]);
  return <div><div className="flex items-center justify-between mb-1"><label className="text-[11px] font-bold">{label}</label><button type="button" onClick={clear} className="text-[10px] text-rose-600">مسح</button></div><canvas ref={ref} width={640} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="w-full h-28 bg-white border-2 border-dashed border-slate-200 rounded-xl touch-none"/>{empty&&<div className="text-[9px] text-slate-400 mt-1">وقّع داخل المربع</div>}</div>;
}

const statusLabel=(s:string)=>({employee_signed:'موقّع من الموظف',pending_manager:'بانتظار اعتماد المدير',approved:'معتمد',rejected:'مرفوض',cancelled:'ملغي'} as Record<string,string>)[s] || s;
const statusClass=(s:string)=>s==='approved'?'bg-emerald-50 text-emerald-700':s==='rejected'||s==='cancelled'?'bg-rose-50 text-rose-700':s==='pending_manager'?'bg-amber-50 text-amber-700':'bg-sky-50 text-sky-700';

export default function ElectronicRequestPanel({companyId,appSettings}:{employee:any;companyId:string;appSettings:any;departmentName:string}) {
  const [docs,setDocs]=useState<any[]>([]),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[form,setForm]=useState({...initialForm}),[signature,setSignature]=useState(''),[saving,setSaving]=useState(false),[shareBusy,setShareBusy]=useState<number|null>(null);
  const load=async()=>{setLoading(true);try{const r=await fetch('/api/electronic-documents?companyId='+encodeURIComponent(companyId));if(r.ok)setDocs(await r.json());}finally{setLoading(false);}};
  useEffect(()=>{void load();},[companyId]);
  const update=(key:keyof FormState,value:string|boolean)=>setForm(v=>({...v,[key]:value}));
  const create=async()=>{if(!form.date||!form.reason||!signature||!form.employeeCommitment){alert('أكمل التاريخ والسبب والتوقيع والإقرار قبل الإرسال.');return;}setSaving(true);try{const r=await fetch('/api/electronic-documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,formData:form,employeeSignature:signature})});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر إنشاء الطلب');setOpen(false);setForm({...initialForm});setSignature('');await load();}catch(e:any){alert(e.message)}finally{setSaving(false)}};
  const share=async(id:number)=>{setShareBusy(id);try{const r=await fetch('/api/electronic-documents/'+id+'/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId})});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر إنشاء الرابط');await navigator.clipboard?.writeText(j.url);alert('تم إنشاء رابط المدير ونسخه. الرابط صالح لمدة 72 ساعة ويُستخدم مرة واحدة.');await load();}catch(e:any){alert(e.message)}finally{setShareBusy(null)}};
  const print=(doc:any)=>{const w=window.open('','_blank','width=900,height=1000');if(!w)return;w.document.write(doc.finalHtml||'<p>لا توجد نسخة قابلة للطباعة.</p>');w.document.close();w.focus();setTimeout(()=>w.print(),300);};
  return <div className="flex flex-col gap-5">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold text-slate-800 text-sm">المستندات والطلبات الإلكترونية</h3><p className="text-[10px] text-slate-400 mt-1">نموذج استئذان إلكتروني بتوقيع الموظف واعتماد المدير.</p></div><button onClick={()=>setOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold shadow"><Plus size={14}/> نموذج استئذان</button></div>
    {open&&<div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3"><div className="w-full max-w-3xl max-h-[94svh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-5" dir="rtl">
      <div className="flex justify-between items-center border-b pb-3 mb-4"><div><h3 className="font-black text-base">نموذج استئذان إلكتروني</h3><p className="text-[10px] text-slate-400">{appSettings?.companyName||'الشركة'}</p></div><button onClick={()=>setOpen(false)} className="text-slate-400">✕</button></div>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <label>التاريخ<input type="date" value={form.date} onChange={e=>update('date',e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label>
        <label>نوع الطلب<select value={form.requestType} onChange={e=>update('requestType',e.target.value)} className="mt-1 w-full border rounded-lg p-2"><option value="temporary_exit">استئذان (خروج مؤقت)</option><option value="early_exit">خروج مبكر</option><option value="late_arrival">تأخير عن الدوام</option><option value="absence">غياب عن الدوام</option></select></label>
        {form.requestType==='absence'&&<label>نوع الغياب<select value={form.absenceType} onChange={e=>update('absenceType',e.target.value)} className="mt-1 w-full border rounded-lg p-2"><option value="annual">إجازة سنوية</option><option value="sick">مرضية</option><option value="other">أخرى</option></select></label>}
        {(form.requestType==='temporary_exit'||form.requestType==='early_exit')&&<><label>وقت الخروج<input type="time" value={form.exitTime} onChange={e=>update('exitTime',e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label><label>وقت العودة المتوقع<input type="time" value={form.expectedReturnTime} onChange={e=>update('expectedReturnTime',e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label></>}
        {form.requestType==='late_arrival'&&<label>وقت الحضور الفعلي<input type="time" value={form.actualAttendanceTime} onChange={e=>update('actualAttendanceTime',e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label>}
        {form.requestType==='absence'&&<><label>من<input type="date" value={form.absenceFrom} onChange={e=>update('absenceFrom',e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label><label>إلى<input type="date" value={form.absenceTo} onChange={e=>update('absenceTo',e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label></>}
        <label className="sm:col-span-2">سبب الطلب<textarea value={form.reason} onChange={e=>update('reason',e.target.value)} rows={3} className="mt-1 w-full border rounded-lg p-2"/></label>
        <div className="sm:col-span-2"><SignaturePad value={signature} onChange={setSignature} label="توقيع الموظف الإلكتروني"/></div>
        <label className="sm:col-span-2 flex items-start gap-2 p-3 bg-slate-50 rounded-xl"><input type="checkbox" checked={form.employeeCommitment} onChange={e=>update('employeeCommitment',e.target.checked)} className="mt-0.5"/><span className="text-[10px] leading-5">أقر بصحة البيانات وألتزم بما يترتب على هذا الطلب، وأوافق على استخدام التوقيع الإلكتروني لإثبات تقديم الطلب.</span></label>
      </div>
      <div className="flex justify-end gap-2 mt-5 border-t pt-4"><button onClick={()=>setOpen(false)} className="px-4 py-2 border rounded-lg text-xs">إلغاء</button><button disabled={saving} onClick={create} className="px-5 py-2 bg-sky-600 text-white rounded-lg text-xs font-bold">{saving?'جاري الحفظ...':'توقيع وإرسال للمدير'}</button></div>
    </div></div>}
    <div className="bg-white border border-sky-100 rounded-2xl shadow-sm p-4">
      {loading?<div className="py-8 text-center text-xs text-slate-400">جاري تحميل المستندات...</div>:docs.length===0?<div className="py-8 text-center text-xs text-slate-400">لا توجد مستندات إلكترونية بعد.</div>:<div className="flex flex-col divide-y">{docs.map(d=><div key={d.id} className="py-4 flex flex-wrap items-center justify-between gap-3"><div><div className="font-extrabold text-xs text-slate-800">نموذج استئذان — #{d.id}</div><div className="text-[10px] text-slate-400 mt-1">{d.formData?.date||d.createdAt?.slice(0,10)} · {d.formData?.requestType==='temporary_exit'?'استئذان (خروج مؤقت)':d.formData?.requestType==='early_exit'?'خروج مبكر':d.formData?.requestType==='late_arrival'?'تأخير عن الدوام':'غياب عن الدوام'}</div></div><div className="flex items-center gap-2 flex-wrap"><span className={'px-2.5 py-1 rounded-full text-[9px] font-bold '+statusClass(d.status)}>{statusLabel(d.status)}</span>{d.status==='employee_signed'&&<button onClick={()=>share(d.id)} disabled={shareBusy===d.id} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-bold"><Link2 size={12} className="inline ml-1"/>{shareBusy===d.id?'...':'إرسال للمدير'}</button>}{d.status==='approved'&&<button onClick={()=>print(d)} className="px-3 py-1.5 border rounded-lg text-[10px] font-bold"><Printer size={12} className="inline ml-1"/>طباعة</button>}</div></div>)}</div>}
    </div>
  </div>;
}
