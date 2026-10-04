import { getEmployeeLocations } from '../../lib/attendanceLocations';
import { Plus, MessageCircle } from 'lucide-react';

interface EmployeesViewProps {
  onSendWelcome: (id: string) => void;
  welcomeBusy: boolean;
  employees: any[];
  departments: any[];
  appSettings?: any;
  onAddNew: () => void;
  onEdit: (emp: any) => void;
  onDelete: (empId: string) => void;
  onOpenWhatsApp: (empId: string) => void;
}

export default function EmployeesView({ onSendWelcome, welcomeBusy, employees, departments, appSettings, onAddNew, onEdit, onDelete, onOpenWhatsApp }: EmployeesViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-extrabold text-slate-800">قائمة بطاقات وموظفو الدوام</h3>
        <button
          onClick={onAddNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
        >
          <Plus size={14} />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {employees.map((emp) => {
          const empDept = departments.find((d) => d.id === emp.dept);
          return (
            <div
              key={emp.id}
              className="p-5 bg-white border border-sky-100 rounded-xl shadow-sm flex flex-col gap-3 relative overflow-hidden text-right"
              dir="rtl"
            >
              <div className="absolute top-0 right-0 w-2.5 h-full" style={{ backgroundColor: emp.color }}></div>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-10 h-10 text-sm font-black text-white rounded-full shadow-sm"
                  style={{ backgroundColor: emp.color }}
                >
                  {emp.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-800 text-xs text-right">{emp.name}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">{empDept ? empDept.name : 'بدون فرع'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-[10px] text-slate-500 font-medium">
                <div>
                  البريد: <strong>{emp.email || 'غير مسجل'}</strong><br />
                  الجوال/واتساب: <strong className="font-extrabold text-slate-700">{emp.phone || 'غير مسجل'}</strong>
                </div>
                <div>
                  مواقع البصمة: <strong className="font-extrabold text-sky-700">{emp.restrictAttendanceLocations
                    ? (getEmployeeLocations(appSettings, emp).map(site => site.name).join('، ') || 'لا توجد مواقع مفعّلة مسموحة')
                    : 'كل مواقع الشركة المفعّلة'}</strong>
                </div>
                <div>
                  حساب البوابة: <strong className="font-extrabold text-slate-700">{emp.username || 'غير مسجل'}</strong>
                </div>
                <div>
                  الرمز السري: <strong className="font-extrabold text-emerald-600">{emp.password || '123456'}</strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 justify-end mt-2 pt-2 border-t text-[10px]">
                {emp.email && <button disabled={welcomeBusy} onClick={() => onSendWelcome(emp.id)} className="px-2.5 py-1 text-teal-700 disabled:opacity-50">{welcomeBusy ? 'جارٍ إرسال البريد…' : 'رسالة الترحيب / إعادة المحاولة'}</button>}
                <button
                  onClick={() => onOpenWhatsApp(emp.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-sky-600 hover:bg-sky-50 rounded font-bold"
                >
                  <MessageCircle size={12} />
                  <span>إرسال الجدول</span>
                </button>

                <button onClick={() => onEdit(emp)} className="px-2.5 py-1 hover:bg-slate-50 text-slate-500 rounded font-bold">
                  تعديل
                </button>

                <button onClick={() => onDelete(emp.id)} className="px-2.5 py-1 hover:bg-rose-50 text-rose-500 rounded font-bold">
                  حذف
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
