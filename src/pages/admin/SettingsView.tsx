import AttendanceLocationsEditor from '../../components/AttendanceLocationsEditor';
import { useState, useEffect, type ChangeEvent } from 'react';
import {
  Building2, UploadCloud, X, Crosshair, Key, Save, Shield, Plus, Edit, Trash2, UserCheck,
} from 'lucide-react';

interface SettingsViewProps {
  admin: any;
  appSettings: any;
  onUpdateSettings: (settings: any) => Promise<boolean>;
  employees: any[];
  departments: any[];
  appData: any;
  companyId: string;
  requestConfirm: (msg: string, onConfirm: () => void) => void;

  companySettingsName: string;
  setCompanySettingsName: (v: string) => void;
  handleLogoUpload: (e: ChangeEvent<HTMLInputElement>) => void;

  handleDetectGPS: () => void;
  geoSettingStatus: string;

  settingsNewPwd: string;
  setSettingsNewPwd: (v: string) => void;
  settingsConfirmPwd: string;
  setSettingsConfirmPwd: (v: string) => void;
  settingsPwdMsg: string;
  handleUpdatePassword: () => void;

  subAdmins: any[];
  subAdminsLoading: boolean;
  onAddSubAdmin: () => void;
  onEditSubAdmin: (item: any) => void;
  onDeleteSubAdmin: (id: string) => Promise<void>;

  registrationRequests: any[];
  onApproveRegistration: (item: any) => Promise<void>;
  onRejectRegistration: (item: any) => Promise<void>;
}

const PERMISSION_LABELS: Record<string, string> = {
  canEditSchedule: '📅 الجداول',
  canManageEmployees: '👥 الموظفين',
  canManageDepts: '🏢 الأقسام',
  canApproveRequests: '✅ الاعتمادات',
  canViewReports: '📊 التقارير',
  canManageSettings: '⚙️ الإعدادات',
  canPrint: '🖨️ الطباعة',
};

export default function SettingsView({
  admin,
  appSettings,
  onUpdateSettings,
  requestConfirm,
  companySettingsName,
  setCompanySettingsName,
  handleLogoUpload,
  handleDetectGPS,
  geoSettingStatus,
  settingsNewPwd,
  setSettingsNewPwd,
  settingsConfirmPwd,
  setSettingsConfirmPwd,
  settingsPwdMsg,
  handleUpdatePassword,
  subAdmins,
  subAdminsLoading,
  onAddSubAdmin,
  onEditSubAdmin,
  onDeleteSubAdmin,
  registrationRequests,
  onApproveRegistration,
  onRejectRegistration,
}: SettingsViewProps) {
  const [geoDraft, setGeoDraft] = useState(appSettings?.officeLocation || {});
  const [geoDirty, setGeoDirty] = useState(false);
  const [geoSaving, setGeoSaving] = useState(false);
  useEffect(() => {
    if (!geoDirty) setGeoDraft(appSettings?.officeLocation || {});
  }, [appSettings?.officeLocation, geoDirty]);
  const updateGeoDraft = (next: any) => { setGeoDirty(true); setGeoDraft(next); };
  const pendingRegs = registrationRequests.filter((r) => r.status === 'pending');

  return (
    <div className="flex flex-col gap-6">
      {/* Company Info section */}
      <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
        <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
          <Building2 size={16} className="text-sky-500" />
          <span>إعدادات الشركة واللوغو الرسمي</span>
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-600">اسم الشركة / المؤسسة</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={companySettingsName}
              onChange={(e) => setCompanySettingsName(e.target.value)}
              placeholder="مثال: شركة النجوم للاستقدام"
              className="px-3.5 py-2.5 text-xs border rounded-lg focus:outline-none flex-1 font-bold"
            />
            <button
              onClick={async () => {
                if (!await onUpdateSettings({ ...appSettings, companyName: companySettingsName })) return;
                alert('✅ تم تحديث اسم الشركة العام بنجاح.');
              }}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs shadow transition-all"
            >
              <Save size={13} />
              <span>حفظ الاسم</span>
            </button>
          </div>
        </div>

        <div className="pt-2">
          <label className="text-[11px] font-bold text-slate-600 block mb-2">لوجو الشركة العام</label>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => document.getElementById('logo-file-picker-input')?.click()}
              className="flex items-center gap-2 px-5 py-3 hover:bg-sky-50 border-2 border-dashed border-sky-100 hover:border-sky-300 rounded-xl text-slate-500 font-bold text-xs transition-all shadow-sm bg-sky-50 bg-opacity-30"
            >
              <UploadCloud size={16} className="text-sky-500" />
              <span>اضغط لرفع اللوجو (PNG أو JPG)</span>
            </button>
            <input type="file" id="logo-file-picker-input" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            {appSettings?.logoDataUrl && (
              <div className="relative pt-1">
                <img
                  src={appSettings.logoDataUrl}
                  alt="Company Logo Preview"
                  className="w-14 h-14 p-1 rounded-xl border object-contain bg-sky-50 shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => {
                    requestConfirm('هل تريد حذف الشعار الحالي؟', () => {
                      onUpdateSettings({ ...appSettings, logoDataUrl: '' });
                    });
                  }}
                  className="absolute -top-1 -left-1 p-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full transition-all"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Geo Fence check-in coordinates configuration */}
      <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
        <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
          <Crosshair size={16} className="text-sky-500 animate-pulse" />
          <span>موقع الشركة الجغرافي ونطاق الحضور</span>
        </h3>

        <div className="p-3.5 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800 leading-relaxed font-medium">
          📍 عند وضع إحداثيات GPS مقر الشركة وتحديد المسافة الجغرافية المعتمدة للبحث، سيمنع النظام الموظفين من البصمة إلا إذا كانوا داخل هذا النطاق المعتمد.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-600">خط العرض (Latitude)</label>
            <input
              type="number"
              step="any"
              value={geoDraft.lat ?? ''}
              onChange={(e) =>
                updateGeoDraft({ ...geoDraft, lat: e.target.value === '' ? '' : parseFloat(e.target.value) })
              }
              placeholder="مثال: 24.71360"
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-600">خط الطول (Longitude)</label>
            <input
              type="number"
              step="any"
              value={geoDraft.lng ?? ''}
              onChange={(e) =>
                updateGeoDraft({ ...geoDraft, lng: e.target.value === '' ? '' : parseFloat(e.target.value) })
              }
              placeholder="مثال: 46.67530"
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-600">نطاق البصمة المسموح (بالمتر)</label>
            <input
              type="number"
              value={geoDraft.radius ?? ''}
              onChange={(e) =>
                updateGeoDraft({ ...geoDraft, radius: e.target.value === '' ? '' : parseInt(e.target.value) })
              }
              className="px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-extrabold"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-sky-50 bg-opacity-30 p-3.5 rounded-xl border border-sky-100/50">
          <input
            type="checkbox"
            id="preventOutCheckout"
            checked={!!geoDraft.preventOutCheckout}
            onChange={(e) =>
              updateGeoDraft({ ...geoDraft, preventOutCheckout: e.target.checked })
            }
            className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
          />
          <label htmlFor="preventOutCheckout" className="text-xs font-extrabold text-slate-700 cursor-pointer select-none">
            🔒 تفعيل خدمة عدم تسجيل انصراف خارج الموقع (التحقق من بقاء الموظف ضمن النطاق المسموح جغرافياً عند تسجيل الانصراف)
          </label>
        </div>

        <div className="flex gap-2 flex-wrap items-center mt-1">
          <button
            onClick={() => {
              if (!navigator.geolocation) { alert('جهازك لا يدعم تحديد الموقع'); return; }
              navigator.geolocation.getCurrentPosition((pos) => {
                updateGeoDraft({ ...geoDraft, lat: pos.coords.latitude, lng: pos.coords.longitude });
              }, () => alert('تعذر تحديد الموقع. راجع إذن المتصفح.'), { enableHighAccuracy: true });
            }}
            className="flex items-center gap-1.5 px-4 py-2 border border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <Crosshair size={13} />
            <span>تحديد موقعي المباشر الحالي</span>
          </button>
          <button
            disabled={geoSaving}
            onClick={async () => {
              const { lat, lng, radius } = geoDraft;
              if (lat === '' || lng === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180 || !(Number(radius) > 0)) {
                alert('أدخل إحداثيات صحيحة ونطاقًا أكبر من صفر.'); return;
              }
              setGeoSaving(true);
              try {
                if (await onUpdateSettings({ ...appSettings, officeLocation: geoDraft })) {
                  setGeoDirty(false);
                  alert('✅ تم حفظ كافة إعدادات سياج البصمة بنجاح.');
                }
              } finally { setGeoSaving(false); }
            }}
            className="flex items-center gap-1.5 px-5 py-2 hover:bg-sky-700 bg-sky-600 text-white rounded-xl font-bold text-xs font-medium transition-all shadow-sm"
          >
            <span>حفظ التعديلات الجغرافية</span>
          </button>
        </div>

        {geoSettingStatus && (
          <div className="text-[11px] font-bold text-slate-600 bg-slate-50 border p-2.5 rounded-xl">{geoSettingStatus}</div>
        )}
      </div>

      <AttendanceLocationsEditor settings={appSettings} onSave={onUpdateSettings} />

      {/* General Admin Password updates */}
      <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
        <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
          <Key size={16} className="text-sky-500" />
          <span>تحديث الرمز السري للوحة التحكم العامة</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-600">رمز الدخول الجديد المطلوب</label>
            <input
              type="password"
              value={settingsNewPwd}
              onChange={(e) => setSettingsNewPwd(e.target.value)}
              placeholder="••••••"
              className="px-3 py-2.5 text-xs border rounded-lg focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-slate-600">تأكيد الرمز المطلوب</label>
            <input
              type="password"
              value={settingsConfirmPwd}
              onChange={(e) => setSettingsConfirmPwd(e.target.value)}
              placeholder="••••••"
              className="px-3 py-2.5 text-xs border rounded-lg focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={handleUpdatePassword}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-xs shadow transition-all"
          >
            <span>تحديث كلمة المرور</span>
          </button>
        </div>

        {settingsPwdMsg && (
          <div className="text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-100 p-2.5 rounded-xl text-center">
            {settingsPwdMsg}
          </div>
        )}
      </div>

      {/* Sub Admins CRUD queue */}
      {admin.role === 'superadmin' && (
        <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center pb-2 border-b">
            <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
              <Shield size={16} className="text-sky-500" />
              <span>إدارة المسؤولين والمدراء الفرعيين</span>
            </h3>
            <button
              onClick={onAddSubAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-[10px] shadow transition-all"
            >
              <Plus size={12} />
              <span>إضافة مسؤول فرعي</span>
            </button>
          </div>

          {subAdminsLoading ? (
            <div className="text-xs text-slate-400 py-3 text-center">جاري تحميل قائمة المسؤولين...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subAdmins.map((item) => (
                <div key={item.id} className="p-4 border rounded-xl bg-slate-50 flex justify-between items-start gap-3">
                  <div>
                    <div className="font-extrabold text-xs text-slate-800">{item.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.email || 'بدون بريد فرعي'}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {Object.entries(item.permissions || {})
                        .filter(([, val]) => val === true)
                        .map(([key]) => (
                          <span key={key} className="px-2 py-0.5 bg-sky-50 border border-sky-100 text-sky-700 rounded text-[9px] font-bold">
                            {PERMISSION_LABELS[key] || key}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onEditSubAdmin(item)}
                      className="p-1.5 hover:bg-sky-50 text-sky-600 rounded transition-all"
                      title="تعديل بيانات المسؤول"
                    >
                      <Edit size={13} />
                    </button>

                    <button
                      onClick={() => onDeleteSubAdmin(item.id)}
                      className="p-1.5 hover:bg-rose-50 text-rose-500 rounded transition-all"
                      title="حذف المسؤول"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Registration Request inbox queues */}
      {admin.role === 'superadmin' && (
        <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 border-b pb-2">
            <UserCheck size={16} className="text-sky-500" />
            <span>طلبات التسجيل المعلقة بانتظار الاعتماد</span>
          </h3>

          <div className="flex flex-col gap-3">
            {pendingRegs.map((it) => (
              <div key={it.id} className="p-4 border rounded-xl bg-slate-50 flex justify-between items-center text-xs flex-wrap gap-2">
                <div>
                  <div className="font-extrabold text-slate-800 text-xs">👤 الاسم: {it.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    النوع: <strong className="font-bold text-sky-700">{it.type === 'employee' ? 'موظف' : 'مسؤول فرعي'}</strong> | الجوال/الهاتف:{' '}
                    <strong className="font-bold">{it.phone}</strong>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onApproveRegistration(it)}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-[10px] font-bold"
                  >
                    قبول واعتماد
                  </button>
                  <button
                    onClick={() => onRejectRegistration(it)}
                    className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded text-[10px] font-bold"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}

            {pendingRegs.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                لا توجد حالياً طلبات تسجيل حسابات جديدة في الانتظار.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
