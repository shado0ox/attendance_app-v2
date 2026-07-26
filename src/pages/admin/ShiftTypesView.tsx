import { Plus } from 'lucide-react';

interface ShiftTypesViewProps {
  shiftTypes: any[];
  onAddNew: () => void;
  onEdit: (st: any) => void;
  onDelete: (id: string) => void;
}

function diffMinutes(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export default function ShiftTypesView({ shiftTypes, onAddNew, onEdit, onDelete }: ShiftTypesViewProps) {
  return (
    <div className="flex flex-col gap-5 text-right animate-fade-in" dir="rtl">
      <div className="flex justify-between items-center pb-2 border-b border-sky-100">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">إدارة أنواع وفترات ومدد الشيفتات</h3>
          <p className="text-[10px] text-slate-400 mt-1">
            قم بإدارة وتعيين فترات العمل اليومية المتوفرة للجدولة كشيفتات الصباح والمساء والليل.
          </p>
        </div>
        <button
          onClick={onAddNew}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
        >
          <Plus size={14} />
          <span>إضافة نوع شيفت جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(shiftTypes || []).map((st: any) => {
          const start2 = st.start2 || '17:00';
          const end2 = st.end2 || '21:00';
          let totalMins = diffMinutes(st.start, st.end);
          if (st.type === 'double') totalMins += diffMinutes(start2, end2);
          const hours = Math.floor(totalMins / 60);
          const mins = totalMins % 60;

          return (
            <div key={st.id} className="p-5 bg-white border border-sky-100 rounded-xl shadow-xs flex flex-col gap-4 hover:shadow-md transition-all">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 font-black flex items-center justify-center text-xs font-mono border border-sky-100 shadow-2xs">
                    {st.id}
                  </span>
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-xs">{st.name}</h4>
                    <div className="flex flex-col gap-1 mt-1">
                      {st.type === 'double' ? (
                        <>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-extrabold">
                            <span className="text-amber-600">🌅 الصباحية:</span>
                            <span>
                              {st.start} إلى {st.end}
                            </span>
                            <span className="text-[9px] bg-amber-50 text-amber-700 px-1 rounded-sm">
                              ({Math.round(diffMinutes(st.start, st.end) / 60)} س)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-extrabold">
                            <span className="text-indigo-600">🌙 المسائية:</span>
                            <span>
                              {start2} إلى {end2}
                            </span>
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1 rounded-sm">
                              ({Math.round(diffMinutes(start2, end2) / 60)} س)
                            </span>
                          </div>
                        </>
                      ) : (
                        <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-extrabold rounded-full max-w-max">
                          🕒 {st.start} إلى {st.end}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(st)}
                    className="px-2.5 py-1 hover:bg-sky-50 text-sky-600 border border-sky-100 rounded text-[10px] font-extrabold transition-all"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => onDelete(st.id)}
                    className="px-2.5 py-1 hover:bg-rose-50 text-rose-500 border border-transparent hover:border-rose-100 rounded text-[10px] font-extrabold transition-all"
                  >
                    حذف
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-semibold">
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-700">
                  نطاق الشيفت:{' '}
                  <span className="font-extrabold text-indigo-700">
                    {st.type === 'double' ? 'شيفت يجمع فترتين' : st.type === 'morning' ? 'دوام صباحي' : 'دوام مسائي / ليلي'}
                  </span>
                </div>
                <div className="p-2.5 bg-sky-50 border border-sky-100 rounded-lg text-sky-800">
                  المدة الإجمالية:{' '}
                  <span className="font-extrabold text-sky-600">{mins > 0 ? `${hours} س و ${mins} د` : `${hours} سَاعات`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
