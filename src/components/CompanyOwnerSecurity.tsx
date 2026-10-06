import { useState, type FormEvent } from 'react';
export default function CompanyOwnerSecurity({companyId}:{companyId:string}) {
  const [currentPassword,setCurrent]=useState(''),[newPassword,setNew]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(newPassword!==confirmation){setMessage('كلمتا المرور غير متطابقتين');return;}
    setBusy(true);setMessage('');
    try{const response=await fetch('/api/company-owner/password?companyId='+encodeURIComponent(companyId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});const result=await response.json();if(!response.ok)throw new Error(result.error);setCurrent('');setNew('');setConfirmation('');setMessage(result.message);localStorage.removeItem('app_session');window.location.assign('/login');}
    catch(error:any){setMessage(error.message || 'تعذر الاتصال');}finally{setBusy(false);}
  };
  return <form onSubmit={submit} className="p-5 mb-5 bg-white border rounded-xl flex flex-col gap-3">
    <h3 className="font-bold">حماية حساب صاحب الشركة</h3><p className="text-sm">إذا سبق إنشاء حسابك بواسطة مسؤول المنصة، غيّر كلمة المرور هنا بنفسك. التغيير يلغي جميع جلسات صاحب الشركة القديمة.</p>
    <label>كلمة المرور الحالية<input required type="password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} autoComplete="current-password" className="w-full p-2 border rounded" /></label>
    <label>كلمة المرور الجديدة<input required minLength={10} maxLength={72} type="password" value={newPassword} onChange={e=>setNew(e.target.value)} autoComplete="new-password" className="w-full p-2 border rounded" /></label>
    <label>تأكيد كلمة المرور<input required type="password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" className="w-full p-2 border rounded" /></label>
    <button disabled={busy} className="p-2 bg-sky-600 text-white rounded disabled:opacity-50">{busy?'جاري الحفظ…':'تغيير كلمة المرور وإلغاء الجلسات القديمة'}</button>{message && <p role="status">{message}</p>}
  </form>;
}
