import { buildAttendanceDays, formatMinutes, formatPunch, csvCell } from '../../lib/attendanceReport';
import { UserCheck, UserX, Users, Search, Download, Trash2 } from 'lucide-react';

interface AttendanceViewProps {
  attendanceRecords: any[];
  appSettings: any;
  employees: any[];
  departments: any[];
  attFilterFrom: string;
  attFilterTo: string;
  attFilterEmp: string;
  attFilterDept: string;
  attFilterStatus: string;
  setAttFilterFrom: (v: string) => void;
  setAttFilterTo: (v: string) => void;
  setAttFilterEmp: (v: string) => void;
  setAttFilterDept: (v: string) => void;
  setAttFilterStatus: (v: string) => void;
  loadAttendance: () => void;
  getTodayAttendanceStats: () => { presentCount: number; absentCount: number; totalActive: number };
  requestConfirm: (msg: string, onConfirm: () => void) => void;
  onDeleteRecord: (id: string) => Promise<void>;
}

export default function AttendanceView({
  attendanceRecords,
  appSettings,
  employees,
  departments,
  attFilterFrom,
  attFilterTo,
  attFilterEmp,
  attFilterDept,
  attFilterStatus,
  setAttFilterFrom,
  setAttFilterTo,
  setAttFilterEmp,
  setAttFilterDept,
  setAttFilterStatus,
  loadAttendance,
  getTodayAttendanceStats,
  requestConfirm,
  onDeleteRecord,
}: AttendanceViewProps) {
  const stats = getTodayAttendanceStats();

  const dailyRecords = buildAttendanceDays(attendanceRecords, appSettings);
  const filteredRecords = dailyRecords.filter((r) => {
    if (attFilterFrom && r.date < attFilterFrom) return false;
    if (attFilterTo && r.date > attFilterTo) return false;
    if (attFilterEmp && r.empId !== attFilterEmp) return false;
    if (attFilterDept && r.dept !== attFilterDept) return false;
    if (attFilterStatus === 'present' && r.minutes !== null) return false;
    if (attFilterStatus === 'checkedout' && r.minutes === null) return false;
    return true;
  });

  const exportCsv = () => {
    const rows = [['التاريخ', 'اليوم', 'الموظف', 'القسم', 'أول حضور', 'آخر انصراف', 'مدة العمل', 'الساعات العشرية', 'مكان أول حضور', 'مكان آخر انصراف', 'الحالة', 'بصمات مستبعدة']];
    filteredRecords.forEach(r => {
      const department = departments.find(d => d.id === r.dept);
      rows.push([r.date, new Date(r.date + 'T12:00:00').toLocaleDateString('ar-SA', { weekday: 'long' }), r.empName, department?.name || r.dept,
        formatPunch(r.first), formatPunch(r.last), formatMinutes(r.minutes), r.minutes === null ? '' : (r.minutes / 60).toFixed(2),
        r.first?.location || 'غير مسجل', r.last?.location || 'غير مسجل', r.reportStatus, String(r.ignored)]);
    });
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `كشف_حضور_${attFilterEmp || 'الكل'}_${attFilterFrom}_${attFilterTo}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resetFilters = () => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setAttFilterFrom(todayStr);
    setAttFilterTo(todayStr);
    setAttFilterEmp('');
    setAttFilterDept('');
    setAttFilterStatus('');
    setTimeout(() => loadAttendance(), 50);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Widgets Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" dir="rtl">
        <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between shadow-sm text-right">
          <div>
            <span className="text-xs font-bold text-emerald-600">الموظفون الحاضرون (اليوم)</span>
            <h4 className="text-2xl font-black text-emerald-800 mt-1">{stats.presentCount}</h4>
            <p className="text-[10px] text-emerald-700 mt-1">سجلوا حضورهم لليوم</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-600 text-lg">
            <UserCheck size={24} />
          </div>
        </div>

        <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between shadow-sm text-right">
          <div>
            <span className="text-xs font-bold text-rose-600">الموظفون الغائبون (اليوم)</span>
            <h4 className="text-2xl font-black text-rose-800 mt-1">{stats.absentCount}</h4>
            <p className="text-[10px] text-rose-700 mt-1">لم يسجلوا حضورهم حتى الآن</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-600/10 flex items-center justify-center text-rose-600 text-lg">
            <UserX size={24} />
          </div>
        </div>

        <div className="p-5 bg-sky-50 border border-sky-100 rounded-2xl flex items-center justify-between shadow-sm sm:col-span-2 lg:col-span-1 text-right">
          <div>
            <span className="text-xs font-bold text-sky-600">إجمالي قوة العمل</span>
            <h4 className="text-2xl font-black text-sky-800 mt-1">{stats.totalActive} موظف</h4>
            <p className="text-[10px] text-sky-700 mt-1">الموظفون المسجلون في قواعد البيانات</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-600/10 flex items-center justify-center text-sky-600 text-lg">
            <Users size={24} />
          </div>
        </div>
      </div>

      {/* Reports Query Filter */}
      <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
        <h3 className="font-extrabold text-slate-800 text-sm">تصفية وبحث كشف الحضور</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500">من تاريخ</label>
            <input
              type="date"
              value={attFilterFrom}
              onChange={(e) => setAttFilterFrom(e.target.value)}
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500">إلى تاريخ</label>
            <input
              type="date"
              value={attFilterTo}
              onChange={(e) => setAttFilterTo(e.target.value)}
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500">الموظف</label>
            <select
              value={attFilterEmp}
              onChange={(e) => setAttFilterEmp(e.target.value)}
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
            >
              <option value="">الكل</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500">القسم</label>
            <select
              value={attFilterDept}
              onChange={(e) => setAttFilterDept(e.target.value)}
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
            >
              <option value="">الكل</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">حالة اليوم
            <select className="px-3 py-2 text-xs border rounded-lg bg-white" value={attFilterStatus} onChange={e => setAttFilterStatus(e.target.value)}>
              <option value="">كل الحالات</option><option value="checkedout">مكتمل</option><option value="present">ناقص / للمراجعة</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              onClick={loadAttendance}
              className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
            >
              <Search size={14} />
              <span>تحديث</span>
            </button>

            <button
              onClick={resetFilters}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-extrabold text-xs border border-slate-200/60 transition-all text-center whitespace-nowrap"
              title="إعادة تعيين حقول الفلترة والبحث"
            >
              إعادة تعيين
            </button>

            <button
              onClick={exportCsv}
              className="p-2.5 hover:bg-sky-50 border rounded-lg text-sky-600 transition-all"
              title="تصدير النتائج المفلترة فقط" disabled={!filteredRecords.length}
            >
              <Download size={15} /><span className="text-xs">تصدير {attFilterEmp ? 'الموظف المختار' : 'النتائج'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-sky-50 rounded-xl text-sm flex flex-wrap gap-5">
        <strong>أيام الموظفين: {filteredRecords.length}</strong>
        <strong>إجمالي المدة: {formatMinutes(filteredRecords.reduce((sum, row) => sum + (row.minutes || 0), 0))}</strong>
        <strong>أيام تحتاج مراجعة: {filteredRecords.filter(row => row.minutes === null).length}</strong>
        <p className="w-full text-xs text-slate-600">المدة من أول حضور إلى آخر انصراف، وتشمل الفواصل بين الفترات. البصمات الوسيطة والمكررة مستبعدة من الحساب، والسجلات الناقصة لا تدخل في الإجمالي.</p>
      </div>
      {/* Records List Log */}
      <div className="bg-white border border-sky-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right text-xs">
            <thead>
              <tr className="bg-sky-50 text-slate-700 font-bold border-b border-sky-100">
                <th className="p-3 font-extrabold">التاريخ</th>
                <th className="p-3 font-extrabold">الموظف</th>
                <th className="p-3 font-extrabold">القسم</th>
                <th className="p-3 font-extrabold">الحالة</th>
                <th className="p-3 font-extrabold">الحضور</th>
                <th className="p-3 font-extrabold">الانصراف</th>
                <th className="p-3 font-extrabold">مدة العمل</th>
                <th className="p-3 font-extrabold">مكان البصمة</th>
                <th className="p-3 font-extrabold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec) => {
                const deptObj = departments.find((d) => d.id === rec.dept);

                return (
                  <tr key={rec.id} className="border-b last:border-0 hover:bg-sky-50/20 text-slate-700 text-xs">
                    <td className="p-3 font-bold">{rec.date}<div className="text-slate-400 mt-1">{new Date(rec.date + 'T12:00:00').toLocaleDateString('ar-SA', { weekday: 'long' })}</div></td>
                    <td className="p-3 font-black text-slate-800">{rec.empName}</td>
                    <td className="p-3 text-slate-500 font-medium">{deptObj ? deptObj.name : rec.dept}</td>
                    <td className="p-3">
                      {rec.minutes !== null ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2.5 py-0.5 font-extrabold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {rec.reportStatus}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-0.5 font-extrabold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {rec.reportStatus}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-emerald-600">{formatPunch(rec.first)}</td>
                    <td className="p-3 text-slate-600 font-bold">{formatPunch(rec.last)}</td>
                    <td className="p-3 font-extrabold text-sky-600">{formatMinutes(rec.minutes)}<div className="text-[10px] text-slate-400 mt-1">{rec.ignored} بصمة وسيطة / مكررة مستبعدة</div></td>
                    <td className="p-3">
                      <div className="text-xs">حضور: {rec.first?.location || 'غير مسجل'}</div>
                      <div className="text-xs text-slate-500 mt-1">انصراف: {rec.last?.location || 'غير مسجل'}</div>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          requestConfirm('هل تريد تأكيد حذف جميع سجلات الموظف لهذا اليوم؟', async () => {
                            for (const id of rec.ids) await onDeleteRecord(id);
                          });
                        }}
                        className="p-1 hover:bg-rose-50 text-rose-500 rounded transition-all"
                        title="حذف السجل"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 font-medium">
                    لا توجد سجلات حضور صالحة للمواصفات المحددة حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
