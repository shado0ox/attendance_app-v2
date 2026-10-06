import { useState, type FormEvent } from 'react';

export default function CompanyRegistration() {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false);
  const [form,setForm]=useState({id:'',name:'',adminUsername:'',adminEmail:'',adminPassword:'',confirmPassword:'',privacyAccepted:false});
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(form.adminPassword!==form.confirmPassword){setMessage('كلمتا المرور غير متطابقتين');return;}
    setBusy(true);setMessage('');
    try {
      const {confirmPassword,...payload}=form;
      const response=await fetch('/api/company-registration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'تعذر التسجيل');
      setMessage(`تم إنشاء شركتك برمز ${result.companyCode}. احتفظ باسم المستخدم وكلمة المرور. يمكنك الدخول من بوابة المدير بعد تفعيل الاشتراك.`);
      setRegistered(true);setForm({...form,adminPassword:'',confirmPassword:''});
    }catch(error:any){setMessage(error.message || 'تعذر الاتصال');}finally{setBusy(false);}
  };
  return <div dir="rtl" className="mt-5 text-right">
    <button type="button" onClick={()=>setOpen(!open)} className="w-full text-sm text-sky-700 border rounded-lg p-3">{open?'إغلاق تسجيل الشركة':'تسجيل شركة بواسطة صاحبها'}</button>
    {open && <form onSubmit={submit} className="mt-3 flex flex-col gap-3 text-sm p-4 rounded-xl bg-sky-50">
      <p>اختر بيانات دخولك بنفسك. مسؤول المنصة يدير الاشتراك فقط ولا يستطيع دخول بيانات شركتك أو تغيير حساب مديرها.</p>
      {!registered && <>
        {([{key:'name',label:'اسم الشركة',type:'text'},{key:'id',label:'معرّف الشركة (حروف إنجليزية صغيرة وأرقام وشرطة)',type:'text'},{key:'adminUsername',label:'اسم مستخدم مدير الشركة',type:'text'},{key:'adminEmail',label:'بريد مدير الشركة',type:'email'},{key:'adminPassword',label:'كلمة مرور (10 أحرف على الأقل)',type:'password'},{key:'confirmPassword',label:'تأكيد كلمة المرور',type:'password'}] as const).map(field=><label key={field.key} className="flex flex-col gap-1">{field.label}<input required type={field.type} value={form[field.key]} minLength={field.type==='password'?10:undefined} maxLength={field.type==='password'?128:200} autoComplete={field.type==='password'?'new-password':undefined} onChange={e=>setForm({...form,[field.key]:e.target.value})} className="border p-2 rounded-lg bg-white" /></label>)}
        <label className="flex gap-2 items-start"><input required type="checkbox" checked={form.privacyAccepted} onChange={e=>setForm({...form,privacyAccepted:e.target.checked})}/><span>اطلعت على <a className="underline" href="/privacy.html" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a> وفهمت استخدام البيانات.</span></label>
        <button disabled={busy} className="p-3 rounded-lg bg-sky-600 text-white disabled:opacity-50">{busy?'جاري التسجيل…':'إنشاء الشركة وانتظار التفعيل'}</button>
      </>}
      {message && <p role="status" className="p-3 bg-white rounded-lg">{message}</p>}
    </form>}
  </div>;
}
