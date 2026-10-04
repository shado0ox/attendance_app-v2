import DepartmentBadge from '../../components/DepartmentBadge';
import { Plus } from 'lucide-react';

interface DepartmentsViewProps {
  departments: any[];
  employees: any[];
  onAddNew: () => void;
  onEdit: (dept: any) => void;
  onDelete: (deptId: string) => void;
}

export default function DepartmentsView({ departments, employees, onAddNew, onEdit, onDelete }: DepartmentsViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center pb-2 border-b">
        <h3 className="text-sm font-extrabold text-slate-800">إدارة الأقسام والشيفتات النشطة</h3>
        <button
          onClick={onAddNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
        >
          <Plus size={14} />
          <span>إضافة قسم جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {departments.map((dept) => {
          const deptEmps = employees.filter((e) => e.dept === dept.id);
          return (
            <div key={dept.id} className="p-5 bg-white border border-sky-100 rounded-xl shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm"><DepartmentBadge department={dept} /></h4>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-extrabold rounded-full">
                    📋 {deptEmps.length} موظف نشط
                  </span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => onEdit(dept)} className="p-1 hover:bg-slate-50 text-slate-500 rounded">
                    تعديل
                  </button>
                  <button onClick={() => onDelete(dept.id)} className="p-1 hover:bg-rose-50 text-rose-500 rounded">
                    حذف
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                <div className={`p-2 rounded-lg ${dept.needsMorning ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                  صباحي: {dept.needsMorning ? 'مطلوب' : 'لا'}
                </div>
                <div className={`p-2 rounded-lg ${dept.needsEvening ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>
                  مسائي: {dept.needsEvening ? 'مطلوب' : 'لا'}
                </div>
                <div className="p-2 rounded-lg bg-rose-50 text-rose-700">
                  الجمعة: {dept.friday === 'off' ? 'إجازة' : dept.friday === 'partial' ? 'دوام جزئي' : 'عادي'}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {deptEmps.map((emp) => (
                  <span key={emp.id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                    👤 {emp.name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
