import { isActiveEmployee, employeeStatus, statusLabels } from '../../lib/employeeLifecycle';
import { useState } from 'react';
import { printSchedule } from '../../lib/schedulePrint';
import SchedulePlanner from './SchedulePlanner';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface ScheduleViewProps {
  companyName: string;
  logoDataUrl?: string;
  onApplySchedule: (schedule: any) => Promise<boolean>;
  departments: any[];
  employees: any[];
  shiftTypes: any[];
  schedule: any;
  selectedDept: string;
  setSelectedDept: (id: string) => void;
  scheduleMonth: string;
  setScheduleMonth: (v: string) => void;
  hasPermission: (perm: string) => boolean;
  getDaysInSelectedMonth: () => { dateStr: string; date: Date }[];
  getAttTodayStr: () => string;
  DAYS_AR: string[];
  onEditCell: (empId: string, dateStr: string, shiftType: string, note: string) => void;
}

export default function ScheduleView({
  companyName,
  logoDataUrl,
  onApplySchedule,
  departments,
  employees,
  shiftTypes,
  schedule,
  selectedDept,
  setSelectedDept,
  scheduleMonth,
  setScheduleMonth,
  hasPermission,
  getDaysInSelectedMonth,
  getAttTodayStr,
  DAYS_AR,
  onEditCell,
}: ScheduleViewProps) {
  const [exportAll, setExportAll] = useState(false);
  const [exportError, setExportError] = useState('');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const department = departments.find(d => d.id === selectedDept);
  const deptEmployees = employees.filter((e) => e.dept === selectedDept);

  return (
    <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-5">
      {/* Department filtering tabs */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b pb-3">
        <div className="flex p-0.5 bg-slate-100 rounded-xl flex-wrap">
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDept(d.id)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                selectedDept === d.id ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const [y, m] = scheduleMonth.split('-').map(Number);
              const target = new Date(y, m - 2, 1);
              setScheduleMonth(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-1.5 border hover:bg-slate-50 rounded-lg"
          >
            <ChevronRight size={15} />
          </button>
          <input
            type="month"
            value={scheduleMonth}
            onChange={(e) => setScheduleMonth(e.target.value)}
            className="px-3 py-1 border rounded-lg text-xs font-extrabold focus:outline-none bg-sky-50 text-sky-800"
          />
          <button
            onClick={() => {
              const [y, m] = scheduleMonth.split('-').map(Number);
              const target = new Date(y, m, 1);
              setScheduleMonth(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="p-1.5 border hover:bg-slate-50 rounded-lg"
          >
            <ChevronLeft size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-slate-50 border rounded-xl p-3 text-xs" dir="rtl">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={exportAll} onChange={e => setExportAll(e.target.checked)}/> تضمين كل الأقسام (كل قسم بصفحات مستقلة)</label>
        <button type="button" disabled={!departments.length || (!exportAll && !department)} onClick={() => {
          setExportError('');
          try {
            const ok = printSchedule({ companyName, logoDataUrl, departments: exportAll ? departments : [department], employees, shiftTypes: shiftTypes || [], schedule, month: scheduleMonth });
            if (!ok) setExportError('اسمح بفتح نافذة المعاينة في المتصفح ثم أعد التصدير');
          } catch (e: any) { setExportError(e.message || 'تعذر إعداد التقرير'); }
        }} className="px-4 py-2 bg-sky-700 text-white rounded-lg font-bold disabled:opacity-40">تصدير جدول {exportAll ? 'كل الأقسام' : 'القسم'} PDF</button>
        <span className="text-slate-500">الشهر المحدد · معاينة ثم طباعة / حفظ PDF</span>
        {exportError && <p role="alert" className="w-full text-rose-700">{exportError}</p>}
      </div>
      {hasPermission('canEditSchedule') && department && <>
        <button type="button" onClick={() => setPlannerOpen(v => !v)} className="self-start px-4 py-2 bg-sky-100 text-sky-800 rounded-lg text-xs font-bold">
          {plannerOpen ? 'إغلاق أداة الاقتراح' : 'اقتراح توزيع الشيفتات والراحات'}
        </button>
        {plannerOpen && <div key={selectedDept + scheduleMonth}><SchedulePlanner department={department} employees={employees.filter(isActiveEmployee)} shiftTypes={shiftTypes} schedule={schedule} month={scheduleMonth} onApply={onApplySchedule}/></div>}
      </>}
      {/* Dynamic schedule table grid */}
      <div className="overflow-auto max-h-[72vh] rounded-xl border border-sky-100 shadow-2xs relative">
        <table className="w-full border-collapse text-right text-xs relative">
          <thead className="sticky top-0 z-20 bg-sky-50 shadow-xs">
            <tr className="bg-sky-50 text-sky-900 border-b">
              <th className="p-3 font-extrabold bg-sky-50 sticky right-0 z-30 shadow-2xs">التاريخ</th>
              <th className="p-3 font-extrabold bg-sky-50 border-l border-sky-100 sticky right-[82px] z-30 shadow-2xs">اليوم</th>
              {deptEmployees.map((emp) => (
                <th key={emp.id} className="p-3 font-extrabold text-center border-r border-sky-100 bg-sky-50">
                  {emp.name}
                  {employeeStatus(emp) !== 'active' && <span className="block text-[10px] text-amber-700">{statusLabels[employeeStatus(emp)]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {getDaysInSelectedMonth().map(({ dateStr, date }) => {
              const isFri = date.getDay() === 5;
              const isToday = dateStr === getAttTodayStr();
              const rowBg = isToday ? 'bg-amber-50' : isFri ? 'bg-slate-50/90' : 'bg-white';

              return (
                <tr
                  key={dateStr}
                  className={`border-b last:border-0 transition-colors ${
                    isToday ? 'bg-amber-50 ring-2 ring-inset ring-amber-300 relative z-[1]' : 'hover:bg-sky-50/20'
                  }`}
                >
                  <td
                    className={`p-3 font-extrabold text-slate-700 sticky right-0 z-10 shadow-2xs ${rowBg} ${
                      isToday ? 'border-r-4 border-amber-400' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{dateStr}</span>
                      {isToday && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[8px] font-black animate-pulse whitespace-nowrap">
                          ● اليوم
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`p-3 font-bold sticky right-[82px] z-10 border-l border-sky-100 shadow-2xs ${
                      isFri ? 'text-indigo-600' : isToday ? 'text-amber-700' : 'text-slate-500'
                    } ${rowBg}`}
                  >
                    {DAYS_AR[date.getDay()]}
                  </td>
                  {deptEmployees.map((emp) => {
                    const entry = schedule[dateStr]?.[emp.id];
                    const stType = entry?.shiftType || 'A';

                    const st = (shiftTypes || []).find((t: any) => t.id === stType);
                    let badgeStyle = 'text-slate-400 bg-slate-100 font-medium';
                    let badgeLabel = '🏝️ إجازة';

                    if (st) {
                      if (st.type === 'morning' || (!st.type && st.id === 'S')) {
                        badgeStyle = 'text-emerald-700 bg-emerald-50 border border-emerald-200/60 font-bold';
                        badgeLabel = `🌅 ${st.name}`;
                      } else if (st.type === 'evening' || (!st.type && st.id === 'E')) {
                        badgeStyle = 'text-indigo-700 bg-indigo-50 border border-indigo-200/60 font-bold';
                        badgeLabel = `🌙 ${st.name}`;
                      } else if (st.type === 'double') {
                        badgeStyle = 'text-amber-700 bg-amber-50 border border-amber-200/60 font-bold animate-pulse';
                        badgeLabel = `🔄 ${st.name} (كامل)`;
                      } else {
                        badgeStyle = 'text-sky-700 bg-sky-50 border border-sky-300/30 font-bold';
                        badgeLabel = `⏱️ ${st.name}`;
                      }
                    }

                    return (
                      <td
                        key={emp.id}
                        onClick={() => {
                          if (!hasPermission('canEditSchedule')) return;
                          onEditCell(emp.id, dateStr, stType, entry?.note || '');
                        }}
                        className={`p-2 border-r border-sky-100 text-center cursor-pointer transition-all hover:bg-sky-100/30 ${
                          isToday ? 'bg-amber-50/70' : ''
                        }`}
                      >
                        <span className={`inline-block px-2.5 py-1 rounded-full font-bold text-[10px] ${badgeStyle}`}>
                          {badgeLabel}
                        </span>
                        {entry?.note && (
                          <span className="block text-[8px] text-slate-400 mt-0.5 truncate max-w-[80px] mx-auto">
                            {entry.note}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
