import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
export default function EmployeeSelfProfile({employee,departmentName,companyId,onSaved}:{employee:any;departmentName:string;companyId:string;onSaved:()=>Promise<boolean>}) {
  const [form,setForm]=useState({displayName:employee.displayName || '',phone:employee.phone || '',email:employee.email || '',photoDataUrl:employee.photoDataUrl || ''});
  const [baseline,setBaseline]=useState(form);
  useEffect(()=>{if(JSON.stringify(form)!==JSON.stringify(baseline))return;const next={displayName:employee.displayName || '',phone:employee.phone || '',email:employee.email || '',photoDataUrl:employee.photoDataUrl || ''};setForm(next);setBaseline(next);},[employee.displayName,employee.phone,employee.email,employee.photoDataUrl]);
  const [busy,setBusy]=useState(false),[processing,setProcessing]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const selectPhoto=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){setError('اختر صورة JPEG أو PNG أو WebP بحجم أقل من 8 ميجابايت');return;}
    setProcessing(true);setError('');const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;await img.decode();if(img.width*img.height>25000000)throw new Error('أبعاد الصورة كبيرة جدًا؛ استخدم صورة أصغر');
      const side=Math.min(img.width,img.height),canvas=document.createElement('canvas');canvas.width=canvas.height=384;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('تعذر تجهيز الصورة');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,384,384);ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,384,384);
      const photoDataUrl=canvas.toDataURL('image/jpeg',0.82);setForm(old=>({...old,photoDataUrl}));setMessage('تم تجهيز الصورة وحذف بيانات الملف الأصلية؛ اضغط حفظ');
    }catch(e:any){setError(e.message || 'تعذر قراءة الصورة');}finally{URL.revokeObjectURL(url);setProcessing(false);}
  };
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(busy||processing)return;setBusy(true);setError('');setMessage('');
    try{
      const payload:any=Object.fromEntries(Object.entries(form).filter(([key,value])=>value!==baseline[key as keyof typeof baseline]));
      if(!Object.keys(payload).length){setMessage('لا توجد تغييرات جديدة');return;}
      const response=await fetch('/api/employee-profile?companyId='+encodeURIComponent(companyId),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error || 'تعذر الحفظ');
      const next={displayName:data.displayName,phone:data.phone,email:data.email,photoDataUrl:data.photoDataUrl};setForm(next);setBaseline(next);setMessage('تم حفظ ملفك الشخصي');await onSaved();
    }catch(e:any){setError(e.message || 'تعذر الاتصال بالخادم');}finally{setBusy(false);}
  };
  return <form onSubmit={save} className="wafr-self-profile bg-white p-5 rounded-2xl border flex flex-col gap-5" dir="rtl">
    <h2 className="text-lg font-bold">ملفي الشخصي</h2>
    <div className="flex flex-wrap items-center gap-4"><div className="w-24 h-24 rounded-full border bg-sky-50 overflow-hidden flex items-center justify-center text-3xl text-sky-700">{form.photoDataUrl?<img src={form.photoDataUrl} alt="صورتك الشخصية" className="w-full h-full object-cover" />:employee.name?.charAt(0)}</div><div><label className="block cursor-pointer rounded-lg bg-sky-100 text-sky-800 p-3 text-sm">{processing?'جاري تجهيز الصورة…':'رفع صورة شخصية'}<input aria-label="اختيار صورة شخصية" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={busy||processing} className="sr-only" /></label>{form.photoDataUrl && <button type="button" disabled={busy||processing} onClick={()=>setForm({...form,photoDataUrl:''})} className="text-sm text-rose-700 mt-2">إزالة الصورة ثم حفظ</button>}</div></div>
    <p className="text-xs text-slate-500">صورتك خاصة بحسابك داخل شركتك. تُقص إلى مربع وتُضغط قبل رفعها؛ لا تُرسل الصورة الأصلية أو بياناتها الوصفية.</p>
    <dl className="grid sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl text-sm"><div><dt className="text-slate-500">الاسم الرسمي</dt><dd className="font-bold">{employee.name}</dd></div><div><dt className="text-slate-500">القسم</dt><dd>{departmentName}</dd></div><div><dt className="text-slate-500">اسم المستخدم</dt><dd>{employee.username || 'غير محدد'}</dd></div><div><dt className="text-slate-500">رقم الموظف</dt><dd>{employee.id}</dd></div></dl>
    <p className="text-xs text-slate-500">تعديل الاسم الرسمي أو القسم يتم عن طريق الإدارة.</p>
    <label className="flex flex-col gap-2">الاسم الظاهر<input maxLength={100} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} className="border p-3 rounded-lg" /></label>
    <label className="flex flex-col gap-2">رقم الجوال<input dir="ltr" type="tel" maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="border p-3 rounded-lg" /></label>
    <label className="flex flex-col gap-2">البريد الإلكتروني<input dir="ltr" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="border p-3 rounded-lg" /></label>
    <p className="text-xs text-slate-500">تغيير البريد يلغي التحقق السابق؛ يمكنك التحقق من البريد الجديد في الإعدادات.</p>
    <button disabled={busy||processing} className="bg-sky-600 text-white p-3 rounded-xl disabled:opacity-50">{busy?'جاري حفظ البيانات…':'حفظ الملف الشخصي'}</button>{message&&<p role="status" className="text-emerald-700">{message}</p>}{error&&<p role="alert" className="text-rose-700">{error}</p>}
  </form>;
}
