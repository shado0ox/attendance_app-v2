import { validEmployeeEmail } from '../lib/employeeDirectory';
import { useAutoPunch } from '../hooks/useAutoPunch';
import { autoPeriodWindow } from '../lib/autoPunch';
import { showPwaNotification } from '../lib/pwaNotification';
import { getEmployeeLocations as getApprovedLocations, matchAttendanceLocation } from '../lib/attendanceLocations';
import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { Key, LogOut, ChevronRight, ChevronLeft, CalendarOff, Repeat, ArrowRightLeft, Clock, RefreshCw, Loader, AlertCircle, Fingerprint, ScanFace, ShieldCheck } from 'lucide-react';
interface EmployeePortalProps {
  scheduleNotice?: { revision: string; publishedAt: string | null };
  onRefreshSchedule: () => Promise<boolean>;
  scheduleRefreshing: boolean;
  scheduleSyncedAt: number | null;
  scheduleSyncError: string;
  employee: any;
  appSettings: any;
  departments: any[];
  employees: any[];
  shiftTypes?: any[];
  schedule?: any;
  onLogout: () => void;
  onOpenChangePassword: () => void;
  companyId: string;
}

export default function EmployeePortal({
  scheduleNotice,
  onRefreshSchedule,
  scheduleRefreshing,
  scheduleSyncedAt,
  scheduleSyncError,
  employee,
  appSettings: companySettings,
  departments,
  employees,
  shiftTypes = [],
  schedule = {},
  onLogout,
  onOpenChangePassword,
  companyId
}: EmployeePortalProps) {
  const currentProfile = employees.find(e => String(e.id) === String(employee.id)) || employee;
  const appSettings = useMemo(() => ({ ...companySettings, _attendanceEmployee: currentProfile }), [companySettings, currentProfile]);
  const [emailDraft, setEmailDraft] = useState(currentProfile.email || '');
  const [emailOpen, setEmailOpen] = useState(!validEmployeeEmail(currentProfile.email));
  const [emailSaved, setEmailSaved] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const profileScope = companyId + ':' + employee.id;
  useEffect(() => {
    setEmailDraft(currentProfile.email || '');
    setEmailSaved('');
    setEmailOpen(!validEmployeeEmail(currentProfile.email));
    setEmailError('');
  }, [profileScope]);
  const saveEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (emailBusy) return;
    if (!validEmployeeEmail(emailDraft.trim())) { setEmailError('أدخل بريدًا إلكترونيًا صحيحًا'); return; }
    setEmailBusy(true); setEmailError('');
    try {
      const response = await fetch(`/api/employee-profile/email?companyId=${encodeURIComponent(companyId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailDraft.trim() }) });
      const result = await response.json();
      if (!response.ok) { setEmailError(result.error || 'تعذر حفظ البريد'); return; }
      setEmailSaved(result.email); setEmailOpen(false);
      await onRefreshSchedule();
    } catch { setEmailError('تعذر تأكيد الحفظ. تحقق من الاتصال وحاول مرة أخرى.'); }
    finally { setEmailBusy(false); }
  };
  const [scheduleChanged, setScheduleChanged] = useState(false);
  useEffect(() => {
    if (!scheduleNotice?.revision) return;
    const key = `schedule_seen_${companyId}_${employee.id}`;
    const previous = localStorage.getItem(key);
    if (!previous) { localStorage.setItem(key, scheduleNotice.revision); setScheduleChanged(false); }
    else setScheduleChanged(previous !== scheduleNotice.revision);
  }, [companyId, employee.id, scheduleNotice?.revision]);
  const acknowledgeSchedule = () => {
    if (scheduleNotice?.revision) localStorage.setItem(`schedule_seen_${companyId}_${employee.id}`, scheduleNotice.revision);
    setScheduleChanged(false);
  };
  const [monthOffset, setMonthOffset] = useState(0);
  const [requests, setRequests] = useState<any[]>([]);
  const [reqsLoading, setReqsLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<string>('checking'); // 'checking' | 'not-checked-in' | 'checked-in' | 'checked-out' | 'error'
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [actionLoading, setCheckActionLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>('');
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState<'leave' | 'shift_change' | 'swap'>('leave');

  // Custom Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  });

  const requestConfirm = (message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      message,
      onConfirm
    });
  };
  
  // Request inputs
  const [reqDate, setReqDate] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqSwapEmpId, setReqSwapEmpId] = useState('');
  const [reqTargetShift, setReqTargetShift] = useState('S');
  const [reqCheckInTime, setReqCheckInTime] = useState('08:00');
  const [reqCheckOutTime, setReqCheckOutTime] = useState('16:00');

  // Auto Punch / Geofencing states
  const [autoCheckIn, setAutoCheckIn] = useState<boolean>(() => {
    return localStorage.getItem(`autoCheckIn_${employee.id}`) === 'true';
  });
  const [autoCheckOut, setAutoCheckOut] = useState<boolean>(() => {
    return localStorage.getItem(`autoCheckOut_${employee.id}`) === 'true';
  });
  const [autoStatusText, setAutoStatusText] = useState<string>('غير مفعلة');
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [departureHint, setDepartureHint] = useState<{ id: number; text: string } | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState('');
  const autoPunchBusy = useRef(false);
  const [autoLogs, setAutoLogs] = useState<string[]>([]);

  // New Smart Background / Scheduled GPS Settings
  const [autoCheckMode, setAutoCheckMode] = useState<'always' | 'shift' | 'scheduled'>(() => {
    return localStorage.getItem(`autoCheckMode_${employee.id}`) === 'scheduled' ? 'scheduled' : 'shift';
  });
  const [autoCheckInterval, setAutoCheckInterval] = useState<number>(() => {
    const interval = Number(localStorage.getItem(`autoCheckInterval_${employee.id}`));
    return [1, 2, 5].includes(interval) ? interval : 5;
  });
  const [scheduledCheckTime, setScheduledCheckTime] = useState<string>(() => {
    return localStorage.getItem(`scheduledCheckTime_${employee.id}`) || '08:00';
  });
  const [enableMissedShiftAlert, setEnableMissedShiftAlert] = useState<boolean>(() => {
    const val = localStorage.getItem(`enableMissedShiftAlert_${employee.id}`);
    return val === null ? true : val === 'true';
  });
  const [missedShiftAlert, setMissedShiftAlert] = useState<{
    shiftName: string;
    startTime: string;
    date: string;
  } | null>(() => {
    const saved = localStorage.getItem(`missedShiftAlert_${employee.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.date === getTodayStr()) return parsed;
      } catch (e) {}
    }
    return null;
  });
  const [notificationPermissionState, setNotificationPermissionState] = useState<string>(() => {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  });

    const [biometricType, setBiometricType] = useState<'face' | 'fingerprint'>('face');
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricMessage, setBiometricMessage] = useState('');
  const [hasBiometricCredential, setHasBiometricCredential] = useState<boolean>(() => {
    return localStorage.getItem(`biometric_enabled_${companyId}_${employee.id}`) === 'true';
  });

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      typeof navigator.credentials?.create === 'function';
    setBiometricSupported(supported);
  }, []);

  const stateRef = useRef({
    actionLoading,
    attendanceStatus,
    todayRecord,
    autoCheckIn,
    autoCheckOut,
    employee,
    appSettings,
    autoCheckMode,
    autoCheckInterval,
    scheduledCheckTime,
    enableMissedShiftAlert,
    missedShiftAlert
  });

  useEffect(() => {
    stateRef.current = {
      actionLoading,
      attendanceStatus,
      todayRecord,
      autoCheckIn,
      autoCheckOut,
      employee,
      appSettings,
      autoCheckMode,
      autoCheckInterval,
      scheduledCheckTime,
      enableMissedShiftAlert,
      missedShiftAlert
    };
  }, [
    actionLoading,
    attendanceStatus,
    todayRecord,
    autoCheckIn,
    autoCheckOut,
    employee,
    appSettings,
    autoCheckMode,
    autoCheckInterval,
    scheduledCheckTime,
    enableMissedShiftAlert,
    missedShiftAlert
  ]);

  // Save effects
  useEffect(() => {
    localStorage.setItem(`autoCheckMode_${employee.id}`, autoCheckMode);
  }, [autoCheckMode, employee.id]);

  useEffect(() => {
    localStorage.setItem(`autoCheckInterval_${employee.id}`, String(autoCheckInterval));
  }, [autoCheckInterval, employee.id]);

  useEffect(() => {
    localStorage.setItem(`scheduledCheckTime_${employee.id}`, scheduledCheckTime);
  }, [scheduledCheckTime, employee.id]);

  useEffect(() => {
    localStorage.setItem(`enableMissedShiftAlert_${employee.id}`, String(enableMissedShiftAlert));
  }, [enableMissedShiftAlert, employee.id]);

  const executePunchInBackground = async (position: GeolocationPosition): Promise<boolean> => {
    if (autoPunchBusy.current || stateRef.current.actionLoading) return false;
    autoPunchBusy.current = true; setCheckActionLoading(true); stateRef.current.actionLoading = true;
    try {
      const second = stateRef.current.attendanceStatus === 'not-checked-in-2';
      const tr = stateRef.current.todayRecord;
      if (second && !tr?.id) return false;
      const field = second ? 'checkIn2' : 'checkIn';
      const response = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        companyId, ...(second && { id: tr.id }), [field]: 'auto',
        [second ? 'checkInLat2' : 'checkInLat']: position.coords.latitude,
        [second ? 'checkInLng2' : 'checkInLng']: position.coords.longitude,
        automatic: true, gpsAccuracy: position.coords.accuracy, gpsTimestamp: position.timestamp,
      }) });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'لم يتم تأكيد حفظ البصمة');
      setLastAutoSaved(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh' }));
      setAutoLogs(prev => [`✅ حفظ الخادم حضورك في ${saved[second ? 'checkInLocation2' : 'checkInLocation'] || 'الموقع المعتمد'}`, ...prev.slice(0, 4)]);
      await loadAttendanceStatus();
      return true;
    } catch (error: any) {
      setAutoLogs(prev => [`لم يتأكد الحفظ: ${error.message}`, ...prev.slice(0, 4)]);
      setAutoStatusText('لم يتأكد حفظ البصمة؛ جارٍ التحقق من الخادم قبل أي إعادة محاولة');
      await loadAttendanceStatus();
      return false;
    } finally { autoPunchBusy.current = false; setCheckActionLoading(false); stateRef.current.actionLoading = false; }
  };

  // Persist autoPunch toggles
  useEffect(() => {
    localStorage.setItem(`autoCheckIn_${employee.id}`, String(autoCheckIn));
  }, [autoCheckIn, employee.id]);

  useEffect(() => {
    localStorage.setItem(`autoCheckOut_${employee.id}`, String(autoCheckOut));
  }, [autoCheckOut, employee.id]);

  const getTodayShift = () => {
    const todayStr = getTodayStr();
    const sched = schedule;
    const assigned = sched?.[todayStr]?.[employee.id];
    const stType = assigned?.shiftType || 'A';
    const sTypes = shiftTypes && shiftTypes.length > 0 ? shiftTypes : [];
    return sTypes.find((s: any) => s.id === stType);
  };

  const speakVoiceAlert = (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Speech synthesis error:', e);
      }
    }
  };

  const triggerMissedShiftAlert = (shiftName: string, startTime: string) => {
    const todayStr = getTodayStr();
    const alertKey = `lastMissedAlertDate_${employee.id}`;
    const lastAlertDate = localStorage.getItem(alertKey);
    
    // Check if we already alerted today
    if (lastAlertDate === todayStr) return;
    
    // Set alert state
    const alertObj = { shiftName, startTime, date: todayStr };
    setMissedShiftAlert(alertObj);
    localStorage.setItem(`missedShiftAlert_${employee.id}`, JSON.stringify(alertObj));
    localStorage.setItem(alertKey, todayStr);
    
    // Voice speech alert
    speakVoiceAlert(`تنبيه هام. لقد فات موعد شيفت ${shiftName} المجدول في الساعة ${startTime}. يرجى التوجه لمقر العمل لتسجيل الحضور`);

    // Mobile Notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
      void showPwaNotification('تنبيه: فاتك موعد الدوام', `بدأ ${shiftName} في ${startTime}؛ لم يتأكد تسجيل الحضور`);
    }
    
    setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ⚠️ تم إرسال تنبيه: لقد فاتك موعد الدوام الجاري!`, ...prev.slice(0, 4)]);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermissionState(permission);
      if (permission === 'granted') {
        await showPwaNotification('تم تفعيل التنبيهات', 'ستظهر تذكيرات الدوام عند تشغيل التطبيق');
        speakVoiceAlert('تم تفعيل إشعارات وتنبيهات الدوام بنجاح');
      }
    } else {
      alert('متصفحك أو جهازك لا يدعم التنبيهات المباشرة حالياً.');
    }
  };

  const requestAlwaysLocationPermission = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          speakVoiceAlert('تم تأكيد الاتصال بالموقع الجغرافي');
          alert('تم تفعيل الموقع أثناء استخدام التطبيق. عند قفل الشاشة أو إخفاء الـPWA يتوقف الفحص ويستأنف عند فتحه.');
        },
        (err) => {
          alert(`❌ تعذر الوصول للموقع: ${err.message}. يرجى التحقق من تفعيل الـ GPS وإذن المتصفح.`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };
  const base64urlToUint8Array = (base64url: string) => {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  };

  const arrayBufferToBase64url = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const startBiometricEnrollment = async () => {
    if (!biometricSupported) {
      setBiometricMessage('❌ هذا الجهاز أو المتصفح لا يدعم تسجيل البصمة البيومترية.');
      return;
    }

    setBiometricLoading(true);
    setBiometricMessage('🔐 جاري تجهيز تسجيل البصمة...');

    try {
      const token = employee?.token;
        if (!token) throw new Error('يجب تسجيل الدخول أولاً');

      const optionsRes = await fetch('/api/auth/webauthn-register-options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ empId: employee.id, companyId })
      });

      const optionsData = await optionsRes.json().catch(() => ({}));
      if (!optionsRes.ok) throw new Error(optionsData.error || 'فشل تجهيز طلب تسجيل البصمة');

      setBiometricMessage(
        biometricType === 'face'
          ? '📸 انظر إلى الكاميرا لإكمال تسجيل بصمة الوجه...'
          : '👆 ضع إصبعك على المستشعر لإكمال تسجيل البصمة...'
      );

      const credential = (await navigator.credentials.create({
        publicKey: {
          ...optionsData,
          challenge: base64urlToUint8Array(optionsData.challenge),
          user: {
            ...optionsData.user,
            id: base64urlToUint8Array(optionsData.user.id)
          },
          excludeCredentials: (optionsData.excludeCredentials || []).map((cred: any) => ({
            ...cred,
            id: base64urlToUint8Array(cred.id)
          }))
        }
      })) as PublicKeyCredential | null;

      if (!credential) throw new Error('تم إلغاء عملية تسجيل البصمة');

      const response = credential.response as AuthenticatorAttestationResponse;

      const verifyRes = await fetch('/api/auth/webauthn-register-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          empId: employee.id,
          companyId,
          credential: {
            id: credential.id,
            rawId: arrayBufferToBase64url(credential.rawId),
            type: credential.type,
            response: {
              clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
              attestationObject: arrayBufferToBase64url(response.attestationObject),
              transports:
                typeof response.getTransports === 'function' ? response.getTransports() : ['internal']
            },
            clientExtensionResults: credential.getClientExtensionResults?.() || {}
          }
        })
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(verifyData.error || 'فشل تأكيد تسجيل البصمة');

      localStorage.setItem(`biometric_enabled_${companyId}_${employee.id}`, 'true');
      setHasBiometricCredential(true);
      setBiometricMessage('✅ تم تسجيل البصمة البيومترية بنجاح. يمكنك الآن استخدامها عند تسجيل الدخول.');
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        setBiometricMessage('❌ تم إلغاء أو رفض عملية تسجيل البصمة.');
      } else if (e.name === 'InvalidStateError') {
        setBiometricMessage('ℹ️ هذه البصمة مسجلة بالفعل على هذا الجهاز.');
      } else if (e.name === 'SecurityError') {
        setBiometricMessage('❌ يجب تشغيل التطبيق على HTTPS أو localhost لتسجيل البصمة.');
      } else {
        setBiometricMessage('❌ ' + (e.message || 'فشل تسجيل البصمة'));
      }
    } finally {
      setBiometricLoading(false);
    }
  };
  
  
  useAutoPunch({
    scope: companyId + ':' + employee.id, autoIn: autoCheckIn, autoOut: autoCheckOut,
    mode: autoCheckMode, interval: autoCheckInterval, scheduled: scheduledCheckTime, settings: appSettings,
    status: attendanceStatus, record: todayRecord, blocked: actionLoading || autoPunchBusy.current,
    window: () => {
      const tr = stateRef.current.todayRecord;
      const active = ['checked-in', 'checked-in-2', 'not-checked-in-2'].includes(stateRef.current.attendanceStatus);
      const date = active && tr?.date ? tr.date : getTodayStr();
      const assigned = schedule?.[date]?.[employee.id];
      const shift = shiftTypes.find(st => st.id === assigned?.shiftType);
      return autoPeriodWindow(date, shift, ['checked-in-2', 'not-checked-in-2'].includes(stateRef.current.attendanceStatus));
    },
    refresh: loadAttendanceStatus, punch: executePunchInBackground, message: setAutoStatusText,
    fix: (accuracy, distance) => { setGpsAccuracy(Number.isFinite(accuracy) ? Math.round(accuracy) : null); setCurrentDistance(distance === null ? null : Math.round(distance)); },
    departure: (id, text) => { setDepartureHint({ id, text }); void showPwaNotification('تذكير بالانصراف', text); },
    missedAlert: enableMissedShiftAlert,
    late: (start) => triggerMissedShiftAlert(getTodayShift()?.name || 'الدوام', new Date(start).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' })),
  });

  const DAYS_AR = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // Helper date conversions
  function getTodayStr() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
  };

  const isTodayRecordShiftDouble = (): boolean => {
    const todayStr = stateRef.current.todayRecord?.date || getTodayStr();
    const sched = schedule;
    const assigned = sched?.[todayStr]?.[employee.id];
    const stType = assigned?.shiftType || 'A';
    const sTypes = shiftTypes && shiftTypes.length > 0 ? shiftTypes : [];
    const st = sTypes.find((s: any) => s.id === stType);
    return st?.type === 'double';
  };

  useEffect(() => {
    loadAttendanceStatus();
    loadRequests();
    
    // Set default request date
    const today = new Date();
    setReqDate(today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0'));
  }, [employee]);

  const loadRequests = async () => {
    setReqsLoading(true);
    try {
      const response = await fetch(`/api/requests?companyId=${companyId}`);
      if (!response.ok) {
        throw new Error('فشل تحميل الطلبات من الخادم');
      }
      const allRequests = await response.json();
      const loaded = allRequests.filter((r: any) => r.empId === employee.id);
      // Sort locally by createdAt desc
      loaded.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRequests(loaded);
    } catch (e) {
      console.error('Error loading requests:', e);
    } finally {
      setReqsLoading(false);
    }
  };

  async function loadAttendanceStatus(): Promise<boolean> {
    setAttendanceStatus('checking'); stateRef.current.attendanceStatus = 'checking';
    try {
      const todayStr = getTodayStr();
      const yesterday = new Date(Date.parse(todayStr + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
      const response = await fetch(`/api/attendance?${new URLSearchParams({ companyId, from: yesterday, to: todayStr })}`);
      if (!response.ok) throw new Error('تعذر تأكيد الحالة من الخادم');
      const list = await response.json();
      const own = list.filter((row: any) => String(row.empId) === String(employee.id));
      const doubleFor = (row: any) => shiftTypes.find(st => st.id === schedule?.[row.date]?.[employee.id]?.shiftType)?.type === 'double';
      const record = own.find((row: any) => row.date === yesterday && Number(row.checkInTs) > Date.now() - 86400000 && (!row.checkOut || (doubleFor(row) && row.checkIn2 && !row.checkOut2) || (doubleFor(row) && !row.checkIn2 && (autoPeriodWindow(row.date, shiftTypes.find(st => st.id === schedule?.[row.date]?.[employee.id]?.shiftType), true)?.end || 0) > Date.now())))
        || own.find((row: any) => row.date === todayStr);
      let status = 'not-checked-in';
      if (record) status = !record.checkOut ? 'checked-in' : doubleFor(record) ? !record.checkIn2 ? 'not-checked-in-2' : !record.checkOut2 ? 'checked-in-2' : 'checked-out' : 'checked-out';
      stateRef.current.attendanceStatus = status; stateRef.current.todayRecord = record || null;
      setAttendanceStatus(status); setTodayRecord(record || null);
      setDepartureHint(previous => previous?.id === record?.id && ['checked-in', 'checked-in-2'].includes(status) ? previous : null);
      return true;
    } catch (error: any) {
      stateRef.current.attendanceStatus = 'error'; setAttendanceStatus('error'); setGeoStatus('فشل في تحميل الحالة: ' + error.message);
      return false;
    }
  }

  // Geolocation & Distance Helpers
  const getPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('جهازك أو متصفحك لا يدعم الخدمة الجغرافية GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => {
          const errors: { [key: number]: string } = {
            1: 'يرجى تفعيل إذن الموقع الجغرافي من إعدادات المتنبّه/المتصفح والمحاولة مجدداً.',
            2: 'تعذر تحديد الموقع الجغرافي حالياً.',
            3: 'انتهت مهلة المزامنة والموقع الجغرافي.'
          };
          reject(new Error(errors[err.code] || err.message));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  };

  const handleCheckIn = async () => {
    if (autoPunchBusy.current || stateRef.current.actionLoading) return;
    setCheckActionLoading(true); stateRef.current.actionLoading = true;
    setGeoStatus('📡 جاري تحديد موقعك الجغرافي...');

    if (currentProfile.restrictAttendanceLocations && getApprovedLocations(appSettings).length === 0) {
      setCheckActionLoading(false); stateRef.current.actionLoading = false;
      setGeoStatus('لا يوجد موقع بصمة مفعّل ومسموح لك. راجع الإدارة.');
      return;
    }
    // Check if geo fence is setup
    if (getApprovedLocations(appSettings).length === 0) {
      // Direct sign in if no coordinates setup
      await executePunchIn(null, null);
      return;
    }

    try {
      const position = await getPosition();
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;


      const locationMatch = matchAttendanceLocation(appSettings, userLat, userLng);
      const diffDistance = locationMatch.distance;
      const radiusLimit = locationMatch.location?.radius || 0;

      if (!locationMatch.inside) {
        setCheckActionLoading(false); stateRef.current.actionLoading = false;
        setGeoStatus(
          `🚫 لا يمكنك تسجيل الحضور. أنت خارج المواقع المعتمدة. أقرب موقع: ${locationMatch.location?.name || 'المقر'}، المسافة قدرها (${Math.round(
            diffDistance
          )}متر). النطاق المسموح به هو: ${radiusLimit}متر.`
        );
        return;
      }

      await executePunchIn(userLat, userLng);
    } catch (e: any) {
      setGeoStatus('❌ ' + e.message);
      setCheckActionLoading(false); stateRef.current.actionLoading = false;
    }
  };

  const executePunchIn = async (lat: number | null, lng: number | null) => {
    try {
      const todayStr = getTodayStr();
      const formattedTime = new Date().toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const isDouble = isTodayRecordShiftDouble();
      const isPeriod2 = isDouble && todayRecord && todayRecord.checkOut && !todayRecord.checkIn2;

      if (isPeriod2) {
        // Update existing daily record with period 2 check-in
        const updateData: any = {
          id: todayRecord.id, companyId,
          checkIn2: formattedTime,
          checkInTs2: Date.now(),
          ...(lat !== null && { checkInLat2: lat, checkInLng2: lng })
        };
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        if (!response.ok) {
          throw new Error('فشل تسجيل حضور الفترة الثانية');
        }

        setGeoStatus('✅ تم تسجيل حضور الفترة الثانية بنجاح اليوم!');
      } else {
        // Standard first check-in of the day
        const payload = {
          empId: employee.id,
          empName: employee.name,
          dept: employee.dept || '',
          date: todayStr,
          checkIn: formattedTime,
          checkInTs: Date.now(),
          checkOut: null,
          checkOutTs: null,
          status: 'present',
          source: 'المقر',
          companyId: companyId || 'default',
          ...(lat !== null && { checkInLat: lat, checkInLng: lng })
        };

        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          throw new Error('فشل تسجيل الحضور');
        }

        setGeoStatus('✅ تم تسجيل حضورك بنجاح اليوم!');
      }
      await loadAttendanceStatus();
    } catch (e: any) {
      setGeoStatus('خطأ أثناء الإدخال: ' + e.message);
    } finally {
      setCheckActionLoading(false); stateRef.current.actionLoading = false;
    }
  };

  const handleCheckOut = async () => {
    if (autoPunchBusy.current || stateRef.current.actionLoading) return;
    if (!todayRecord?.id) {
      setGeoStatus('⚠️ لا توجد بيانات تسجيل حضور صالحة لهذا اليوم.');
      return;
    }

    const loc = appSettings?.officeLocation;
    const requiresGPS = getApprovedLocations(appSettings).length > 0 && loc?.preventOutCheckout;

    let checkoutCoords: { lat: number; lng: number } | null = null;
    if (requiresGPS) {
      setCheckActionLoading(true); stateRef.current.actionLoading = true;
      setGeoStatus('📡 جاري تحديد موقعك الجغرافي للتحقق من الانصراف...');
      try {
        const position = await getPosition();
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        checkoutCoords = { lat: userLat, lng: userLng };
        const locationMatch = matchAttendanceLocation(appSettings, userLat, userLng);
        const diffDistance = locationMatch.distance;
        const radiusLimit = locationMatch.location?.radius || 0;

        if (!locationMatch.inside) {
          setCheckActionLoading(false); stateRef.current.actionLoading = false;
          setGeoStatus(
            `🚫 لا يمكنك تسجيل الانصراف. أنت خارج المواقع المعتمدة. أقرب موقع: ${locationMatch.location?.name || 'المقر'}، المسافة قدرها (${Math.round(
              diffDistance
            )}متر). النطاق المسموح به للانصراف هو: ${radiusLimit}متر.`
          );
          return;
        }
      } catch (e: any) {
        setGeoStatus('❌ فشل التحقق من الموقع لتسجيل الانصراف: ' + e.message);
        setCheckActionLoading(false); stateRef.current.actionLoading = false;
        return;
      }
    }

    if (!requiresGPS) {
      try { const position = await getPosition(); checkoutCoords = { lat: position.coords.latitude, lng: position.coords.longitude }; }
      catch { /* Checkout remains permitted when location restriction is disabled. */ }
    }
    requestConfirm('هل تريد تأكيد تسجيل انصرافك الآن؟', async () => {
      setCheckActionLoading(true); stateRef.current.actionLoading = true;
      setGeoStatus('⏳ جاري تسجيل الانصراف...');

      try {
        const formattedTime = new Date().toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const isDouble = isTodayRecordShiftDouble();
        const isPeriod2 = isDouble && todayRecord.checkOut;

        const updateData: any = isPeriod2 ? {
          id: todayRecord.id,
          checkOut2: formattedTime,
          checkOutTs2: Date.now(), companyId,
          ...(checkoutCoords && { checkOutLat2: checkoutCoords.lat, checkOutLng2: checkoutCoords.lng })
        } : {
          id: todayRecord.id,
          checkOut: formattedTime,
          checkOutTs: Date.now(), companyId,
          ...(checkoutCoords && { checkOutLat: checkoutCoords.lat, checkOutLng: checkoutCoords.lng })
        };

        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        if (!response.ok) {
          throw new Error('فشل تسجيل الانصراف');
        }

        setGeoStatus('✅ تم تسجيل الانصراف وحفظ السجل بنجاح.');
        await loadAttendanceStatus();
      } catch (e: any) {
        setGeoStatus('خطأ أثناء الانصراف: ' + e.message);
      } finally {
        setCheckActionLoading(false); stateRef.current.actionLoading = false;
      }
    });
  };

  const handleRequestSubmit = async () => {
    if (!reqDate) {
      alert('يرجى تحديد تاريخ الطلب');
      return;
    }

    const payload: any = {
      empId: employee.id,
      empName: employee.name,
      type: requestType,
      date: reqDate,
      note: reqNote.trim(),
      status: 'pending',
      companyId: companyId || 'default',
      createdAt: Date.now()
    };

    if (requestType === 'swap') {
      if (!reqSwapEmpId) {
        alert('يرجى اختيار زميل للتبديل معه');
        return;
      }
      const matched = employees.find((e) => e.id === reqSwapEmpId);
      payload.swapWithEmpId = reqSwapEmpId;
      payload.swapWithEmpName = matched ? matched.name : '';
    }

    if (requestType === 'shift_change') {
      payload.targetShift = reqTargetShift;
    }

    if ((requestType as any) === 'attendance_adjustment') {
      payload.checkInTime = reqCheckInTime;
      payload.checkOutTime = reqCheckOutTime;
    }

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('فشل إرسال الطلب إلى الخادم');
      }
      alert('🎉 تم إرسال طلبك بنجاح وجاري المراجعة من الإدارة.');
      setRequestModalOpen(false);
      setReqNote('');
      loadRequests();
    } catch (e: any) {
      alert('فشل إرسال الطلب: ' + e.message);
    }
  };

  // Calendar render logic
  const now = new Date();
  let showingYear = now.getFullYear();
  let showingMonth = now.getMonth() + monthOffset;

  while (showingMonth < 0) {
    showingMonth += 12;
    showingYear--;
  }
  while (showingMonth > 11) {
    showingMonth -= 12;
    showingYear++;
  }

  const daysInMonth = new Date(showingYear, showingMonth + 1, 0).getDate();
  const rawFirstDay = new Date(showingYear, showingMonth, 1).getDay(); // 0 is Sunday, 5 is Friday
  const saudiFirstCol = (rawFirstDay + 1) % 7; // Convert to Saudi standard (Saturday is col 0, Friday is col 6)

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < saudiFirstCol; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);
  // Guarantee exactly 42 elements (6 rows of 7 columns) for absolute visual height stability across any month!
  while (calendarCells.length < 42) {
    calendarCells.push(null);
  }

  const dept = departments.find((d) => d.id === employee.dept);

  // App owns network/cached data; an authoritative empty schedule stays empty.
  const scheduleData = schedule;

  return (
    <div id="emp-portal" className="min-h-screen pb-12 bg-sky-50 bg-opacity-40">
      {emailOpen && <div className="fixed inset-0 z-[100] bg-black/40 p-4 flex items-center justify-center" dir="rtl"><form onSubmit={saveEmail} role="dialog" aria-modal="true" aria-labelledby="employee-email-title" className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-xl flex flex-col gap-4"><h2 id="employee-email-title" className="font-bold text-lg">أكمل بريدك الإلكتروني</h2><p className="text-sm text-slate-600">احفظ بريدك في بيانات الموظف لتتمكن الإدارة من التواصل معك وإرسال رابط البرنامج. إدخال البريد لا يرسل رسائل تلقائيًا ولا يغيّر بيانات دخولك.</p><label className="text-sm">البريد الإلكتروني<input autoFocus required type="email" maxLength={254} dir="ltr" value={emailDraft} onChange={e => setEmailDraft(e.target.value)} placeholder="name@example.com" className="border rounded-lg p-3 w-full mt-2" /></label>{emailError && <p role="alert" className="text-sm text-rose-600">{emailError}</p>}<div className="flex gap-3"><button disabled={emailBusy} className="bg-sky-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{emailBusy ? 'جارٍ الحفظ…' : 'حفظ البريد'}</button><button type="button" disabled={emailBusy} onClick={() => setEmailOpen(false)} className="border rounded-lg px-4 py-2">لاحقًا</button></div></form></div>}
      {!validEmployeeEmail(emailSaved || currentProfile.email) && !emailOpen && <div className="bg-amber-50 border-b p-3 text-center text-xs" dir="rtl">لم تسجل بريدك بعد. <button onClick={() => setEmailOpen(true)} className="font-bold underline">إضافة البريد</button></div>}
      {scheduleChanged && <div className="bg-sky-100 border-b border-sky-200 p-3 text-sm flex flex-wrap justify-center items-center gap-3" dir="rtl"><strong>تم تحديث جدول دوامك أو مواعيد شيفتاتك.</strong><span>راجع الأيام والمواعيد في الجدول أدناه.</span><button onClick={acknowledgeSchedule} className="bg-white border rounded px-3 py-1 text-xs">اطلعت على التحديث</button></div>}
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-white border-b border-sky-100 shadow-sm">
        <div className="flex items-center gap-3">
          {appSettings?.logoDataUrl ? (
            <img 
              src={appSettings.logoDataUrl} 
              alt="Logo" 
              className="w-11 h-11 object-contain rounded-full bg-slate-100 p-1 border shadow-xs"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex items-center justify-center w-11 h-11 text-base font-extrabold text-white bg-sky-600 rounded-full shadow-sm">
              {employee.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-slate-800 text-sm leading-tight">{employee.name}</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">{dept ? dept.name : 'بدون قسم'}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onOpenChangePassword}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-sky-100 bg-sky-50 text-sky-600 hover:bg-sky-100 transition-all"
          >
            <Key size={13} />
            <span>كلمة المرور</span>
          </button>
          
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-rose-500 hover:bg-rose-50 transition-all border border-transparent"
          >
            <LogOut size={13} />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl px-4 py-8 mx-auto flex flex-col gap-6">

        {/* Missed Shift Alert Banner */}
        {missedShiftAlert && (
          <div className="p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md animate-bounce z-20">
            <div className="flex gap-3">
              <span className="p-2.5 bg-rose-100 text-rose-600 rounded-xl h-fit">
                <AlertCircle size={20} className="animate-pulse" />
              </span>
              <div>
                <h4 className="font-extrabold text-sm text-rose-900">⚠️ تنبيه: لقد فاتك موعد الدوام الجاري!</h4>
                <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                  بدأ شيفتك اليومي <strong className="font-extrabold">"{missedShiftAlert.shiftName}"</strong> في الساعة <span className="font-mono font-bold">{missedShiftAlert.startTime}</span> ولم تسجل حضورك حتى الآن. يرجى التوجه فوراً لمقر العمل أو تسجيل بصمتك.
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => {
                  setMissedShiftAlert(null);
                  localStorage.removeItem(`missedShiftAlert_${employee.id}`);
                }}
                className="px-4 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
              >
                تجاهل التنبيه 🔕
              </button>
            </div>
          </div>
        )}

                {/* Biometric Enrollment Card */}
        <div className="p-4 bg-white border border-sky-100 rounded-2xl shadow-sm" dir="rtl">
          <div className="flex items-start justify-between gap-3">
            <div className="text-right">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck size={16} className="text-sky-600" />
                <span>تفعيل البصمة البيومترية</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-5">
                فعّل بصمة الوجه أو الإصبع على جهازك لاستخدامها لاحقاً في صفحة تسجيل الدخول.
              </p>
            </div>
            <div
              className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                hasBiometricCredential
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-100'
              }`}
            >
              {hasBiometricCredential ? 'مفعلة' : 'غير مفعلة'}
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg mt-4 w-fit">
            <button
              type="button"
              onClick={() => setBiometricType('face')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                biometricType === 'face' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <ScanFace size={13} />
                بصمة الوجه
              </span>
            </button>
            <button
              type="button"
              onClick={() => setBiometricType('fingerprint')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                biometricType === 'fingerprint' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Fingerprint size={13} />
                بصمة الإصبع
              </span>
            </button>
          </div>

          {!biometricSupported && (
            <div className="mt-3 p-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl">
              هذا الجهاز أو المتصفح لا يدعم WebAuthn. جرّب Safari على iPhone أو Chrome على Android.
            </div>
          )}

          {biometricMessage && (
            <div className="mt-3 p-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl leading-5">
              {biometricMessage}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={startBiometricEnrollment}
              disabled={biometricLoading || !biometricSupported}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {biometricLoading ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  <span>جاري التفعيل...</span>
                </>
              ) : (
                <>
                  {biometricType === 'face' ? <ScanFace size={14} /> : <Fingerprint size={14} />}
                  <span>{hasBiometricCredential ? 'إعادة تسجيل البصمة' : 'تفعيل البصمة الآن'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white border border-sky-100 text-xs">
          <button type="button" disabled={scheduleRefreshing} onClick={() => { void onRefreshSchedule(); }} className="px-3 py-2 rounded-lg bg-sky-100 text-sky-800 font-bold disabled:opacity-50">{scheduleRefreshing ? 'جارٍ تحديث الجدول…' : 'تحديث جدول الدوام'}</button>
          <span>آخر مزامنة مع السيرفر: {scheduleSyncedAt ? new Date(scheduleSyncedAt).toLocaleString('ar-SA', {timeZone:'Asia/Riyadh',numberingSystem:'latn'}) : 'لم يتم التحقق بعد'}</span>
          <span className="text-slate-500">يتحدث تلقائياً خلال دقيقة أثناء فتح التطبيق، وعند العودة إليه أو رجوع الإنترنت.</span>
          {scheduleSyncError && <p role="alert" className="w-full text-amber-800">{scheduleSyncError}</p>}
        </div>
        {/* Month Selector */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border border-sky-100 rounded-2xl shadow-sm">
          <button
            onClick={() => setMonthOffset((prev) => prev - 1)}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-sky-600"
          >
            <ChevronRight size={16} />
            <span>الشهر السابق</span>
          </button>
          <span className="text-sm font-extrabold text-slate-800">
            {MONTHS_AR[showingMonth]} {showingYear}
          </span>
          <button
            onClick={() => setMonthOffset((prev) => prev + 1)}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-sky-600"
          >
            <span>الشهر التالي</span>
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Roster Calendar */}
        <div className="overflow-hidden bg-white border border-sky-100 rounded-2xl shadow-sm w-full mx-auto max-w-full">
          <table className="w-full border-collapse table-fixed select-none">
            <thead>
              <tr className="bg-sky-50">
                {DAYS_AR.map((day, dIdx) => (
                  <th
                    key={day}
                    className={`py-3 text-center text-[11px] sm:text-xs font-bold border-b border-sky-100 ${
                      dIdx === 6 ? 'bg-rose-50/50 text-rose-600 font-extrabold' : 'text-slate-600'
                    }`}
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.ceil(calendarCells.length / 7) }).map((_, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/50 transition-all">
                  {calendarCells.slice(rIdx * 7, (rIdx + 1) * 7).map((cell, cIdx) => {
                    if (cell === null) {
                      return (
                        <td
                          key={cIdx}
                          className="p-1 border border-sky-100 bg-slate-50/10 h-[68px] sm:h-[84px] md:h-[96px] transition-all"
                        ></td>
                      );
                    }

                    const dateStr = `${showingYear}-${String(showingMonth + 1).padStart(2, '0')}-${String(cell).padStart(2, '0')}`;
                    const isToday = dateStr === getTodayStr();

                    // Read shift configuration
                    const assigned = scheduleData[dateStr]?.[employee.id];
                    const stType = assigned?.shiftType || 'A';

                    let cellBg = 'bg-white';
                    let label = assigned?.shiftType ? 'إجازة / راحة' : 'غير مجدول';
                    let labelColor = 'text-slate-400';

                    const matchingShift = (shiftTypes || []).find((s: any) => s.id === stType);
                    if (matchingShift) {
                      label = matchingShift.name;
                      if (matchingShift.type === 'double') {
                        cellBg = 'bg-indigo-50/55 bg-opacity-80';
                        labelColor = 'text-indigo-700';
                      } else if (matchingShift.type === 'evening') {
                        cellBg = 'bg-amber-50/55 bg-opacity-80';
                        labelColor = 'text-amber-700';
                      } else {
                        cellBg = 'bg-emerald-50/55 bg-opacity-80';
                        labelColor = 'text-emerald-700';
                      }
                    } else if (stType === 'S') {
                      cellBg = 'bg-emerald-50 bg-opacity-70';
                      label = 'صباحي';
                      labelColor = 'text-emerald-700';
                    } else if (stType === 'E') {
                      cellBg = 'bg-amber-50 bg-opacity-70';
                      label = 'مسائي';
                      labelColor = 'text-amber-700';
                    }

                    if (cIdx === 6 && stType === 'A') { // Friday column override if no active shift is assigned
                      cellBg = 'bg-rose-50/30';
                      label = 'إجازة جمعة';
                      labelColor = 'text-rose-500';
                    }

                    return (
                      <td
                        key={cIdx}
                        className={`p-1 border border-sky-100 text-center align-middle relative transition-all h-[68px] sm:h-[84px] md:h-[96px] ${cellBg} ${
                          isToday ? 'outline-2 outline-amber-500 shadow-md ring-2 ring-amber-100 z-10' : ''
                        }`}
                        title={assigned?.note ? `ملاحظة: ${assigned.note}` : ''}
                      >
                        <div className="flex flex-col justify-between h-full w-full overflow-hidden select-none">
                          {/* Top row: day number */}
                          <div className={`font-bold text-[11px] sm:text-xs ${isToday ? 'text-amber-600 font-black scale-105' : 'text-slate-700'}`}>
                            {cell}
                            {isToday && <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full mr-1 animate-pulse"></span>}
                          </div>

                          {/* Middle row: Shift type label */}
                          <div className={`text-[9px] sm:text-[10px] font-extrabold truncate ${labelColor} leading-tight`}>
                            {label}
                          </div>

                          {/* Bottom row: hours or notes */}
                          <div className="min-h-[14px] flex items-center justify-center overflow-hidden">
                            {matchingShift ? (
                              <div className="text-[7px] sm:text-[8px] text-slate-500 font-mono scale-95 sm:scale-100 origin-center whitespace-nowrap opacity-90 leading-none">
                                {matchingShift.type === 'double' ? (
                                  <div className="flex flex-col text-[7px] leading-none">
                                    <span className="text-amber-600">🌅 {matchingShift.start}</span>
                                    <span className="text-indigo-600">🌙 {matchingShift.start2 || '17:00'}</span>
                                  </div>
                                ) : (
                                  <span>{matchingShift.start}</span>
                                )}
                              </div>
                            ) : assigned?.note ? (
                              <div className="text-[7px] sm:text-[8px] text-slate-400 truncate bg-slate-100 px-0.5 py-0.5 rounded leading-none w-full text-center" title={assigned.note}>
                                ✏️ {assigned.note}
                              </div>
                            ) : (
                              <span className="text-[8px] text-slate-300">-</span>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Punch Clock Module */}
        <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm pb-3 border-b border-sky-50">
            <Clock size={16} className="text-sky-500" />
            <span>تسجيل حضور وانصراف اليوم</span>
          </div>

          {attendanceStatus === 'checking' && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader size={14} className="animate-spin text-sky-500" />
              <span>جاري التحقق من سجل دوام اليوم...</span>
            </div>
          )}

          {attendanceStatus === 'not-checked-in' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 items-start text-xs text-amber-800">
                <AlertCircle size={15} className="mt-0.5" />
                <div>
                  <span className="font-extrabold text-sm block mb-1">لم يتم تسجيل حضورك بعد</span>
                  يرجى تسليم إحداثيات الموقع (GPS) عند الكبس على تسجيل إذا كان النطاق مطبقاً.
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-md transition-all text-xs disabled:opacity-75"
                >
                  {actionLoading ? <Loader size={14} className="animate-spin" /> : <span>📍 تسجيل حضور</span>}
                </button>
                <button
                  onClick={loadAttendanceStatus}
                  className="flex items-center gap-1 px-4 py-2 hover:bg-slate-50 border rounded-xl text-slate-500 transition-all text-xs"
                >
                  <RefreshCw size={12} />
                  <span>تحديث</span>
                </button>
              </div>
            </div>
          )}

          {attendanceStatus === 'not-checked-in-2' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex gap-2 items-start text-xs text-amber-800">
                <AlertCircle size={15} className="mt-0.5" />
                <div>
                  <span className="font-extrabold text-sm block mb-1">انتهت الفترة الأولى • يرجى تسجيل حضور الفترة الثانية</span>
                  وقت الفترة الأولى: دخول ({todayRecord?.checkIn}) انصراف ({todayRecord?.checkOut}).
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-md transition-all text-xs disabled:opacity-75"
                >
                  {actionLoading ? <Loader size={14} className="animate-spin" /> : <span>📍 تسجيل حضور الفترة الثانية</span>}
                </button>
                <button
                  onClick={loadAttendanceStatus}
                  className="flex items-center gap-1 px-4 py-2 hover:bg-slate-50 border rounded-xl text-slate-500 transition-all text-xs"
                >
                  <RefreshCw size={12} />
                  <span>تحديث</span>
                </button>
              </div>
            </div>
          )}

          {attendanceStatus === 'checked-in' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-2.5 items-start text-xs text-emerald-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping mt-1"></span>
                <div>
                  <span className="font-extrabold text-sm block mb-0.5">أنت حاضر الآن في الدوام</span>
                  وقت الدخول المسجل: <strong className="text-emerald-700">{todayRecord?.checkIn}</strong>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCheckOut}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md transition-all text-xs disabled:opacity-75"
                >
                  {actionLoading ? <Loader size={14} className="animate-spin" /> : <span>👋 تسجيل انصراف</span>}
                </button>
                <button
                  onClick={loadAttendanceStatus}
                  className="flex items-center gap-1 px-4 py-2 hover:bg-slate-50 border rounded-xl text-slate-500 transition-all text-xs"
                >
                  <RefreshCw size={12} />
                  <span>تحديث</span>
                </button>
              </div>
            </div>
          )}

          {attendanceStatus === 'checked-in-2' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-2.5 items-start text-xs text-emerald-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping mt-1"></span>
                <div>
                  <span className="font-extrabold text-sm block mb-0.5 font-bold">أنت حاضر للفترة الثانية في الدوام</span>
                  وقت دخول الفترة الثانية المعتمدة: <strong className="text-emerald-700">{todayRecord?.checkIn2}</strong>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleCheckOut}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md transition-all text-xs disabled:opacity-75"
                >
                  {actionLoading ? <Loader size={14} className="animate-spin" /> : <span>👋 تسجيل انصراف الفترة الثانية</span>}
                </button>
                <button
                  onClick={loadAttendanceStatus}
                  className="flex items-center gap-1 px-4 py-2 hover:bg-slate-50 border rounded-xl text-slate-500 transition-all text-xs"
                >
                  <RefreshCw size={12} />
                  <span>تحديث</span>
                </button>
              </div>
            </div>
          )}

          {attendanceStatus === 'checked-out' && (
            <div className="p-4 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800">
              <span className="font-extrabold text-sm block mb-1">✅ انتهت نوبة عملك اليوم بنجاح</span>
              <div className="flex flex-col gap-1 my-1">
                <div>• الحضور: <strong className="font-bold">{todayRecord?.checkIn}</strong> | الانصراف: <strong className="font-bold">{todayRecord?.checkOut}</strong></div>
                {todayRecord?.checkIn2 && (
                  <div>• الفترة الثانية: حضور <strong className="font-bold">{todayRecord?.checkIn2}</strong> | انصراف <strong className="font-bold">{todayRecord?.checkOut2 || 'مستمر'}</strong></div>
                )}
              </div>
              {todayRecord?.note && (
                <div className="mt-2.5 text-[10.5px] font-bold text-indigo-700 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/50">
                  👮 ملاحظة الإدارة: {todayRecord.note}
                </div>
              )}
              {todayRecord?.checkInTs && todayRecord?.checkOutTs && (
                <div className="mt-2 bg-white inline-block px-2 py-0.5 rounded text-[10px] font-extrabold text-sky-600 shadow-sm">
                  ⏱️ مدة العمل الكلية:{' '}
                  {Math.floor(((todayRecord.checkOutTs - todayRecord.checkInTs) + (todayRecord.checkOutTs2 && todayRecord.checkInTs2 ? (todayRecord.checkOutTs2 - todayRecord.checkInTs2) : 0)) / 3600000)}ساعة{' '}
                  {Math.round((((todayRecord.checkOutTs - todayRecord.checkInTs) + (todayRecord.checkOutTs2 && todayRecord.checkInTs2 ? (todayRecord.checkOutTs2 - todayRecord.checkInTs2) : 0)) % 3600000) / 60000)}دقيقة
                </div>
              )}
            </div>
          )}

          {geoStatus && (
            <div className="text-xs font-bold text-slate-600 bg-slate-50 px-3.5 py-2.5 rounded-xl border">
              {geoStatus}
            </div>
          )}
        </div>

        {/* Automatic Geofencing Punch Card */}
        <div className="p-6 bg-gradient-to-br from-slate-900 to-indigo-950 border border-indigo-900 rounded-2xl shadow-xl text-white flex flex-col gap-5 relative overflow-hidden">
          {/* Subtle decorative lights */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-sky-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl"></div>

          <div className="flex items-center justify-between pb-3 border-b border-indigo-800/60 z-10">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-500/20 rounded-xl text-sky-400">
                <Clock size={16} className="animate-pulse" />
              </span>
              <div>
                <h3 className="font-extrabold text-sm text-indigo-100">نظام البصمة التلقائي والتنبيه الذكي (Geofencing)</h3>
                <p className="text-[10px] text-indigo-300">حضور بعد ثبات الموقع، وتذكير بالانصراف للتأكيد أثناء فتح التطبيق</p>
              </div>
            </div>
            {(autoCheckIn || autoCheckOut) && (
              <span className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                الفحص مفعّل أثناء الاستخدام
              </span>
            )}
          </div>

          {/* Quick Permission Grants section */}
          <div className="p-3.5 bg-sky-950/45 border border-sky-900/40 rounded-xl flex flex-col gap-2.5 z-10">
            <span className="text-[11px] font-extrabold text-sky-300 flex items-center gap-1">
              📱 خطوة هامة: تفعيل إذن الموقع والتنبيهات على الهاتف:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={requestAlwaysLocationPermission}
                className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-[11px] font-bold transition-all text-right flex items-center justify-between"
              >
                <span>1. طلب إذن الموقع أثناء الاستخدام</span>
                <span className="font-mono text-[9px] bg-sky-900/40 px-1.5 py-0.5 rounded">اضغط هنا 📍</span>
              </button>
              <button
                onClick={requestNotificationPermission}
                className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-[11px] font-bold transition-all text-right flex items-center justify-between"
              >
                <span>2. تفعيل التنبيهات المباشرة على الجوال</span>
                <span className="font-mono text-[9px] bg-sky-900/40 px-1.5 py-0.5 rounded">
                  {notificationPermissionState === 'granted' ? '✅ مفعلة' : 'اضغط للتفعيل 🔔'}
                </span>
              </button>
            </div>
            <p className="text-[9px] text-slate-300 leading-normal">
              لتشغيل البصمة افتح التطبيق واسمح بالموقع. تثبيت الـPWA لا يضمن استمرار GPS والشاشة مقفلة؛ يستأنف الفحص عند الرجوع.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-1 z-10">
            {/* Toggle 1: Auto Check in */}
            <label className="flex items-center justify-between p-3.5 bg-indigo-950/40 border border-indigo-800/40 rounded-xl cursor-pointer hover:bg-indigo-900/40 transition-all">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-slate-100">بصمة الحضور تلقائياً عند الدخول</span>
                <span className="text-[9.5px] text-indigo-300">يسجل حضور فور وصولك لنطاق الشركة</span>
              </div>
              <input
                type="checkbox"
                checked={autoCheckIn}
                onChange={(e) => setAutoCheckIn(e.target.checked)}
                className="w-10 h-5 bg-indigo-900 rounded-full appearance-none relative before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:bg-sky-500 checked:before:translate-x-5 before:transition-all cursor-pointer"
              />
            </label>

            {/* Toggle 2: Auto Check out */}
            <label className="flex items-center justify-between p-3.5 bg-indigo-950/40 border border-indigo-800/40 rounded-xl cursor-pointer hover:bg-indigo-900/40 transition-all">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-slate-100">تذكير بالانصراف عند الخروج أو نهاية الدوام</span>
                <span className="text-[9.5px] text-indigo-300">يسجل انصراف بمجرد مغادرتك للموقع</span>
              </div>
              <input
                type="checkbox"
                checked={autoCheckOut}
                onChange={(e) => setAutoCheckOut(e.target.checked)}
                className="w-10 h-5 bg-indigo-900 rounded-full appearance-none relative before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:bg-sky-500 checked:before:translate-x-5 before:transition-all cursor-pointer"
              />
            </label>
          </div>

          {/* Smart Check Scheduling configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 z-10 p-4 bg-indigo-950/45 border border-indigo-900/50 rounded-xl">
            {/* Check interval & Mode */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-extrabold text-indigo-200">⏱️ نظام الجدولة والتحقق الذكي:</span>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="text-[10px] text-slate-300 font-bold">نمط التحقق التلقائي عبر الـ GPS</label>
                <select
                  value={autoCheckMode}
                  onChange={(e) => setAutoCheckMode(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-indigo-900/60 border border-indigo-800 rounded-lg text-xs font-bold text-white focus:outline-none"
                >
                  <option value="shift" className="bg-indigo-950">تلقائياً خلال أوقات الدوام فقط 💼</option>
                  <option value="scheduled" className="bg-indigo-950">في توقيت مخصص يتم تحديده 🔔</option>
                </select>
              </div>

              {autoCheckMode === 'scheduled' && (
                <div className="flex flex-col gap-1.5 text-xs">
                  <label className="text-[10px] text-slate-300 font-bold">التوقيت المخصص للتحقق اليومي</label>
                  <input
                    type="time"
                    value={scheduledCheckTime}
                    onChange={(e) => setScheduledCheckTime(e.target.value)}
                    className="px-2.5 py-1 bg-indigo-900/60 border border-indigo-800 rounded-lg text-xs font-mono font-bold text-white focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-extrabold text-indigo-200">⚙️ إعدادات الحضور والتذكير:</span>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="text-[10px] text-slate-300 font-bold">الفاصل بين الفحوص المستقرة (يقصر عند تأكيد الموقع)</label>
                <select
                  value={autoCheckInterval}
                  onChange={(e) => setAutoCheckInterval(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-indigo-900/60 border border-indigo-800 rounded-lg text-xs font-bold text-white focus:outline-none"
                >
                  <option value="1" className="bg-indigo-950">كل دقيقة</option>
                  <option value="2" className="bg-indigo-950">كل دقيقتين</option>
                  <option value="5" className="bg-indigo-950">كل 5 دقائق — موصى به</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[10px] text-slate-300 font-bold">تذكير عند فتح التطبيق إذا فات موعد الدوام</span>
                <input
                  type="checkbox"
                  checked={enableMissedShiftAlert}
                  onChange={(e) => setEnableMissedShiftAlert(e.target.checked)}
                  className="w-8 h-4 bg-indigo-900 rounded-full appearance-none relative before:content-[''] before:absolute before:h-3 before:w-3 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:bg-emerald-500 checked:before:translate-x-4 before:transition-all cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-indigo-950/60 border border-indigo-800/60 rounded-xl flex flex-col gap-2 z-10 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="font-bold text-[11px]">حالة التتبع الجغرافي للشبكة:</span>
              {currentDistance !== null ? (
                <span className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-sky-400 font-extrabold">
                  المسافة للموقع: {currentDistance} م
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">جاري مسح الإشارة...</span>
              )}
            </div>

            <div className="text-slate-200 text-[11px] flex items-center gap-1.5 font-semibold">
              <span className={`w-2 h-2 rounded-full ${autoCheckIn || autoCheckOut ? 'bg-sky-400 animate-pulse' : 'bg-slate-500'}`}></span>
              <span>{autoStatusText}</span>
            </div>

            <p className="text-[11px] text-slate-300">دقة GPS: {gpsAccuracy === null ? 'غير متاحة' : `${gpsAccuracy} م`} — آخر حضور تلقائي أكد الخادم حفظه: {lastAutoSaved || 'لا يوجد في هذه الجلسة'}</p>
            <p className="text-[10px] text-indigo-300">الفحص أثناء فتح الـPWA فقط. لا تُحفظ بصمة دون اتصال أو عند إخفاء التطبيق؛ افتحه قرب وقت الحضور والانصراف.</p>
            {departureHint && departureHint.id === todayRecord?.id && <div className="p-3 border border-amber-400 rounded-lg"><p>{departureHint.text}</p><button disabled={actionLoading} onClick={() => { void handleCheckOut(); }} className="mt-2 px-3 py-2 bg-amber-500 text-slate-900 rounded-lg font-bold">تأكيد الانصراف الآن</button><button onClick={() => setDepartureHint(null)} className="mr-3 underline">ما زلت أعمل</button></div>}
            {/* Auto logs */}
            {autoLogs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-indigo-900">
                <div className="text-[10px] text-indigo-300 block mb-1.5 font-bold">آخر عمليات البصمة والتحقق:</div>
                <div className="flex flex-col gap-1">
                  {autoLogs.map((log, index) => (
                    <div key={index} className="text-[10.5px] text-slate-300 bg-slate-900/35 px-2 py-1 rounded border border-indigo-900/30">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Requests Management Buttons */}
        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={() => { setRequestType('leave'); setRequestModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-3 hover:transform hover:-translate-y-0.5 hover:shadow bg-white text-slate-700 border rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <CalendarOff size={14} className="text-rose-500" />
            <span>طلب إجازة</span>
          </button>
          
          <button
            onClick={() => { setRequestType('shift_change'); setRequestModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-3 hover:transform hover:-translate-y-0.5 hover:shadow bg-white text-slate-700 border rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <Repeat size={14} className="text-emerald-500" />
            <span>تغيير شيفت الدوام</span>
          </button>
          
          <button
            onClick={() => { setRequestType('swap'); setRequestModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-3 hover:transform hover:-translate-y-0.5 hover:shadow bg-white text-slate-700 border rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <ArrowRightLeft size={14} className="text-amber-500" />
            <span>طلب تبديل مع زميل آخر</span>
          </button>

          <button
            onClick={() => { setRequestType('attendance_adjustment' as any); setRequestModalOpen(true); }}
            className="flex items-center gap-2 px-5 py-3 hover:transform hover:-translate-y-0.5 hover:shadow bg-white text-slate-700 border rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <Clock size={14} className="text-sky-500" />
            <span>طلب تعديل بصمة تاريخ معين</span>
          </button>
        </div>

        {/* Requests Status list */}
        <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-slate-800 text-sm mb-4">قائمة طلباتي الأخيرة</h3>
          {reqsLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">جاري تحميل الطلبات...</div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">لا توجد طلبات سابقة معلّقة أو مسجلة.</div>
          ) : (
            <div className="flex flex-col divider">
              {requests.map((r) => {
                let badgeStyle = 'bg-amber-50 text-amber-700';
                let statusLabel = '⏳ قيد المراجعة';
                if (r.status === 'approved') {
                  badgeStyle = 'bg-emerald-50 text-emerald-700';
                  statusLabel = '✅ مقبول';
                } else if (r.status === 'rejected') {
                  badgeStyle = 'bg-rose-50 text-rose-700';
                  statusLabel = '❌ مرفوض';
                }

                let reqTitle = 'طلب إجازة';
                if (r.type === 'shift_change') reqTitle = 'تغيير شيفت الدوام';
                if (r.type === 'swap') reqTitle = `تبديل مع: ${r.swapWithEmpName || 'زميل'}`;
                if (r.type === 'attendance_adjustment') reqTitle = `تعديل بصمة: حضور (${r.checkInTime || '-'}) وانصراف (${r.checkOutTime || '-'})`;

                return (
                  <div key={r.id} className="flex justify-between items-center py-3.5 border-b last:border-0 border-slate-50 text-xs">
                    <div>
                      <div className="font-extrabold text-slate-800">{reqTitle}</div>
                      <div className="text-slate-400 text-[10px] mt-1">
                        تاريخ الدوام: <strong className="font-bold text-slate-600">{r.date}</strong>
                        {r.note && <span className="block mt-0.5 text-slate-500">✏️ {r.note}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${badgeStyle}`}>
                        {statusLabel}
                      </span>
                      {r.reviewedBy && (
                        <div className="text-[9px] text-slate-400 text-left">
                          بواسطة: {r.reviewedBy}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Design and Development Footer credit */}
      <footer className="my-8 text-center text-[11px] text-slate-400 font-sans tracking-wide">
        التصميم والتطوير عن طريق <strong className="text-slate-500 font-extrabold hover:text-sky-500 transition-colors">SHADY NASSEF</strong> &nbsp;•&nbsp; جميع الحقوق محفوظة © 2026
      </footer>

      {/* Requests Creator Modal */}
      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-sky-100">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b">
              {requestType === 'leave' && 'تقديم طلب إجازة'}
              {requestType === 'shift_change' && 'طلب تغيير شيفت الدوام'}
              {requestType === 'swap' && 'طلب تبديل شيفت مع زميل'}
              {(requestType as any) === 'attendance_adjustment' && 'طلب تعديل لقطات البصمة الرياضية'}
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-600">تاريخ اليوم المرجو</label>
                <input
                  type="date"
                  value={reqDate}
                  onChange={(e) => setReqDate(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              {requestType === 'swap' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">اختر الزميل البديل</label>
                  <select
                    value={reqSwapEmpId}
                    onChange={(e) => setReqSwapEmpId(e.target.value)}
                    className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                  >
                    <option value="">-- اختر موظف من القائمة --</option>
                    {employees
                      .filter((emp) => emp.id !== employee.id)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {requestType === 'shift_change' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">الشيفت البديل المطلوب</label>
                  <select
                    value={reqTargetShift}
                    onChange={(e) => setReqTargetShift(e.target.value)}
                    className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                  >
                    <option value="S">🌅 صباحي</option>
                    <option value="E">🌙 مسائي</option>
                    <option value="A">إجازة</option>
                  </select>
                </div>
              )}

              {(requestType as any) === 'attendance_adjustment' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-600">وقت الدخول المطلوب</label>
                    <input
                      type="time"
                      value={reqCheckInTime}
                      onChange={(e) => setReqCheckInTime(e.target.value)}
                      className="px-2 py-1 border rounded bg-white text-xs text-center font-mono focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-600">وقت الخروج المطلوب</label>
                    <input
                      type="time"
                      value={reqCheckOutTime}
                      onChange={(e) => setReqCheckOutTime(e.target.value)}
                      className="px-2 py-1 border rounded bg-white text-xs text-center font-mono focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-600">ملاحظات / أسباب إضافية</label>
                <textarea
                  value={reqNote}
                  onChange={(e) => setReqNote(e.target.value)}
                  placeholder="يرجى كتابة سبب طلب إجازة..."
                  rows={3}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t">
                <button
                  onClick={() => setRequestModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleRequestSubmit}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs"
                >
                  إرسال الطلب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-full">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 mt-2">تأكيد الإجراء</h3>
              <p className="text-xs text-slate-500 mt-1">{confirmModal.message}</p>
            </div>

            <div className="flex gap-2 justify-center mt-2 pt-2 border-t text-xs">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 hover:bg-slate-100 border rounded-lg text-slate-500 font-bold w-1/2"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  confirmModal.onConfirm();
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold w-1/2"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
