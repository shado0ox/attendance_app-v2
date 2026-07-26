interface RequestsViewProps {
  adminRequests: any[];
  requestsLoading: boolean;
  onReview: (requestId: string, decision: 'approved' | 'rejected') => void;
}

export default function RequestsView({ adminRequests, requestsLoading, onReview }: RequestsViewProps) {
  return (
    <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
      <h3 className="font-extrabold text-slate-800 text-sm mb-3">طلبات الإجازات والشيفتات الواردة</h3>

      {requestsLoading ? (
        <div className="py-8 text-center text-xs text-slate-400">جاري تحميل الطلبات الواردة...</div>
      ) : adminRequests.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">لا توجد طلبات معلقة بانتظار المراجعة.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {adminRequests.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';

            let typeLabel = 'طلب إجازة';
            if (req.type === 'shift_change') typeLabel = 'تغيير شيفت الدوام';
            if (req.type === 'swap') typeLabel = `تبديل شيفت مع ${req.swapWithEmpName}`;
            if (req.type === 'attendance_adjustment') typeLabel = 'تعديل لقطات البصمة';

            return (
              <div key={req.id} className="p-4 border border-sky-50 rounded-xl bg-slate-50/50 flex justify-between items-start flex-wrap gap-3 text-xs">
                <div>
                  <div className="font-extrabold text-slate-800 text-xs">👤 الموظف: {req.empName}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    نوع الطلب: <strong className="font-extrabold text-sky-700">{typeLabel}</strong> | التاريخ:{' '}
                    <strong className="font-extrabold">{req.date}</strong>
                    {req.type === 'attendance_adjustment' && (
                      <span className="block mt-1 bg-sky-50 text-sky-800 p-1.5 rounded border border-sky-100">
                        ⏱️ الفترات المطلوبة للبصمة: حضور{' '}
                        <strong className="font-black text-slate-900">({req.checkInTime || '-'})</strong> • انصراف{' '}
                        <strong className="font-black text-slate-900">({req.checkOutTime || '-'})</strong>
                      </span>
                    )}
                  </div>
                  {req.note && <div className="p-2 bg-white rounded mt-1.5 border leading-relaxed text-[11px]">{req.note}</div>}

                  {!isPending && (req.reviewedBy || req.reviewedAt) && (
                    <div className="mt-2 text-[10px] text-slate-600 bg-slate-100/60 p-2 border border-slate-200/50 rounded-lg flex items-center gap-2 flex-wrap">
                      <span>
                        👮 مراجع البوبة: <strong className="font-extrabold text-slate-900">{req.reviewedBy || 'المدير'}</strong>
                      </span>
                      <span className="text-slate-300">|</span>
                      <span>
                        وقت الإجراء: <strong className="font-extrabold text-slate-700">{req.reviewedAt}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`px-3 py-1 rounded-full font-bold text-[9px] ${
                      isPending
                        ? 'bg-amber-100 text-amber-800'
                        : isApproved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {isPending ? '⏳ قيد المراجع' : isApproved ? '✅ معتمد مقبولة' : '❌ مرفوض'}
                  </span>

                  {isPending && (
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => onReview(req.id, 'approved')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-all"
                      >
                        قبول واعتماد
                      </button>
                      <button
                        onClick={() => onReview(req.id, 'rejected')}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold transition-all"
                      >
                        رفض
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
