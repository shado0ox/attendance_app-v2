import { useState, useEffect, useRef } from 'react';
import { Loader, Key, X, AlertCircle, Smartphone } from 'lucide-react';

import LoginScreen from './components/LoginScreen';
import AdminPortal from './components/AdminPortal';
import EmployeePortal from './components/EmployeePortal';

// Default initial datasets to seed if Firestore is blank
const defaultDepartments = [
  { id: 'dept1', name: 'استقدام', needsMorning: true, needsEvening: true, friday: 'off' },
  { id: 'dept2', name: 'ايجار', needsMorning: true, needsEvening: true, friday: 'off' },
  { id: 'dept3', name: 'كول سنتر', needsMorning: true, needsEvening: true, friday: 'partial' }
];

const defaultShiftTypes = [
  { id: 'S', name: 'صباحي', start: '07:00', end: '15:00', type: 'morning' },
  { id: 'E', name: 'مسائي', start: '15:00', end: '23:00', type: 'evening' },
  { id: 'D', name: 'كامل (صباحي + مسائي)', start: '08:00', end: '22:00', type: 'double' }
];

const defaultEmployees = [
  { id: 'e1', name: 'امجد', dept: 'dept1', phone: '966501234567', username: 'amjad', color: '#01696f' },
  { id: 'e2', name: 'منار', dept: 'dept1', phone: '966501234568', username: 'manar', color: '#0891b2' },
  { id: 'e3', name: 'روان', dept: 'dept1', phone: '966501234569', username: 'rawan', color: '#7c3aed' },
  { id: 'e4', name: 'احلام', dept: 'dept2', phone: '966501234570', username: 'ahlam', color: '#be185d' },
  { id: 'e5', name: 'علي احمد', dept: 'dept2', phone: '966501234571', username: 'ali_ahmad', color: '#dc2626' },
  { id: 'e6', name: 'شروق', dept: 'dept2', phone: '966501234572', username: 'shorouk', color: '#d97706' },
  { id: 'e7', name: 'صفا', dept: 'dept3', phone: '966501234573', username: 'safa', color: '#065f46' },
  { id: 'e8', name: 'مريم', dept: 'dept3', phone: '966501234574', username: 'maryam', color: '#2563eb' },
  { id: 'e9', name: 'نور', dept: 'dept3', phone: '966501234575', username: 'nour', color: '#01696f' }
];

const defaultSchedule: any = {};
// Pre-populate June 2026 shifts
const june = '2026-06';
const empShifts: any = {
  e1: { type: 'S', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] },
  e2: { type: 'S', workDays: [6, 7, 9, 10, 11, 13, 14, 16, 17, 18] },
  e3: { type: 'S', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] },
  e4: { type: 'S', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] },
  e5: { type: 'E', workDays: [7, 8, 9, 10, 11, 14, 15, 16, 17, 18] },
  e6: { type: 'E', workDays: [6, 7, 8, 10, 11, 13, 14, 15, 17, 18] },
  e7: { type: 'E', workDays: [7, 8, 9, 10, 11, 14, 15, 16, 17, 18] },
  e8: { type: 'S', workDays: [6, 7, 9, 10, 13, 14, 16, 17, 19, 20, 22, 23] },
  e9: { type: 'E', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] }
};

for (const [empId, cfg] of Object.entries(empShifts)) {
  for (let day = 1; day <= 30; day++) {
    const dateStr = `${june}-${String(day).padStart(2, '0')}`;
    if (!defaultSchedule[dateStr]) defaultSchedule[dateStr] = {};
    if ((cfg as any).workDays.includes(day)) {
      defaultSchedule[dateStr][empId] = { shiftType: (cfg as any).type, note: '' };
    } else {
      defaultSchedule[dateStr][empId] = { shiftType: 'A', note: '' };
    }
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [appData, setAppData] = useState<any>({
    departments: defaultDepartments,
    employees: defaultEmployees,
    shiftTypes: defaultShiftTypes,
    schedule: defaultSchedule
  });

  const [appSettings, setAppSettings] = useState<any>({
    password: '5198',
    companyName: 'نظام الدوام',
    officeLocation: { lat: 24.7136, lng: 46.6753, radius: 150 }
  });

  const [registrationRequests, setRegistrationRequests] = useState<any[]>([]);
  const [session, setSession] = useState<{ role: 'superadmin' | 'admin' | 'employee' | null; info: any }>({
    role: null,
    info: null
  });

  // Change Password state
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePwdMsg, setChangePwdMsg] = useState('');
  const [changePwdLoading, setChangePwdLoading] = useState(false);

  // Custom Confirm state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  });

  const requestConfirm = (message: string, onConfirm: () => void) => {
    setConfirmState({
      isOpen: true,
      message,
      onConfirm
    });
  };

  // PWA & Mobile Installation Prompt helpers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobile = /android|iphone|ipad|ipod|windows phone/i.test(userAgent);
    setIsMobileDevice(isMobile);

    const handleBeforeInstallOption = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('pwa_banner_dismissed_v2');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallOption);

    // If standalone display mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBanner(false);
    }

    const dismissed = localStorage.getItem('pwa_banner_dismissed_v2');
    if (isMobile && !dismissed) {
      setShowInstallBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallOption);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('PWA installation accepted by user');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const dismissInstallBanner = () => {
    localStorage.setItem('pwa_banner_dismissed_v2', 'true');
    setShowInstallBanner(false);
  };

  useEffect(() => {
    // 1. Fetch mainData from PostgreSQL API
    const fetchMainData = async () => {
      try {
        const response = await fetch('/api/main-data');
        if (!response.ok) {
          throw new Error(`API Handshake failed: Server returned status ${response.status} (${response.statusText})`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Invalid response format. Expected JSON, got: ${text.substring(0, 100)}...`);
        }

        const data = await response.json();
        setAppData({
          departments: data.departments || defaultDepartments,
          employees: data.employees || defaultEmployees,
          shiftTypes: data.shiftTypes || defaultShiftTypes,
          schedule: data.schedule || defaultSchedule
        });
        if (data.settings) {
          setAppSettings(data.settings);
        }
        localStorage.setItem('schedule_mainData', JSON.stringify(data));
      } catch (err: any) {
        console.error('[API Error] Failed to fetch main-data from backend:', err.message || err);
        const cached = localStorage.getItem('schedule_mainData');
        if (cached) {
          try {
            console.log('[Cache Fallback] Loading application data from local storage cache.');
            const data = JSON.parse(cached);
            setAppData({
              departments: data.departments || defaultDepartments,
              employees: data.employees || defaultEmployees,
              shiftTypes: data.shiftTypes || defaultShiftTypes,
              schedule: data.schedule || defaultSchedule
            });
            if (data.settings) {
              setAppSettings(data.settings);
            }
          } catch (e) {
            console.error('Error parsing cached data:', e);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    // 2. Fetch registration requests from PostgreSQL API
    const fetchRegRequests = async () => {
      try {
        const response = await fetch('/api/registration-requests');
        if (!response.ok) {
          throw new Error(`API Handshake failed: Server returned status ${response.status} (${response.statusText})`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Invalid response format. Expected JSON, got: ${text.substring(0, 100)}...`);
        }

        const data = await response.json();
        setRegistrationRequests(data);
      } catch (err: any) {
        console.error('[API Error] Failed to fetch registration requests:', err.message || err);
      }
    };

    // Initial fetches
    fetchMainData();
    fetchRegRequests();

    // Set up polling intervals to maintain real-time sync
    const mainDataInterval = setInterval(fetchMainData, 5000);
    const regRequestsInterval = setInterval(fetchRegRequests, 5000);

    // 3. Keep local sessions on reload
    const storedSession = localStorage.getItem('app_session');
    if (storedSession) {
      try {
        setSession(JSON.parse(storedSession));
      } catch (e) {}
    }

    return () => {
      clearInterval(mainDataInterval);
      clearInterval(regRequestsInterval);
    };
  }, []);

  const handleUpdateSettings = async (nextSettings: any) => {
    setAppSettings(nextSettings);
    try {
      await fetch('/api/main-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...appData, settings: nextSettings, updatedAt: Date.now() })
      });
    } catch (e) {
      console.error('Failed to update settings in PostgreSQL:', e);
    }
  };

  const handleUpdateAppData = async (nextData: any) => {
    setAppData(nextData);
    try {
      await fetch('/api/main-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nextData, settings: appSettings, updatedAt: Date.now() })
      });
    } catch (e) {
      console.error('Failed to update app data in PostgreSQL:', e);
    }
  };

  const persistSession = (role: 'superadmin' | 'admin' | 'employee' | null, info: any) => {
    const s = { role, info };
    setSession(s);
    if (role === null) {
      localStorage.removeItem('app_session');
    } else {
      localStorage.setItem('app_session', JSON.stringify(s));
    }
  };

  const handleEmployeeLoginSuccess = (emp: any) => {
    persistSession('employee', emp);
  };

  const handleAdminLoginSuccess = (adm: any) => {
    persistSession(adm.role, adm);
  };

  const handleLogout = () => {
    requestConfirm('هل تريد تأكيد تسجيل الخروج وتأمين المنصة؟', () => {
      persistSession(null, null);
    });
  };

  const handleOpenChangePassword = () => {
    setNewPassword('');
    setConfirmPassword('');
    setChangePwdMsg('');
    setChangePwdOpen(true);
  };

  const executeChangePassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      setChangePwdMsg('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePwdMsg('تأكيد كلمة المرور غير متطابق');
      return;
    }

    setChangePwdLoading(true);
    setChangePwdMsg('');

    try {
      if (session.role === 'employee') {
        const nextEmployees = appData.employees.map((emp: any) => {
          if (emp.id === session.info.id) {
            return { ...emp, password: newPassword };
          }
          return emp;
        });
        await handleUpdateAppData({ ...appData, employees: nextEmployees });
        
        const updatedSession = { ...session, info: { ...session.info, password: newPassword } };
        setSession(updatedSession);
        localStorage.setItem('app_session', JSON.stringify(updatedSession));
        
        setChangePwdMsg('✅ تم تحديث كلمة المرور لحسابك بنجاح!');
        setTimeout(() => setChangePwdOpen(false), 2000);
      } else if (session.role === 'admin') {
        const response = await fetch('/api/admins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: session.info.id,
            name: session.info.name,
            username: session.info.username,
            password: newPassword
          })
        });
        if (!response.ok) {
          throw new Error('فشل تحديث كلمة المرور في الخادم');
        }
        
        const updatedSession = { ...session, info: { ...session.info, password: newPassword } };
        setSession(updatedSession);
        localStorage.setItem('app_session', JSON.stringify(updatedSession));
        
        setChangePwdMsg('✅ تم تحديث كلمة المرور لحسابك الإداري الفرعي بنجاح!');
        setTimeout(() => setChangePwdOpen(false), 2000);
      } else if (session.role === 'superadmin') {
        await handleUpdateSettings({ ...appSettings, password: newPassword });
        
        const updatedSession = { ...session, info: { ...session.info, password: newPassword } };
        setSession(updatedSession);
        localStorage.setItem('app_session', JSON.stringify(updatedSession));
        
        setChangePwdMsg('✅ تم تحديث كلمة المرور الرئيسية للمدير العام بنجاح!');
        setTimeout(() => setChangePwdOpen(false), 2000);
      } else {
        setChangePwdMsg('⚠️ لا يمكن العثور على جلسة تسجيل الدخول الحالية.');
      }
    } catch (err: any) {
      setChangePwdMsg('فشل الإجراء: ' + err.message);
    } finally {
      setChangePwdLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-sky-50 gap-4">
        <Loader size={36} className="animate-spin text-sky-600" />
        <span className="text-xs font-bold text-slate-500 font-tajawal">جاري الاتصال والتحقق من مزامنة قاعدة البيانات...</span>
      </div>
    );
  }

  return (
    <div dir="rtl" className="font-tajawal text-slate-800 transition-all select-none">
      
      {/* 1. Login Authentication View */}
      {session.role === null ? (
        <LoginScreen
          appSettings={appSettings}
          onAdminLogin={handleAdminLoginSuccess}
          onEmployeeLogin={handleEmployeeLoginSuccess}
          employees={appData.employees}
        />
      ) : session.role === 'employee' ? (
        
        /* 2. Employee Personal View */
        <EmployeePortal
          employee={session.info}
          appSettings={appSettings}
          departments={appData.departments}
          employees={appData.employees}
          shiftTypes={appData.shiftTypes}
          schedule={appData.schedule}
          onLogout={handleLogout}
          onOpenChangePassword={handleOpenChangePassword}
        />
      ) : (
        
        /* 3. Managers Dashboard Control */
        <AdminPortal
          admin={session.info}
          appSettings={appSettings}
          appData={appData}
          departments={appData.departments}
          employees={appData.employees}
          shiftTypes={appData.shiftTypes}
          schedule={appData.schedule}
          onLogout={handleLogout}
          onUpdateSettings={handleUpdateSettings}
          onUpdateAppData={handleUpdateAppData}
          registrationRequests={registrationRequests}
        />
      )}

      {/* Shared Change Password Modal across panels */}
      {changePwdOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-sky-100 flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="text-sm font-extrabold text-slate-800">تغيير كلمة المرور الخاصة بحسابك</h3>
              <button onClick={() => setChangePwdOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600">تأكيد كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              {changePwdMsg && (
                <div className="p-2.5 text-[11px] font-bold text-slate-600 bg-slate-50 border rounded-xl flex gap-1 items-start shadow-sm">
                  <AlertCircle size={14} className="mt-0.5 text-sky-500" />
                  <span>{changePwdMsg}</span>
                </div>
              )}

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setChangePwdOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={executeChangePassword}
                  disabled={changePwdLoading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  {changePwdLoading ? 'جاري التحميل...' : 'حفظ ونقذ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-full">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 mt-2">تأكيد الإجراء</h3>
              <p className="text-xs text-slate-500 mt-1">{confirmState.message}</p>
            </div>

            <div className="flex gap-2 justify-center mt-2 pt-2 border-t text-xs">
              <button
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 hover:bg-slate-100 border rounded-lg text-slate-500 font-bold w-1/2"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  setConfirmState(prev => ({ ...prev, isOpen: false }));
                  confirmState.onConfirm();
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold w-1/2"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA Mobile Installation First-Time Banner */}
      {showInstallBanner && (
        <div className="fixed bottom-4 left-4 right-4 z-[999] p-4 bg-white border border-sky-100 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in text-right max-w-lg mx-auto" dir="rtl">
          <div className="flex gap-3 items-center">
            {appSettings?.logoDataUrl ? (
              <img 
                src={appSettings.logoDataUrl} 
                alt="Logo" 
                className="w-12 h-12 object-contain rounded-xl bg-slate-50 p-1 border shadow-xs flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-sky-600/10 flex items-center justify-center text-sky-600 text-lg flex-shrink-0">
                <Smartphone size={24} />
              </div>
            )}
            <div>
              <h4 className="text-xs font-bold text-slate-800">تثبيت تطبيق {appSettings?.companyName || 'نظام الدوام'}</h4>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                تصفح أسرع، استهلاك أقل للبيانات، ووصول مباشر لجدولك والدخول للشاشة الرئيسية!
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            {deferredPrompt ? (
              <button
                onClick={handleInstallApp}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-[10px] font-bold shadow-sm transition-all whitespace-nowrap"
              >
                تثبيت التطبيق
              </button>
            ) : (
              <div className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl whitespace-nowrap">
                📲 للآيفون: اضغط "مشاركة" ثم "إضافة للشاشة الرئيسية"
              </div>
            )}
            <button
              onClick={dismissInstallBanner}
              className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl"
              title="إغلاق التنبيه"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
