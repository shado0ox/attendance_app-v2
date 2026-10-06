import { useState } from 'react';
import { employeeWeekDates } from '../lib/employeeWeek';
export default function EmployeeWeekSchedule({employeeId,schedule,shiftTypes}:{employeeId:string;schedule:any;shiftTypes:any[]}) {
  const [offset,setOffset]=useState(0);const dates=employeeWeekDates(Date.now(),offset),today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
  return <section className="bg-white border border-sky-100 rounded-2xl p-4 flex flex-col gap-4" dir="rtl">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="font-bold">دوامي هذا الأسبوع</h2><p className="text-xs text-slate-500 mt-1">السبت إلى الجمعة · {dates[0]} — {dates[6]}</p></div><div className="flex gap-2 text-xs"><button onClick={()=>setOffset(n=>n-1)} className="border rounded-lg p-2">السابق</button><button onClick={()=>setOffset(0)} className="bg-sky-100 text-sky-800 rounded-lg p-2">الأسبوع الحالي</button><button onClick={()=>setOffset(n=>n+1)} className="border rounded-lg p-2">التالي</button></div></div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">{dates.map((date,i)=>{
      const assigned=schedule?.[date]?.[employeeId],shift=shiftTypes.find(s=>s.id===assigned?.shiftType),rest=['A','OFF'].includes(assigned?.shiftType);
      const label=rest?'إجازة / راحة':shift?.name || (assigned?.shiftType?'شيفت غير معروف':'غير مجدول');
      return <article key={date} className={'p-3 rounded-xl border text-sm '+(date===today?'bg-sky-50 border-sky-500':'bg-slate-50 border-slate-100')} aria-current={date===today?'date':undefined}><div className="flex flex-wrap justify-between gap-1"><strong>{['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'][i]}</strong>{date===today&&<span className="text-xs text-sky-700">اليوم</span>}</div><p className="text-xs text-slate-500 mt-1">{date.slice(5)}</p><p className={'font-bold mt-3 '+(rest?'text-slate-500':'text-sky-800')}>{label}</p>{shift&&!rest&&<><p className="text-xs mt-2" dir="ltr">{shift.start || '—'} – {shift.end || '—'}</p>{shift.type==='double'&&<p className="text-xs mt-1" dir="ltr">{shift.start2 || '—'} – {shift.end2 || '—'}</p>}</>}{assigned?.note&&<p className="text-xs mt-2 break-words text-slate-600">{assigned.note}</p>}</article>;
    })}</div>
  </section>;
}
