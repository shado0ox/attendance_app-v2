import type { ReactNode } from 'react';
import { Clock, AlertTriangle, Check, Users, Building2, Layers } from 'lucide-react';

interface DashboardViewProps {
  employees: any[];
  departments: any[];
  shiftTypes: any[];
  schedule: any;
  appSettings: any;
  selectedDept: string;
  setSelectedDept: (id: string) => void;
  hasPermission: (perm: string) => boolean;
  getShiftGaps: () => any[];
  toggleAlertRead: (id: string) => void;
  onEditCell: (empId: string, dateStr: string, shiftType: string, note: string) => void;
  DAYS_AR: string[];
}

// Small, reusable KPI card. Each metric gets its own accent color so the
// dashboard reads at a glance instead of everything being the same sky-blue.
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent: 'sky' | 'slate' | 'rose' | 'amber';
}) {
  const accents: Record<string, { bg: string; text: string; ring: string }> = {
    sky: { bg: 'bg-sky-50', text: 'text-sky-600', ring: 'border-sky-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', ring: 'border-slate-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'border-rose-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'border-amber-100' },
  };
  const c = accents[accent];
  return (
    <div className={`p-5 bg-white border ${c.ring} rounded-2xl shadow-sm flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl ${c.bg} ${c.text} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <span className="text-[10px] font-bold text-slate-400 block mb-1">{label}</span>
        <div className={`text-xl font-extrabold ${c.text}`}>{value}</div>
      </div>
    </div>
  );
}

export default function DashboardView({
  employees,
  departments,
  shiftTypes,
  schedule,
  appSettings,
  selectedDept,
  setSelectedDept,
  hasPermission,
  getShiftGaps,
  toggleAlertRead,
  onEditCell,
  DAYS_AR,
}: DashboardViewProps) {
  const gaps = getShiftGaps();
  const unreadGaps = gaps.filter((g) => !(appSettings.readAlerts || []).includes(g.id));

  const current = new Date();
  const dayOfWeek = current.getDay(); // 0 Sun ... 6 Sat
  const dist = dayOfWeek === 6 ? 0 : -(dayOfWeek + 1);
  const startOfWeek = new Date(current);
  startOfWeek.setDate(current.getDate() + dist);

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const next = new Date(startOfWeek);
    next.setDate(startOfWeek.getDate() + i);
    const dateStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    weekDays.push({
      date: next,
      name: DAYS_AR[next.getDay()],
      dateStr,
      isToday: next.toDateString() === current.toDateString(),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إجمالي الموظفين" value={`${employees.length} موظف`} icon={<Users size={20} />} accent="sky" />
        <StatCard label="عدد الأقسام" value={`${departments.length} فرع`} icon={<Building2 size={20} />} accent="slate" />
        <StatCard label="تنبيهات الشهر" value={`${gaps.length} تغطية ناقصة`} icon={<AlertTriangle size={20} />} accent="rose" />
        <StatCard label="نوبات العمل" value={`${shiftTypes.length || 2} نوبة`} icon={<Layers size={20} />} accent="amber" />
      </div>

      {/* Side-by-side Layout of Active Schedule & Coverage Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-2" dir="rtl">
        {/* Right Area: Interactive Weekly Schedule Section */}
        <div className="lg:col-span-8 p-6 bg-white border border-sky-100 rounded-2xl shadow-sm text-right flex flex-col gap-5 animate-fade-in">
          <div className="flex justify-between items-center flex-wrap gap-4 border-b border-sky-50 pb-4">
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Clock size={16} className="text-sky-500" />
                <span>جدول دوام الأسبوع الحالي للأقسام</span>
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">عرض تفاعلي لتوزيع النوبات للأقسام المختلفة للأسبوع الجاري.</p>
            </div>

            <div className="flex p-0.5 bg-slate-100 rounded-xl flex-wrap">
              {departments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDept(d.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    selectedDept === d.id ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-sky-50">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="bg-sky-50/60 text-sky-900 border-b border-sky-100">
                  <th className="p-3 font-extrabold text-slate-700">الموظف</th>
                  {weekDays.map((wd, index) => (
                    <th
                      key={index}
                      className={`p-3 font-extrabold text-center border-r border-sky-50 leading-tight ${
                        wd.isToday ? 'bg-amber-100/60 text-amber-950 font-black' : ''
                      }`}
                    >
                      <div>{wd.name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {String(wd.date.getDate()).padStart(2, '0')}/{String(wd.date.getMonth() + 1).padStart(2, '0')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.filter((e) => e.dept === selectedDept).map((emp) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-extrabold text-slate-700 bg-slate-50/20">{emp.name}</td>
                    {weekDays.map((wd, idx) => {
                      const entry = schedule[wd.dateStr]?.[emp.id];
                      const stType = entry?.shiftType || 'A';
                      const _st = (shiftTypes || []).find((t: any) => t.id === stType);

                      let badgeStyle = 'text-slate-400 bg-slate-100 font-medium border border-transparent';
                      let badgeLabel = '🏝️ إجازة';

                      if (_st) {
                        if (_st.id === 'S') {
                          badgeStyle = 'text-emerald-700 bg-emerald-50 border border-emerald-200/50 font-bold';
                          badgeLabel = `🌅 ${_st.name.replace('شيفت', '').trim()}`;
                        } else if (_st.id === 'E') {
                          badgeStyle = 'text-indigo-700 bg-indigo-50 border border-indigo-200/50 font-bold';
                          badgeLabel = `🌙 ${_st.name.replace('شيفت', '').trim()}`;
                        } else if (_st.type === 'double') {
                          badgeStyle = 'text-amber-700 bg-amber-50 border border-amber-200/50 font-bold';
                          badgeLabel = `🔄 ${_st.name.replace('شيفت', '').trim()}`;
                        } else {
                          badgeStyle = 'text-sky-700 bg-sky-50 border border-sky-200/50 font-bold';
                          badgeLabel = `⏱️ ${_st.name.replace('شيفت', '').trim()}`;
                        }
                      }

                      return (
                        <td
                          key={idx}
                          onClick={() => {
                            if (!hasPermission('canEditSchedule')) return;
                            onEditCell(emp.id, wd.dateStr, stType, entry?.note || '');
                          }}
                          className={`p-2 border-r border-sky-50 text-center cursor-pointer transition-all hover:bg-sky-100/30 ${
                            wd.isToday ? 'bg-amber-100/10' : ''
                          }`}
                          title="انقر لتعديل هذه النوبة فورياً"
                        >
                          <span className={`inline-block px-2 py-1 rounded-lg text-[9px] font-bold ${badgeStyle}`}>
                            {badgeLabel}
                          </span>
                          {entry?.note && (
                            <div className="text-[8px] text-slate-400 mt-0.5 truncate max-w-[80px]" title={entry.note}>
                              📝 {entry.note}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {employees.filter((e) => e.dept === selectedDept).length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-xs text-slate-400 font-medium">
                      لا يوجد موظفون مضافون في هذا القسم حالياً لعرض جدولهم الأسبوعي.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Left Area: Alerts & Gaps Notifications Section */}
        <div className="lg:col-span-4 p-5 bg-white border border-sky-100 rounded-2xl shadow-sm text-right flex flex-col gap-4 animate-fade-in">
          <div className="flex justify-between items-center border-b border-sky-50 pb-3">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
              <AlertTriangle size={15} className="text-rose-500 animate-pulse" />
              <span>تنبيهات نقص التغطية الجارية</span>
            </h3>
            <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-extrabold font-mono">
              {unreadGaps.length} نشط
            </span>
          </div>

          <div className="flex flex-col gap-2.5 max-h-[460px] overflow-y-auto pr-1">
            {unreadGaps.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center gap-2">
                <span className="text-2xl animate-bounce">🎉</span>
                <span>ممتاز! جميع الأقسام مغطاة بالكامل ولا توجد تنبيهات غير مقروءة حالياً.</span>
              </div>
            ) : (
              unreadGaps.slice(0, 5).map((g) => (
                <div
                  key={g.id}
                  className="p-3 bg-rose-50/40 border-r-4 border-rose-500 rounded-l-xl border border-sky-100 flex justify-between items-start gap-2.5 hover:bg-rose-50/80 transition-all"
                >
                  <div className="text-xs text-slate-700 leading-relaxed">
                    <div className="font-extrabold text-rose-950 text-[11px] mb-0.5">{g.dept}</div>
                    <div className="text-[10px] text-slate-500 font-mono mb-1">{g.date}</div>
                    <span className="text-[10px] text-rose-800 font-bold">{g.msg}</span>
                  </div>
                  <button
                    onClick={() => toggleAlertRead(g.id)}
                    className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 transition-all flex-shrink-0"
                    title="تحديد كمقروء وحذف من القائمة الفعّالة"
                  >
                    <Check size={14} className="stroke-[3]" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
