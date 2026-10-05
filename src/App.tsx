import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Loader, Key, X, AlertCircle, Smartphone } from 'lucide-react';

import LoginScreen from './components/LoginScreen';
import AdminPortal from './components/AdminPortal';
import SystemUpdateNotice from './components/SystemUpdateNotice';
import EmployeePortal from './components/EmployeePortal';
import { SESSION_EXPIRED_EVENT } from './lib/authFetch';

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

  const serverVersions = useRef<Record<string, string>>({});
  const conflictCompanies = useRef(new Set<string>());
  const [saveConflict, setSaveConflict] = useState(false);
  const dataRef = useRef(appData);
  const settingsRef = useRef(appSettings);
  const companyRef = useRef(localStorage.getItem('app_company_id') || 'default');
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const revision = useRef(0);
  const unsaved = useRef(false);
  const refreshMainData = useRef<() => Promise<boolean>>(async () => false);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [dataSyncedAt, setDataSyncedAt] = useState<number | null>(null);
  const [dataSyncError, setDataSyncError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const cacheKey = (id: string) => `schedule_mainData_v2_${JSON.stringify([id, session.role, session.info?.id || session.info?.username || null])}`;
  const cacheData = (id: string, data: any) => {
    try { localStorage.setItem(cacheKey(id), JSON.stringify(data)); }
    catch (error) { console.warn('Could not cache application data', error); }
  };

  const [registrationRequests, setRegistrationRequests] = useState<any[]>([]);
  const [session, setSession] = useState<{ role: 'superadmin' | 'admin' | 'employee' | null; info: any }>({
    role: null,
    info: null
  });
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

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

  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState<string>(() => {
    return localStorage.getItem('app_company_id') || 'default';
  });

  if (companyRef.current !== companyId) {
    companyRef.current = companyId;
    revision.current++;
    unsaved.current = false;
  }

  // Keep companyId in sync with localStorage
  useEffect(() => {
    localStorage.setItem('app_company_id', companyId);
  }, [companyId]);

  // If user logs in and belongs to a specific company, sync it
  useEffect(() => {
    if (session && session.info && session.info.companyId) {
      setCompanyId(session.info.companyId);
    }
  }, [session]);

  const fetchCompanies = async () => {
    if (document.hidden) return;
    try {
      const response = await fetch('/api/companies');
      if (response.ok) {
        const data = await response.json();
        setCompaniesList(data);
      }
    } catch (err) {
      console.error('Error fetching companies list:', err);
    }
  };

  useEffect(() => {
    if(!session.role){setCompaniesList([]);return;}
    fetchCompanies();
  }, [session.role]);

  useEffect(() => {
    let cancelled = false;
    let fetchTask: Promise<boolean> | null = null;
    setDataSyncedAt(null);
    setDataSyncError('');
    let receivedData = false;
    // 1. Fetch mainData from PostgreSQL API
    const fetchMainData = (): Promise<boolean> => {
      if (fetchTask) return fetchTask;
      fetchTask = loadMainData().finally(() => { fetchTask = null; });
      return fetchTask;
    };
    refreshMainData.current = fetchMainData;
    const loadMainData = async (): Promise<boolean> => {
      if (cancelled || document.hidden || pendingSaves.current || unsaved.current) return false;
      setDataRefreshing(true);
      const fetchRevision = revision.current;
      try {
        const response = await fetch(`/api/main-data?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`API Handshake failed: Server returned status ${response.status} (${response.statusText})`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Invalid response format. Expected JSON, got: ${text.substring(0, 100)}...`);
        }

        const data = await response.json();
        if (cancelled || fetchRevision !== revision.current || pendingSaves.current || unsaved.current) return false;
        receivedData = true;
        setDataSyncedAt(Date.now());
        setDataSyncError('');
        if (data._adminAccess && session.role === 'admin') setSession(previous => {
          const info = { ...previous.info, ...data._adminAccess };
          const next = { ...previous, info }; localStorage.setItem('app_session', JSON.stringify(next)); return next;
        });
        if (data._version) serverVersions.current[companyId] = data._version;
        conflictCompanies.current.delete(companyId);
        setSaveConflict(false);
        dataRef.current = {
          departments: data.departments || [], employees: data.employees || [],
          shiftTypes: data.shiftTypes || defaultShiftTypes, schedule: data.schedule || {}, scheduleNotice: data.scheduleNotice, _schedulePublication: data._schedulePublication
        };
        if (data.settings) settingsRef.current = data.settings;
        setAppData({
          departments: data.departments || [],
          employees: data.employees || [],
          shiftTypes: data.shiftTypes || defaultShiftTypes,
          schedule: data.schedule || {}, scheduleNotice: data.scheduleNotice, _schedulePublication: data._schedulePublication
        });
        if (data.settings) {
          setAppSettings(data.settings);
        }
        cacheData(companyId, data);
        return true;
      } catch (err: any) {
        console.error('[API Error] Failed to fetch main-data from backend:', err.message || err);
        if (cancelled || fetchRevision !== revision.current || unsaved.current) return false;
        setDataSyncError('تعذر تحديث الجدول من السيرفر؛ البيانات المعروضة قد تكون قديمة.');
        if (receivedData) return false;
        const cached = session.role === 'admin' ? null : localStorage.getItem(cacheKey(companyId));
        if (cached) {
          try {
            console.log('[Cache Fallback] Loading application data from local storage cache.');
            const data = JSON.parse(cached);
            if (data._adminAccess && session.role === 'admin') setSession(previous => {
          const info = { ...previous.info, ...data._adminAccess };
          const next = { ...previous, info }; localStorage.setItem('app_session', JSON.stringify(next)); return next;
        });
        if (data._version) serverVersions.current[companyId] = data._version;
            dataRef.current = { departments: data.departments || [], employees: data.employees || [], shiftTypes: data.shiftTypes || defaultShiftTypes, schedule: data.schedule || {}, scheduleNotice: data.scheduleNotice, _schedulePublication: data._schedulePublication };
            if (data.settings) settingsRef.current = data.settings;
            setAppData({
              departments: data.departments || [],
              employees: data.employees || [],
              shiftTypes: data.shiftTypes || defaultShiftTypes,
              schedule: data.schedule || {}, scheduleNotice: data.scheduleNotice, _schedulePublication: data._schedulePublication
            });
            if (data.settings) {
              setAppSettings(data.settings);
            }
          } catch (e) {
            console.error('Error parsing cached data:', e);
          }
        }
        return false;
      } finally {
        if (!cancelled) { setLoading(false); setDataRefreshing(false); }
      }
    };

    // 2. Fetch registration requests from PostgreSQL API
    const fetchRegRequests = async () => {
      if (document.hidden || cancelled) return;
      try {
        const response = await fetch(`/api/registration-requests?companyId=${companyId}`);
        if (!response.ok) {
          throw new Error(`API Handshake failed: Server returned status ${response.status} (${response.statusText})`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Invalid response format. Expected JSON, got: ${text.substring(0, 100)}...`);
        }

        const data = await response.json();
        if (!cancelled) setRegistrationRequests(data);
      } catch (err: any) {
        console.error('[API Error] Failed to fetch registration requests:', err.message || err);
      }
    };

        // Initial fetches
    fetchMainData();

    // Set up polling intervals to maintain real-time sync
    const mainDataInterval = setInterval(fetchMainData, 60000);

    let regRequestsInterval: ReturnType<typeof setInterval> | undefined;
    if (session.role === 'superadmin' || (session.role === 'admin' && session.info?.departmentIds == null && session.info?.permissions?.canManageEmployees)) {
      fetchRegRequests();
      regRequestsInterval = setInterval(fetchRegRequests, 60000);
    }

    const onVisible = () => {
      if (document.hidden) return;
      void fetchMainData();
      if (session.role === 'admin' || session.role === 'superadmin') void fetchRegRequests();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('pageshow', onVisible);

    // 3. Keep local sessions on reload
    const storedSession = localStorage.getItem('app_session');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        setSession(parsed);
        if (parsed?.role && (location.pathname === '/' || location.pathname === '/login')) {
          navigate(parsed.role === 'employee' ? '/employee' : '/admin/dashboard', { replace: true });
        }
      } catch (e) {}
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('pageshow', onVisible);
      clearInterval(mainDataInterval);
      if (regRequestsInterval) clearInterval(regRequestsInterval);
    };
  }, [companyId, session.role]);

  // Serialize full snapshots; polling must never replace an in-flight or failed edit.
  const saveMainData = (): Promise<boolean> => {
    const targetCompany = companyId;
    const { _schedulePublication: serverPublication, scheduleNotice: employeeNotice, ...editableData } = dataRef.current;
    const payload = { ...editableData, settings: settingsRef.current, updatedAt: Date.now() };
    const saveRevision = ++revision.current;
    unsaved.current = true;
    pendingSaves.current++;
    setSaving(true);
    const task = saveQueue.current.then(async () => {
      try {
        if (conflictCompanies.current.has(targetCompany)) return false;
        const response = await fetch(`/api/main-data?companyId=${encodeURIComponent(targetCompany)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, _baseVersion: serverVersions.current[targetCompany] })
        });
        const result = await response.json().catch(() => null);
        if (response.status === 409 && result?.code === 'DATA_CONFLICT') {
          conflictCompanies.current.add(targetCompany);
          if (companyRef.current === targetCompany) setSaveConflict(true);
        }
        if (!response.ok) throw new Error(result?.error || `فشل الحفظ (${response.status})`);
        if (!result || typeof result !== 'object') throw new Error('استجابة الحفظ غير صحيحة');
        if (result._version) serverVersions.current[targetCompany] = result._version;
        cacheData(targetCompany, result);
        if (companyRef.current === targetCompany && revision.current === saveRevision) {
          unsaved.current = false;
          dataRef.current = { ...dataRef.current, _schedulePublication: result._schedulePublication };
          setAppData((previous: any) => ({ ...previous, _schedulePublication: result._schedulePublication }));
          setSaveError('');
        }
        return true;
      } catch (error: any) {
        if (companyRef.current === targetCompany) setSaveError(error.message || 'تعذر الاتصال بالخادم');
        return false;
      } finally {
        pendingSaves.current--;
        if (!pendingSaves.current) setSaving(false);
      }
    });
    saveQueue.current = task.then(() => undefined);
    return task;
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved.current || pendingSaves.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const handleUpdateSettings = (nextSettings: any) => {
    settingsRef.current = nextSettings;
    setAppSettings(nextSettings);
    return saveMainData();
  };

  const handleUpdateAppData = (nextData: any) => {
    dataRef.current = nextData;
    setAppData(nextData);
    return saveMainData();
  };

  const navigate = useNavigate();
  const location = useLocation();

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
    navigate('/employee', { replace: true });
  };

  const handleAdminLoginSuccess = (adm: any) => {
    persistSession(adm.role, adm);
    navigate('/admin/dashboard', { replace: true });
  };

  const handleLogout = () => {
    requestConfirm('هل تريد تأكيد تسجيل الخروج وتأمين المنصة؟', () => {
      persistSession(null, null);
      navigate('/login', { replace: true });
    });
  };

  // A 401 on any authenticated request (e.g. the check-in/out button after the phone
  // was left idle for a while, or a token that's no longer valid) used to just look like
  // a generic "connection failed" error from wherever that fetch call happened to be.
  // This clears the stale session and sends the person back to login with an honest,
  // specific reason instead.
  useEffect(() => {
    const onSessionExpired = () => {
      if (session.role === null) return; // already logged out, nothing to do
      persistSession(null, null);
      setSessionExpiredMessage('انتهت صلاحية جلستك، يرجى تسجيل الدخول مرة أخرى.');
      navigate('/login', { replace: true });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.role]);

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
        if (!await handleUpdateAppData({ ...appData, employees: nextEmployees })) return;

        setChangePwdMsg('✅ تم تحديث كلمة المرور لحسابك بنجاح!');
        setTimeout(() => setChangePwdOpen(false), 2000);
      } else if (session.role === 'admin') {
        const response = await fetch(`/api/admins?companyId=${companyId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: session.info.id,
            name: session.info.name,
            username: session.info.username,
            password: newPassword,
            companyId
          })
        });
        if (!response.ok) {
          throw new Error('فشل تحديث كلمة المرور في الخادم');
        }

        setChangePwdMsg('✅ تم تحديث كلمة المرور لحسابك الإداري الفرعي بنجاح!');
        setTimeout(() => setChangePwdOpen(false), 2000);
      } else if (session.role === 'superadmin') {
        if (!await handleUpdateSettings({ ...appSettings, password: newPassword })) return;

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
      
      <SystemUpdateNotice blocked={saving || !!saveError || saveConflict || unsaved.current}/>
      {(saving || saveError) && (
        <div role="status" className="sticky top-0 z-[120] p-3 bg-amber-50 border-b border-amber-200 text-sm text-center">
          {saving ? 'جاري حفظ البيانات...' : `لم يتم حفظ التعديلات: ${saveError}. التعديلات محفوظة مؤقتًا في هذه الصفحة.`}
          {saveError && !saving && !saveConflict && <button className="mr-3 underline font-bold" onClick={() => { void saveMainData(); }}>إعادة محاولة الحفظ</button>}
          {saveConflict && !saving && <button className="mr-3 underline font-bold" onClick={() => {
            if (!window.confirm('سيتم تحميل نسخة الخادم والتخلي عن التعديلات غير المحفوظة في هذه الصفحة. انسخ تعديلك أولًا إذا احتجت إليه. هل تريد المتابعة؟')) return;
            unsaved.current = false;
            window.location.reload();
          }}>تحميل آخر نسخة</button>}
        </div>
      )}
      {/*
        Real, bookmarkable routes instead of one page that silently swaps
        content based on local state:
          /login            → sign-in screen
          /employee          → employee self-service portal
          /admin/:view       → admin dashboard, one URL per section
            (e.g. /admin/attendance, /admin/employees, /admin/settings ...)
        Each guard below redirects to /login if the visitor's session
        doesn't match what the route requires.
      */}
      <Routes>
        <Route
          path="/login"
          element={
            session.role === null ? (
              <LoginScreen
                appSettings={appSettings}
                onAdminLogin={handleAdminLoginSuccess}
                onEmployeeLogin={handleEmployeeLoginSuccess}
                sessionExpiredMessage={sessionExpiredMessage}
                onDismissSessionExpiredMessage={() => setSessionExpiredMessage('')}
              />
            ) : (
              <Navigate to={session.role === 'employee' ? '/employee' : '/admin/dashboard'} replace />
            )
          }
        />

        <Route
          path="/employee"
          element={
            session.role === 'employee' ? (
              <EmployeePortal
                scheduleNotice={appData.scheduleNotice}
                employee={appData.employees.find(e => String(e.id) === String(session.info.id)) || session.info}
                onRefreshSchedule={() => refreshMainData.current()}
                scheduleRefreshing={dataRefreshing}
                scheduleSyncedAt={dataSyncedAt}
                scheduleSyncError={dataSyncError}
                appSettings={appSettings}
                departments={appData.departments}
                employees={appData.employees}
                shiftTypes={appData.shiftTypes}
                schedule={appData.schedule}
                onLogout={handleLogout}
                onOpenChangePassword={handleOpenChangePassword}
                companyId={companyId}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="/admin/:view"
          element={
            session.role === 'admin' || session.role === 'superadmin' ? (
              <div className="contents" key={JSON.stringify([companyId, session.info?.id, session.info?.departmentIds ?? null, session.info?.permissions || null])}><AdminPortal
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
                onRefreshData={() => refreshMainData.current()}
                onSelectCompany={id=>{if(unsaved.current || pendingSaves.current){setSaveError('احفظ التعديلات الحالية قبل الانتقال لشركة أخرى');return;}setCompanyId(id);}}
                registrationRequests={registrationRequests}
                companyId={companyId}
                companiesList={companiesList}
                fetchCompanies={fetchCompanies}
              /></div>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to={session.role === null ? '/login' : session.role === 'employee' ? '/employee' : '/admin/dashboard'}
              replace
            />
          }
        />
      </Routes>

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
