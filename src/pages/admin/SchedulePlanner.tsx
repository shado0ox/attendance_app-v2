import { useState } from 'react';
import { attendanceToday } from '../../lib/attendanceQuery';
import { applyProposal, proposeSchedule, shiftPeriods, type PlanOptions } from '../../lib/schedulePlanning';

const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
interface Props {
  department: any; employees: any[]; shiftTypes: any[]; schedule: any; month: string;
  onApply: (schedule: any) => Promise<boolean>;
}
export default function SchedulePlanner({ department, employees, shiftTypes, schedule, month, onApply }: Props) {
  const staff = employees.filter(e => e.dept === department.id);
  const first = month + '-01';
  const last = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5)), 0)).toISOString().slice(0,10);
  const [options, setOptions] = useState<PlanOptions>(() => ({
    from: first < attendanceToday() ? attendanceToday() : first, to: last,
    morning: department.needsMorning ? 1 : 0, evening: department.needsEvening ? 1 : 0,
    employeeIds: staff.map(e => e.id), shiftIds: shiftTypes.filter(s => shiftPeriods(s).length === 1).map(s => s.id),
    restDays: 1, maxConsecutive: 6, minRestHours: 11, unavailable: {}
  }));
  const [preview, setPreview] = useState<{ result: ReturnType<typeof proposeSchedule>; signature: string } | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const signature = JSON.stringify({ department, employees, shiftTypes, schedule, options });
  const stale = !!preview && preview.signature !== signature;
  const update = (patch: Partial<PlanOptions>) => { setOptions(o => ({ ...o, ...patch })); setMessage(''); };
  const toggle = (key: 'employeeIds' | 'shiftIds', id: string) =>
    update({ [key]: options[key].includes(id) ? options[key].filter(x => x !== id) : [...options[key], id] });
  const generate = () => {
    try {
      if (options.from < attendanceToday()) throw new Error('الاقتراح متاح لليوم والأيام القادمة فقط');
      const result = proposeSchedule(department, employees, shiftTypes, schedule, options);
      setPreview({ result, signature }); setMessage('');
    } catch (e: any) { setMessage(e.message); setPreview(null); }
  };
  const apply = async () => {
    if (!preview || stale || preview.result.issues.length || saving) return;
    setSaving(true); setMessage('');
    try {
      if (options.from < attendanceToday()) throw new Error('تغير التاريخ؛ أعد توليد الاقتراح');
      const ok = await onApply(applyProposal(schedule, preview.result.changes));
      if (ok) { setPreview(null); setMessage('تم حفظ التوزيع بنجاح'); }
      else setMessage('لم يتم حفظ التوزيع؛ راجع رسالة الحفظ وأعد المحاولة بعد تحديث البيانات');
    } catch (e: any) { setMessage(e.message || 'تعذر حفظ التوزيع'); }
    finally { setSaving(false); }
  };
  const input = 'border rounded-lg px-3 py-2 bg-white w-full text-xs';
  return <section dir="rtl" className="border border-sky-200 bg-sky-50/40 rounded-xl p-4 space-y-4 text-xs">
    <h4 className="font-extrabold text-sky-900">اقتراح توزيع الشيفتات والراحات — {department.name}</h4>
    <p className="text-slate-600">يملأ الخانات الفارغة فقط، ويحافظ على كل التعيينات والإجازات الحالية. يوازن أيام العمل والفترات بين الموظفين، ويترك باقي الأيام راحة. سياسات الجمعة مأخوذة من إعدادات القسم. اقتراح تقريبي؛ راجع المعاينة قبل التطبيق.</p>
    <fieldset disabled={saving} className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label>من<input className={input} type="date" min={attendanceToday()} value={options.from} onChange={e => update({from:e.target.value})}/></label>
        <label>إلى<input className={input} type="date" min={options.from} value={options.to} onChange={e => update({to:e.target.value})}/></label>
        {([
          ['morning', 'الحد الأدنى صباحاً', 0, 100],
          ['evening', 'الحد الأدنى مساءً', 0, 100],
          ['restDays', 'أقل أيام راحة في كل 7 أيام', 0, 6],
          ['maxConsecutive', 'أقصى أيام عمل متتالية', 1, 7],
          ['minRestHours', 'أقل ساعات بين شيفتين', 0, 24]
        ] as const).map(([key,label,min,max]) => <label key={key}>{label}<input className={input} type="number" min={min} max={max} step={1} value={options[key]} onChange={e => update({[key]:Number(e.target.value)})}/></label>)}
      </div>
      <div><p className="font-bold mb-2">الشيفتات المسموح بها</p><div className="flex flex-wrap gap-3">
        {shiftTypes.filter(s => shiftPeriods(s).length).map(s => <label key={s.id} className="flex items-center gap-1">
          <input type="checkbox" checked={options.shiftIds.includes(s.id)} onChange={() => toggle('shiftIds',s.id)}/>
          {s.name} ({shiftPeriods(s).map(p => p === 'morning' ? 'صباحي' : 'مسائي').join(' + ')}) {s.start}–{s.end}
        </label>)}
      </div></div>
      <div className="overflow-auto max-h-64 border rounded-lg bg-white">
        <table className="w-full text-right"><thead><tr><th className="p-2">مشاركة الموظف</th><th className="p-2">أيام عدم الإتاحة الثابتة</th></tr></thead>
          <tbody>{staff.map(e => <tr key={e.id} className="border-t"><td className="p-2 whitespace-nowrap">
            <label><input type="checkbox" checked={options.employeeIds.includes(e.id)} onChange={() => toggle('employeeIds',e.id)}/> {e.name}</label>
          </td><td className="p-2"><div className="flex flex-wrap gap-2">{weekdays.map((day,n) => <label key={day} className="whitespace-nowrap">
            <input type="checkbox" checked={(options.unavailable[e.id] || []).includes(n)} onChange={() => {
              const days = options.unavailable[e.id] || [];
              update({ unavailable: {...options.unavailable, [e.id]:days.includes(n) ? days.filter(d => d !== n) : [...days,n]} });
            }}/> {day}
          </label>)}</div></td></tr>)}</tbody>
        </table>
      </div>
      <button type="button" onClick={generate} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-bold">توليد اقتراح ومعاينته</button>
    </fieldset>
    <p className="text-slate-500">الفترة حتى 31 يوماً. يتم فحص التعيينات السابقة واللاحقة حتى 7 أيام حولها. عند تعارض الشروط أو نقص التغطية، راجع الشروط أو الجدول وأعد التوليد؛ لن يُطبّق توزيع ناقص.</p>
    {message && <p role="status" className="font-bold text-sky-800">{message}</p>}
    {preview && <div className="space-y-3 border-t pt-3">
      {stale && <p role="alert" className="text-amber-800 font-bold">تغير الجدول أو الشروط؛ أعد توليد الاقتراح قبل التطبيق.</p>}
      <p className="font-bold">{preview.result.changes.filter(c => c.shiftType !== 'A').length} تعيين عمل جديد، و{preview.result.changes.filter(c => c.shiftType === 'A').length} يوم راحة جديد.</p>
      {preview.result.issues.length > 0 && <div role="alert" className="text-rose-700 bg-rose-50 p-3 rounded-lg max-h-48 overflow-auto">
        <p className="font-bold">تعذر تحقيق كل الشروط ({preview.result.issues.length} ملاحظة):</p>
        <ul className="list-disc pr-5">{preview.result.issues.map((issue,i) => <li key={i}>{issue}</li>)}</ul>
      </div>}
      <div className="overflow-auto border rounded-lg bg-white"><table className="w-full text-right">
        <thead><tr>{['الموظف','أيام العمل','صباحي','مسائي','راحة / إجازة'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{staff.filter(e => options.employeeIds.includes(e.id)).map(e => <tr key={e.id} className="border-t">
          <td className="p-2">{e.name}</td>{(['work','morning','evening','rest'] as const).map(key => <td key={key} className="p-2">{preview.result.totals[e.id]?.[key]}</td>)}
        </tr>)}</tbody>
      </table></div>
      <details><summary className="cursor-pointer font-bold">معاينة التوزيع اليومي</summary>
        <div className="overflow-auto max-h-80 bg-white border rounded-lg mt-2"><table className="w-full text-right">
          <thead><tr><th className="p-2">التاريخ</th><th className="p-2">الموظف</th><th className="p-2">التعيين الجديد</th></tr></thead>
          <tbody>{preview.result.changes.map(c => <tr key={c.date + c.employeeId} className="border-t"><td className="p-2">{c.date}</td><td className="p-2">{staff.find(e => e.id === c.employeeId)?.name}</td><td className="p-2">{shiftTypes.find(s => s.id === c.shiftType)?.name || 'راحة'}</td></tr>)}</tbody>
        </table></div>
      </details>
      <button type="button" disabled={saving || stale || !!preview.result.issues.length || !preview.result.changes.length} onClick={apply} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold disabled:opacity-40">
        {saving ? 'جارٍ الحفظ…' : 'تطبيق وحفظ التوزيع المعروض'}
      </button>
    </div>}
  </section>;
}
