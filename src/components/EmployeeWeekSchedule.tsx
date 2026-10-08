import { useState } from 'react';
import { ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { employeeWeekDates } from '../lib/employeeWeek';

const dayNames = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export default function EmployeeWeekSchedule({ employeeId, schedule, shiftTypes, permissionDays=[] }: { employeeId: string; schedule: any; shiftTypes: any[]; permissionDays?: any[] }) {
  const [offset, setOffset] = useState(0);
  const dates = employeeWeekDates(Date.now(), offset);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });

  return (
    <section className="wafr-week" dir="rtl" aria-label="جدول الدوام الأسبوعي">
      <div className="wafr-week-heading">
        <div>
          <h2><CalendarDays size={20} aria-hidden="true" />{offset === 0 ? 'دوامي هذا الأسبوع' : 'جدول الأسبوع'}</h2>
          <p>السبت إلى الجمعة <span dir="ltr">{dates[0]} — {dates[6]}</span></p>
        </div>
        <div className="wafr-week-controls">
          <button type="button" onClick={() => setOffset(n => n - 1)} aria-label="الأسبوع السابق"><ChevronRight size={18} /></button>
          <button type="button" onClick={() => setOffset(0)}>الأسبوع الحالي</button>
          <button type="button" onClick={() => setOffset(n => n + 1)} aria-label="الأسبوع التالي"><ChevronLeft size={18} /></button>
        </div>
      </div>
      <div className="wafr-week-days">
        {dates.map((date, i) => {
          const assigned = schedule?.[date]?.[employeeId];
          const shift = shiftTypes.find(s => s.id === assigned?.shiftType);
          const rest = ['A', 'OFF'].includes(assigned?.shiftType);
          const label = rest ? 'إجازة / راحة' : shift?.name || (assigned?.shiftType ? 'شيفت غير معروف' : 'غير مجدول');
          return (
            <article key={date} className="wafr-week-day" data-today={date === today} data-rest={rest} aria-current={date === today ? 'date' : undefined}>
              <div className="wafr-week-date"><strong>{dayNames[i]}</strong><time dateTime={date} dir="ltr">{date.slice(5)}</time>{date === today && <span>اليوم</span>}</div>
              <div className="wafr-week-shift"><p>{label}</p>{shift && !rest && <><p className="wafr-week-time" dir="ltr">{shift.start || '—'} – {shift.end || '—'}</p>{shift.type === 'double' && <p className="wafr-week-time" dir="ltr">{shift.start2 || '—'} – {shift.end2 || '—'}</p>}</>}{permissionDays.some(marker=>marker.date===date&&marker.employeeId===employeeId)&&<p className="wafr-week-note text-sky-700 font-bold">استئذان معتمد</p>}{assigned?.note && <p className="wafr-week-note">{assigned.note}</p>}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
