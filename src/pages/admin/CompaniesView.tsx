import { Building2, Check, Plus } from 'lucide-react';

interface CompaniesViewProps {
  companiesList: any[];
  onAddNew: () => void;
  onExtendSubscription: (comp: any) => void;
  onToggleStatus: (comp: any) => void;
  onDeleteCompany: (compId: string) => void;
}

export default function CompaniesView({
  companiesList,
  onAddNew,
  onExtendSubscription,
  onToggleStatus,
  onDeleteCompany,
}: CompaniesViewProps) {
  const totalMonthlyRevenue = companiesList.reduce((acc, curr) => acc + (parseFloat(curr.monthlyFee) || 0), 0);
  const activeCount = companiesList.filter((c) => c.subscriptionStatus === 'active').length;

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-1">الشركات المسجلة</span>
            <strong className="text-xl font-extrabold text-slate-800 font-mono">{companiesList.length}</strong>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <Building2 size={20} />
          </div>
        </div>

        <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-1">الاشتراكات النشطة</span>
            <strong className="text-xl font-extrabold text-emerald-600 font-mono">{activeCount}</strong>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Check size={20} />
          </div>
        </div>

        <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-1">الإيراد المتوقع (شهرياً)</span>
            <strong className="text-xl font-extrabold text-sky-700 font-mono">
              {totalMonthlyRevenue} <span className="text-xs">ريال</span>
            </strong>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl font-bold">
            <span>ريال</span>
          </div>
        </div>
      </div>

      {/* Action and Companies List */}
      <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm">قائمة مساحات العمل والشركات المشتركة</h3>
            <p className="text-[10px] text-slate-400 mt-1">يمكنك إدارة الشركات وتوليد مساحات عمل مخصصة والتحكم بحالة اشتراك كل منها.</p>
          </div>
          <button
            onClick={onAddNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow transition-all"
          >
            <Plus size={14} />
            <span>تسجيل شركة جديدة</span>
          </button>
        </div>

        {companiesList.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            لا توجد شركات مسجلة باشتراك شهري حالياً. اضغط على زر تسجيل شركة جديدة للبدء.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companiesList.map((comp: any) => {
              const isExpired =
                comp.subscriptionStatus !== 'active' || (comp.subscriptionExpiresAt && new Date(comp.subscriptionExpiresAt) < new Date());

              return (
                <div key={comp.id} className="p-4 border rounded-xl bg-slate-50 border-slate-100 flex flex-col gap-3 justify-between">
                  <div>
                    {/* Company Header */}
                    <div className="flex items-center gap-3">
                      {comp.logoUrl ? (
                        <img
                          src={comp.logoUrl}
                          alt="Logo"
                          className="w-10 h-10 rounded-lg object-contain bg-white p-1 border"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-sky-600 text-white font-bold text-center flex items-center justify-center text-sm">
                          {comp.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h4 className="font-extrabold text-slate-800 text-xs">{comp.name}</h4>
                        <span className="text-[10px] text-sky-700 font-mono font-bold">مساحة العمل: /{comp.id}</span>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-dashed text-[10px] text-slate-500">
                      <div>
                        <span className="block text-slate-400">حساب المدير المسؤول:</span>
                        <span className="font-bold text-slate-700 font-mono">
                          {comp.adminUsername} / {comp.adminPassword}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-400">رمز الشركة (للتحقق):</span>
                        <span className="font-bold text-sky-700 font-mono">{comp.companyCode || '0'}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400">قيمة الاشتراك الشهري:</span>
                        <span className="font-bold text-slate-700">{comp.monthlyFee || '150'} ريال</span>
                      </div>
                      <div>
                        <span className="block text-slate-400">حالة الاشتراك:</span>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full font-bold text-[9px] mt-0.5 ${
                            comp.subscriptionStatus === 'suspended'
                              ? 'bg-slate-200 text-slate-600'
                              : isExpired
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {comp.subscriptionStatus === 'suspended' ? '⏳ موقوف مؤقتاً' : isExpired ? '⚠️ منتهي الصلاحية' : '✅ نشط وساري'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-400">تاريخ انتهاء الاشتراك:</span>
                        <span className="font-bold text-slate-700">
                          {comp.subscriptionExpiresAt ? new Date(comp.subscriptionExpiresAt).toLocaleDateString('ar-EG') : 'غير محدد'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 border-t pt-3 mt-1 text-[11px]">
                    <button
                      onClick={() => onExtendSubscription(comp)}
                      className="px-2.5 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded font-bold transition-all flex-1"
                    >
                      🗓️ تمديد 30 يوم
                    </button>
                    <button
                      onClick={() => onToggleStatus(comp)}
                      className="px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded font-bold transition-all flex-1"
                    >
                      {comp.subscriptionStatus === 'active' ? '❄️ تجميد' : '🔥 تفعيل'}
                    </button>
                    <button
                      onClick={() => onDeleteCompany(comp.id)}
                      className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded font-bold transition-all"
                      title="حذف مساحة العمل بالكامل"
                    >
                      🗑️ حذف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
