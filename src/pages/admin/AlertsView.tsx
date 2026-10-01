import { useState } from 'react';
import { Check, Trash2, AlertTriangle } from 'lucide-react';

interface AlertsViewProps {
  appSettings: any;
  scheduleMonth: string;
  getShiftGaps: () => any[];
  toggleAlertRead: (id: string) => void;
  dismissAlert: (id: string) => void;
  dismissAllAlerts: (ids: string[]) => void;
  markAllAlertsAsRead: (ids: string[]) => void;
  onUpdateSettings: (settings: any) => void;
  requestConfirm: (msg: string, onConfirm: () => void) => void;
}

export default function AlertsView({
  appSettings,
  scheduleMonth,
  getShiftGaps,
  toggleAlertRead,
  dismissAlert,
  dismissAllAlerts,
  markAllAlertsAsRead,
  onUpdateSettings,
  requestConfirm,
}: AlertsViewProps) {
  const [showRead, setShowRead] = useState(false);
  const allGaps = getShiftGaps();
  const unreadGaps = allGaps.filter((g) => !(appSettings.readAlerts || []).includes(g.id));

  return (
    <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4 text-right animate-fade-in" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-extrabold text-slate-800 text-sm">تنبيهات نقص التغطية الجارية لشهر {scheduleMonth}</h3>
          <p className="text-[10px] text-slate-400 mt-1">يتم الكشف التلقائي عن الأيام التي لا يوجد بها موظفون معينون في الشيفتات.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {unreadGaps.length > 0 && (
            <button
              onClick={() => markAllAlertsAsRead(unreadGaps.map((g) => g.id))}
              className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-[10px] font-extrabold transition-all border border-sky-200/50 flex items-center gap-1"
            >
              <Check size={12} className="text-sky-600" />
              <span>تحديد الكل كمقروء</span>
            </button>
          )}

          {allGaps.length > 0 && (
            <button
              onClick={() => {
                requestConfirm('هل أنت متأكد من رغبتك في حذف جميع التنبيهات الحالية؟', () => {
                  dismissAllAlerts(allGaps.map((g) => g.id));
                });
              }}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-extrabold transition-all border border-rose-200/50 flex items-center gap-1"
            >
              <Trash2 size={12} className="text-rose-600" />
              <span>حذف كافة التنبيهات</span>
            </button>
          )}

          {((appSettings.readAlerts || []).length > 0 || (appSettings.deletedAlerts || []).length > 0) && (
            <button
              onClick={() => onUpdateSettings({ ...appSettings, readAlerts: [], deletedAlerts: [] })}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1"
            >
              <span>إعادة تعيين الكل</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setShowRead(false)} className={`px-3 py-2 rounded-lg ${!showRead ? 'bg-sky-100 text-sky-800' : 'bg-slate-50'}`}>غير مقروءة ({unreadGaps.length})</button>
        <button type="button" onClick={() => setShowRead(true)} className={`px-3 py-2 rounded-lg ${showRead ? 'bg-sky-100 text-sky-800' : 'bg-slate-50'}`}>كل التنبيهات ({allGaps.length})</button>
      </div>
      <p className="text-xs text-slate-500">تُحسب التغطية حسب نوع الشيفت (صباحي / مسائي / مزدوج)، وتشمل الشيفتات المضافة حديثاً. الجمعة العادية تُفحص مثل باقي الأيام.</p>
      <div className="flex flex-col gap-3">
        {(showRead ? allGaps : unreadGaps).map((g) => {
          const isRead = (appSettings.readAlerts || []).includes(g.id);
          return (
            <div
              key={g.id}
              className={`p-4 border rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs transition-all duration-200 ${
                isRead
                  ? 'bg-slate-50/70 border-slate-200 text-slate-400 opacity-70'
                  : 'bg-amber-50/50 border-amber-100 text-amber-900 shadow-xs'
              }`}
            >
              <div className="flex gap-3 text-right">
                <AlertTriangle size={16} className={`mt-0.5 flex-shrink-0 ${isRead ? 'text-slate-400' : 'text-amber-600 animate-pulse'}`} />
                <div>
                  <span className={`font-extrabold text-[13px] block mb-0.5 ${isRead ? 'text-slate-500' : 'text-slate-800'}`}>{g.dept}</span>
                  تاريخ النقص: <strong className="font-extrabold font-mono text-slate-700">{g.date}</strong> —{' '}
                  <span className={isRead ? 'text-slate-400' : 'text-amber-800'}>{g.msg}</span>
                </div>
              </div>

              <div className="flex gap-2 self-end sm:self-center">
                <button
                  onClick={() => toggleAlertRead(g.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 flex-shrink-0 ${
                    isRead
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                      : 'bg-white hover:bg-slate-100 text-amber-800 border border-amber-200 shadow-xs'
                  }`}
                >
                  {isRead ? 'تحديد كغير مقروء' : 'تعليم كمقروء'}
                </button>

                <button
                  onClick={() => dismissAlert(g.id)}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-100 transition-all flex-shrink-0"
                  title="حذف التنبيه"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(showRead ? allGaps : unreadGaps).length === 0 && (
        <div className="py-12 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          {allGaps.length === 0 ? 'لا توجد تنبيهات نقص تغطية حالياً.' : 'كل التنبيهات الحالية مقروءة؛ يمكنك عرضها من تبويب كل التنبيهات.'}
        </div>
      )}
    </div>
  );
}
