// Explicit Gregorian controls avoid device-native Hijri month pickers on iOS.
const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
export default function GregorianMonthPicker({value,onChange}:{value:string;onChange:(month:string)=>void}) {
  const [year,month]=value.split('-');
  const years=Array.from(new Set([...Array.from({length:101},(_,i)=>String(2000+i)),year])).sort();
  return <div className="flex flex-wrap items-center gap-2" dir="rtl"><span className="text-sm">الفترة الميلادية</span><select aria-label="شهر كشف البصمات الميلادي" value={month} onChange={e=>onChange(`${year}-${e.target.value}`)} className="border p-2 rounded bg-white">{monthNames.map((name,i)=><option key={name} value={String(i+1).padStart(2,'0')}>{String(i+1).padStart(2,'0')} — {name}</option>)}</select><select aria-label="سنة كشف البصمات الميلادية" value={year} onChange={e=>onChange(`${e.target.value}-${month}`)} className="border p-2 rounded bg-white" dir="ltr" lang="en">{years.map(y=><option key={y} value={y}>{y}</option>)}</select></div>;
}
