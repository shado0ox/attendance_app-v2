import { useState, useEffect, useRef } from 'react';
import { Key, LogOut, ChevronRight, ChevronLeft, CalendarOff, Repeat, ArrowRightLeft, Clock, RefreshCw, Loader, AlertCircle } from 'lucide-react';

interface EmployeePortalProps {
  employee: any;
  appSettings: any;
  departments: any[];
  employees: any[];
  shiftTypes?: any[];
  schedule?: any;
  onLogout: () => void;
  onOpenChangePassword: () => void;
}

export default function EmployeePortal({
  employee,
  appSettings,
  departments,
  employees,
  shiftTypes = [],
  schedule = {},
  onLogout,
  onOpenChangePassword
}: EmployeePortalProps) {
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
  const [autoLogs, setAutoLogs] = useState<string[]>([]);

  // New Smart Background / Scheduled GPS Settings
  const [autoCheckMode, setAutoCheckMode] = useState<'always' | 'shift' | 'scheduled'>(() => {
    return (localStorage.getItem(`autoCheckMode_${employee.id}`) as any) || 'shift';
  });
  const [autoCheckInterval, setAutoCheckInterval] = useState<number>(() => {
    return Number(localStorage.getItem(`autoCheckInterval_${employee.id}`)) || 15;
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

  const stateRef = useRef({
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

  const executePunchInBackground = async (lat: number, lng: number, period: 'first' | 'second') => {
    try {
      const todayStr = getTodayStr();
      const formattedTime = new Date().toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
      });

      if (period === 'second') {
        const tr = stateRef.current.todayRecord;
        if (!tr) return;
        const updateData = {
          id: tr.id,
          checkIn2: formattedTime,
          checkInTs2: Date.now(),
          checkInLat2: lat,
          checkInLng2: lng,
          note: (tr.note ? tr.note + ' ' : '') + '[حضور تلقائي عبر GPS]',
          source: 'المقر (تلقائي)'
        };
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        if (!response.ok) throw new Error('فشل الحفظ على الخادم');
        setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ✅ تم الحضور التلقائي للفترة الثانية.`, ...prev.slice(0, 4)]);
      } else {
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
          source: 'المقر (تلقائي)',
          note: 'حضور تلقائي عبر GPS',
          checkInLat: lat,
          checkInLng: lng
        };
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('فشل تسجيل الحضور على الخادم');
        setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ✅ تم تسجيل حضورك التلقائي بنجاح.`, ...prev.slice(0, 4)]);
      }
      await loadAttendanceStatus();
    } catch (e: any) {
      console.error('Error auto-punch checkin:', e);
      setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ❌ فشل البصم التلقائي: ${e.message}`, ...prev.slice(0, 4)]);
    }
  };

  const executePunchOutBackground = async () => {
    try {
      const tr = stateRef.current.todayRecord;
      if (!tr?.id) return;
      const formattedTime = new Date().toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const isDouble = isTodayRecordShiftDouble();
      const isPeriod2 = isDouble && tr.checkOut;

      const updateData = isPeriod2 ? {
        id: tr.id,
        checkOut2: formattedTime,
        checkOutTs2: Date.now(),
        note: (tr.note ? tr.note + ' ' : '') + '[انصراف تلقائي عبر GPS]',
        source: tr.source || 'المقر (تلقائي)'
      } : {
        id: tr.id,
        checkOut: formattedTime,
        checkOutTs: Date.now(),
        note: (tr.note ? tr.note + ' ' : '') + '[انصراف تلقائي عبر GPS]',
        source: tr.source || 'المقر (تلقائي)'
      };

      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      if (!response.ok) throw new Error('فشل تسجيل الانصراف على الخادم');

      setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ✅ تم الانصراف التلقائي بنجاح.`, ...prev.slice(0, 4)]);
      await loadAttendanceStatus();
    } catch (e: any) {
      console.error('Error auto-punch checkout:', e);
      setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ❌ فشل الانصراف التلقائي: ${e.message}`, ...prev.slice(0, 4)]);
    }
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
    const sched = schedule && Object.keys(schedule).length > 0 ? schedule : getLocalScheduleData();
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
      new Notification('⚠️ تنبيه: فاتك موعد الدوام!', {
        body: `لقد بدأ شيفت "${shiftName}" في الساعة ${startTime} ولم تقم بتسجيل حضورك حتى الآن!`,
        dir: 'rtl'
      });
    }
    
    setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] ⚠️ تم إرسال تنبيه: لقد فاتك موعد الدوام الجاري!`, ...prev.slice(0, 4)]);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermissionState(permission);
      if (permission === 'granted') {
        new Notification('✅ تم تفعيل التنبيهات على الجوال', {
          body: 'سوف نرسل لك تنبيهات مباشرة إذا فاتك موعد الدوام أو عند تسجيل البصمة تلقائياً.',
          dir: 'rtl'
        });
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
          alert('✅ تم الوصول للموقع الجغرافي بنجاح. لتفعيل التتبع الدائم بالخلفية، يرجى التأكد من اختيار "السماح دائماً" (Always Allow) في إعدادات موقع متصفحك أو جهازك.');
        },
        (err) => {
          alert(`❌ تعذر الوصول للموقع: ${err.message}. يرجى التحقق من تفعيل الـ GPS وإذن المتصفح.`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  // Background interval check worker (runs every 1 minute)
  useEffect(() => {
    const intervalId = setInterval(async () => {
      const mode = stateRef.current.autoCheckMode;
      const interval = stateRef.current.autoCheckInterval;
      const schedTime = stateRef.current.scheduledCheckTime;
      const autoIn = stateRef.current.autoCheckIn;
      const settings = stateRef.current.appSettings;
      
      const todayShift = getTodayShift();
      if (!todayShift || todayShift.id === 'OFF' || todayShift.id === 'A') {
        return; // No work today
      }

      const now = new Date();
      const currentHour = String(now.getHours()).padStart(2, '0');
      const currentMinute = String(now.getMinutes()).padStart(2, '0');
      const minutesToday = now.getHours() * 60 + now.getMinutes();

      // Helper to parse HH:MM to minutes today
      const parseTimeToMins = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };

      let shouldPerformGPSCheck = false;

      // 1. Determine if we should perform check based on mode
      if (mode === 'always') {
        // Always mode: Check based on interval (e.g. every 15 mins)
        if (now.getMinutes() % interval === 0) {
          shouldPerformGPSCheck = true;
        }
      } else if (mode === 'shift') {
        // Shift hours mode: check from 30 minutes before shift start, until shift end, in interval
        const shiftStartMins = parseTimeToMins(todayShift.start);
        const shiftEndMins = parseTimeToMins(todayShift.end);
        
        // Handle overnight shifts or normal day shifts
        let isInsideShiftWindow = false;
        if (shiftEndMins >= shiftStartMins) {
          isInsideShiftWindow = (minutesToday >= shiftStartMins - 30) && (minutesToday <= shiftEndMins);
        } else {
          // Overnight shift (e.g. 22:00 to 06:00)
          isInsideShiftWindow = (minutesToday >= shiftStartMins - 30) || (minutesToday <= shiftEndMins);
        }

        // Also check second period if double shift
        if (todayShift.type === 'double' && todayShift.start2 && todayShift.end2) {
          const shiftStartMins2 = parseTimeToMins(todayShift.start2);
          const shiftEndMins2 = parseTimeToMins(todayShift.end2);
          let isInsideShiftWindow2 = false;
          if (shiftEndMins2 >= shiftStartMins2) {
            isInsideShiftWindow2 = (minutesToday >= shiftStartMins2 - 30) && (minutesToday <= shiftEndMins2);
          } else {
            isInsideShiftWindow2 = (minutesToday >= shiftStartMins2 - 30) || (minutesToday <= shiftEndMins2);
          }
          if (isInsideShiftWindow2) isInsideShiftWindow = true;
        }

        if (isInsideShiftWindow && (now.getMinutes() % interval === 0)) {
          shouldPerformGPSCheck = true;
        }
      } else if (mode === 'scheduled') {
        // Scheduled check mode: checks exactly at user-defined scheduled time
        const schedMins = parseTimeToMins(schedTime);
        const diffFromSched = minutesToday - schedMins;
        // Check if we are within the interval window of the scheduled time to avoid skipping
        if (diffFromSched >= 0 && diffFromSched < interval && (now.getMinutes() % interval === 0)) {
          shouldPerformGPSCheck = true;
        }
      }

      // 2. Perform GPS check if needed
      if (shouldPerformGPSCheck && autoIn) {
        const loc = settings?.officeLocation;
        if (loc && loc.lat && loc.lng) {
          const officeLat = parseFloat(loc.lat);
          const officeLng = parseFloat(loc.lng);
          const radiusLimit = parseInt(loc.radius) || 150;
          
          if (!isNaN(officeLat) && !isNaN(officeLng)) {
            navigator.geolocation.getCurrentPosition(
              async (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                const diff = getDistance(userLat, userLng, officeLat, officeLng);
                setCurrentDistance(Math.round(diff));
                const isInside = diff <= radiusLimit;

                const activeStatus = stateRef.current.attendanceStatus;

                if (isInside) {
                  setAutoStatusText(`📍 أنت داخل مقر العمل (${Math.round(diff)} م) • نطاق البصم متاح ✅`);
                  if (activeStatus === 'not-checked-in') {
                    setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] 🚀 فحص ذكي مجدول: تم رصدك بالموقع، جاري تسجيل حضورك...`, ...prev.slice(0, 4)]);
                    await executePunchInBackground(userLat, userLng, 'first');
                  } else if (activeStatus === 'not-checked-in-2') {
                    setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] 🚀 فحص ذكي مجدول: تم رصدك بالموقع للفترة الثانية، جاري تسجيل حضورك...`, ...prev.slice(0, 4)]);
                    await executePunchInBackground(userLat, userLng, 'second');
                  }
                } else {
                  setAutoStatusText(`📍 أنت خارج مقر العمل بمسافة (${Math.round(diff)} م) 🚫`);
                }
              },
              (err) => {
                console.error('Scheduled GPS error:', err);
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          }
        }
      }

      // 3. Missed Shift Alert evaluation
      if (stateRef.current.enableMissedShiftAlert) {
        const shiftStartMins = parseTimeToMins(todayShift.start);
        const activeStatus = stateRef.current.attendanceStatus;

        // If shift has started and they are not checked in
        if (activeStatus === 'not-checked-in') {
          // If 15 minutes or more has passed since shift start
          if (minutesToday >= shiftStartMins + 15 && minutesToday < shiftStartMins + 240) { // check for 4 hours window
            // Query position first to check if they are outside
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const userLat = pos.coords.latitude;
                const userLng = pos.coords.longitude;
                const loc = settings?.officeLocation;
                if (loc && loc.lat && loc.lng) {
                  const officeLat = parseFloat(loc.lat);
                  const officeLng = parseFloat(loc.lng);
                  const radiusLimit = parseInt(loc.radius) || 150;
                  const diff = getDistance(userLat, userLng, officeLat, officeLng);
                  if (diff > radiusLimit) {
                    // Outside location and missed start! Trigger alert!
                    triggerMissedShiftAlert(todayShift.name, todayShift.start);
                  }
                }
              },
              () => {
                // If GPS failed but we are late, we still alert to be safe
                triggerMissedShiftAlert(todayShift.name, todayShift.start);
              },
              { enableHighAccuracy: false, timeout: 8000 }
            );
          }
        }

        // Also check period 2 if double shift
        if (todayShift.type === 'double' && todayShift.start2 && activeStatus === 'not-checked-in-2') {
          const shiftStartMins2 = parseTimeToMins(todayShift.start2);
          if (minutesToday >= shiftStartMins2 + 15 && minutesToday < shiftStartMins2 + 240) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const userLat = pos.coords.latitude;
                const userLng = pos.coords.longitude;
                const loc = settings?.officeLocation;
                if (loc && loc.lat && loc.lng) {
                  const officeLat = parseFloat(loc.lat);
                  const officeLng = parseFloat(loc.lng);
                  const radiusLimit = parseInt(loc.radius) || 150;
                  const diff = getDistance(userLat, userLng, officeLat, officeLng);
                  if (diff > radiusLimit) {
                    triggerMissedShiftAlert(`${todayShift.name} (الفترة الثانية)`, todayShift.start2 || '17:00');
                  }
                }
              },
              () => {
                triggerMissedShiftAlert(`${todayShift.name} (الفترة الثانية)`, todayShift.start2 || '17:00');
              },
              { enableHighAccuracy: false, timeout: 8000 }
            );
          }
        }
      }

    }, 60000); // Check every 60 seconds

    return () => clearInterval(intervalId);
  }, [autoCheckMode, autoCheckInterval, scheduledCheckTime, enableMissedShiftAlert, autoCheckIn, schedule, shiftTypes]);

  // Original Geofencing Background Watcher Worker (Runs continuously in response to GPS/watchPosition changes)
  useEffect(() => {
    const currentAutoCheckIn = stateRef.current.autoCheckIn;
    const currentAutoCheckOut = stateRef.current.autoCheckOut;

    if (!currentAutoCheckIn && !currentAutoCheckOut) {
      setAutoStatusText('البصمة التلقائي عبر الـ GPS غير مفعلة');
      setCurrentDistance(null);
      return;
    }

    const loc = stateRef.current.appSettings?.officeLocation;
    if (!loc || !loc.lat || !loc.lng) {
      setAutoStatusText('⚠️ إحداثيات مقر العمل غير حددتها الإدارة');
      return;
    }

    const officeLat = parseFloat(loc.lat);
    const officeLng = parseFloat(loc.lng);
    const radiusLimit = parseInt(loc.radius) || 150;

    if (isNaN(officeLat) || isNaN(officeLng)) {
      setAutoStatusText('⚠️ إحداثيات مقر العمل غير صالحة');
      return;
    }

    setAutoStatusText('📡 جاري تتبع الموقع التلقائي بالخلفية...');

    let watchId: number | null = null;
    let outsideCounter = 0;

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const diff = getDistance(userLat, userLng, officeLat, officeLng);
          setCurrentDistance(Math.round(diff));

          const isInside = diff <= radiusLimit;
          const activeStatus = stateRef.current.attendanceStatus;
          const activeAutoCheckIn = stateRef.current.autoCheckIn;
          const activeAutoCheckOut = stateRef.current.autoCheckOut;

          if (isInside) {
            outsideCounter = 0;
            setAutoStatusText(`📍 أنت داخل مقر العمل (${Math.round(diff)} م) • نطاق البصم متاح ✅`);

            if (activeAutoCheckIn) {
              if (activeStatus === 'not-checked-in') {
                setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] 🚀 تم رصد دخولك للموقع، جاري تسجيل الحضور...`, ...prev.slice(0, 4)]);
                await executePunchInBackground(userLat, userLng, 'first');
              } else if (activeStatus === 'not-checked-in-2') {
                setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] 🚀 تم رصد دخولك للموقع للفترة الثانية، جاري تسجيل الحضور...`, ...prev.slice(0, 4)]);
                await executePunchInBackground(userLat, userLng, 'second');
              }
            }
          } else {
            setAutoStatusText(`📍 أنت خارج مقر العمل بمسافة (${Math.round(diff)} م) 🚫`);

            if (activeAutoCheckOut) {
              if (activeStatus === 'checked-in' || activeStatus === 'checked-in-2') {
                outsideCounter++;
                if (outsideCounter >= 2) { // confirm departure to avoid GPS spikes
                  setAutoLogs((prev) => [`[${new Date().toLocaleTimeString('ar-EG')}] 🚶 تم رصد خروجك من الموقع، جاري تسجيل الانصراف...`, ...prev.slice(0, 4)]);
                  await executePunchOutBackground();
                  outsideCounter = 0;
                }
              }
            }
          }
        },
        (error) => {
          console.error('Error auto punch GPS:', error);
          setAutoStatusText(`⚠️ عذرًا، تعذر رصد الإشارة التلقائية: ${error.message}`);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } else {
      setAutoStatusText('⚠️ جهازك لا يدعم تتبع الموقع بالخلفية');
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [autoCheckIn, autoCheckOut, attendanceStatus, employee.id, appSettings]);

  const DAYS_AR = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const MONTHS_AR = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  // Helper date conversions
  const getTodayStr = () => {
    const t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  };

  const getLocalScheduleData = () => {
    const localDataStr = localStorage.getItem('schedule_mainData') || '{}';
    try {
      const raw = JSON.parse(localDataStr);
      return raw.schedule || {};
    } catch (e) {
      return {};
    }
  };

  const isTodayRecordShiftDouble = (): boolean => {
    const todayStr = getTodayStr();
    const sched = schedule && Object.keys(schedule).length > 0 ? schedule : getLocalScheduleData();
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
      const response = await fetch('/api/requests');
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

  const loadAttendanceStatus = async () => {
    setAttendanceStatus('checking');
    try {
      const todayStr = getTodayStr();
      const response = await fetch('/api/attendance');
      if (!response.ok) {
        throw new Error('فشل تحميل البيانات من الخادم المساعد');
      }
      const list = await response.json();
      const record = list.find((r: any) => r.empId === employee.id && r.date === todayStr);

      if (!record) {
        setAttendanceStatus('not-checked-in');
        setTodayRecord(null);
      } else {
        setTodayRecord(record);
        
        const isDouble = isTodayRecordShiftDouble();

        if (isDouble) {
          if (!record.checkOut) {
            setAttendanceStatus('checked-in'); // First period check-in
          } else if (!record.checkIn2) {
            setAttendanceStatus('not-checked-in-2'); // Ready for Second period check-in
          } else if (!record.checkOut2) {
            setAttendanceStatus('checked-in-2'); // Second period check-in
          } else {
            setAttendanceStatus('checked-out'); // Both periods checked-out!
          }
        } else {
          if (!record.checkOut) {
            setAttendanceStatus('checked-in');
          } else {
            setAttendanceStatus('checked-out');
          }
        }
      }
    } catch (e: any) {
      setAttendanceStatus('error');
      setGeoStatus('فشل في تحميل الحالة: ' + e.message);
    }
  };

  // Geolocation & Distance Helpers
  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

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
    setCheckActionLoading(true);
    setGeoStatus('📡 جاري تحديد موقعك الجغرافي...');

    const loc = appSettings?.officeLocation;

    // Check if geo fence is setup
    if (!loc || !loc.lat || !loc.lng) {
      // Direct sign in if no coordinates setup
      await executePunchIn(null, null);
      return;
    }

    try {
      const position = await getPosition();
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const officeLat = parseFloat(loc.lat);
      const officeLng = parseFloat(loc.lng);
      const accuracy = position.coords.accuracy;

      if (isNaN(officeLat) || isNaN(officeLng)) {
        throw new Error('إعدادات الموقع الجغرافي للشركة غير مكتملة.');
      }

      const diffDistance = getDistance(userLat, userLng, officeLat, officeLng);
      const radiusLimit = parseInt(loc.radius) || 150;

      if (diffDistance > radiusLimit) {
        setCheckActionLoading(false);
        setGeoStatus(
          `🚫 لا يمكنك تسجيل الحضور. أنت خارج نطاق مقر الشركة بمسافة قدرها (${Math.round(
            diffDistance
          )}متر). النطاق المسموح به هو: ${radiusLimit}متر.`
        );
        return;
      }

      await executePunchIn(userLat, userLng);
    } catch (e: any) {
      setGeoStatus('❌ ' + e.message);
      setCheckActionLoading(false);
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
          id: todayRecord.id,
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
      setCheckActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord?.id) {
      setGeoStatus('⚠️ لا توجد بيانات تسجيل حضور صالحة لهذا اليوم.');
      return;
    }

    const loc = appSettings?.officeLocation;
    const requiresGPS = loc && loc.lat && loc.lng && loc.preventOutCheckout;

    if (requiresGPS) {
      setCheckActionLoading(true);
      setGeoStatus('📡 جاري تحديد موقعك الجغرافي للتحقق من الانصراف...');
      try {
        const position = await getPosition();
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const officeLat = parseFloat(loc.lat);
        const officeLng = parseFloat(loc.lng);
        const diffDistance = getDistance(userLat, userLng, officeLat, officeLng);
        const radiusLimit = parseInt(loc.radius) || 150;

        if (diffDistance > radiusLimit) {
          setCheckActionLoading(false);
          setGeoStatus(
            `🚫 لا يمكنك تسجيل الانصراف. أنت خارج نطاق مقر الشركة بمسافة قدرها (${Math.round(
              diffDistance
            )}متر). النطاق المسموح به للانصراف هو: ${radiusLimit}متر.`
          );
          return;
        }
      } catch (e: any) {
        setGeoStatus('❌ فشل التحقق من الموقع لتسجيل الانصراف: ' + e.message);
        setCheckActionLoading(false);
        return;
      }
    }

    requestConfirm('هل تريد تأكيد تسجيل انصرافك الآن؟', async () => {
      setCheckActionLoading(true);
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
          checkOutTs2: Date.now()
        } : {
          id: todayRecord.id,
          checkOut: formattedTime,
          checkOutTs: Date.now()
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
        setCheckActionLoading(false);
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
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const dept = departments.find((d) => d.id === employee.dept);

  // Read schedules from appSettings if they synchronized, else fall back to local storage
  const localDataStr = localStorage.getItem('schedule_mainData') || '{}';
  let scheduleData: any = {};
  try {
    const raw = JSON.parse(localDataStr);
    scheduleData = raw.schedule || {};
  } catch (e) {}

  return (
    <div id="emp-portal" className="min-h-screen pb-12 bg-sky-50 bg-opacity-40">
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
        <div className="overflow-hidden bg-white border border-sky-100 rounded-2xl shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-sky-50">
                {DAYS_AR.map((day, dIdx) => (
                  <th
                    key={day}
                    className={`py-3 text-center text-xs font-bold border-b border-sky-100 ${
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
                      return <td key={cIdx} className="p-1 border border-slate-50 aspect-square min-h-[50px] bg-slate-50/30"></td>;
                    }

                    const dateStr = `${showingYear}-${String(showingMonth + 1).padStart(2, '0')}-${String(cell).padStart(2, '0')}`;
                    const isToday = dateStr === getTodayStr();

                    // Read shift configuration
                    const assigned = scheduleData[dateStr]?.[employee.id];
                    const stType = assigned?.shiftType || 'A';

                    let cellBg = 'bg-white';
                    let label = 'إجازة';
                    let labelColor = 'text-slate-400';

                    const matchingShift = (shiftTypes || []).find((s: any) => s.id === stType);
                    if (matchingShift) {
                      label = matchingShift.name;
                      if (matchingShift.type === 'double') {
                        cellBg = 'bg-indigo-50/50 bg-opacity-70';
                        labelColor = 'text-indigo-700';
                      } else if (matchingShift.type === 'evening') {
                        cellBg = 'bg-amber-50/50 bg-opacity-70';
                        labelColor = 'text-amber-700';
                      } else {
                        cellBg = 'bg-emerald-50/55 bg-opacity-70';
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

                    if (cIdx === 6) { // Friday column override
                      cellBg = 'bg-rose-50/30';
                      label = 'إجازة جمعة';
                      labelColor = 'text-rose-500';
                    }

                    return (
                      <td
                        key={cIdx}
                        className={`p-1.5 border border-sky-100 text-center align-top relative transition-all ${cellBg} ${
                          isToday ? 'outline-2 outline-amber-500 shadow-md ring-2 ring-amber-100' : ''
                        }`}
                        title={assigned?.note ? `ملاحظة: ${assigned.note}` : ''}
                      >
                        <div className={`font-bold text-xs ${isToday ? 'text-amber-600 font-black' : 'text-slate-700'}`}>
                          {cell}
                          {isToday && <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full mr-1"></span>}
                        </div>
                        <div className={`text-[10px] font-bold mt-1 ${labelColor}`}>{label}</div>
                        {matchingShift && (
                          <div className="text-[8px] text-slate-500 font-mono mt-0.5 whitespace-nowrap opacity-90 leading-tight">
                            {matchingShift.type === 'double' ? (
                              <>
                                <div className="text-amber-600">🌅 {matchingShift.start}-{matchingShift.end}</div>
                                <div className="text-indigo-600">🌙 {matchingShift.start2 || '17:00'}-{matchingShift.end2 || '21:00'}</div>
                              </>
                            ) : (
                              <span>{matchingShift.start}-{matchingShift.end}</span>
                            )}
                          </div>
                        )}
                        {assigned?.note && (
                          <div className={`text-[8px] text-slate-400 truncate mt-1 bg-slate-100 px-1 py-0.5 rounded`}>
                            ✏️ {assigned.note}
                          </div>
                        )}
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
                <p className="text-[10px] text-indigo-300">يستخدم تحديد الموقع والذكاء المجدول للتحقق التلقائي والإنذار بالخلفية</p>
              </div>
            </div>
            {(autoCheckIn || autoCheckOut) && (
              <span className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                مراقب فعال
              </span>
            )}
          </div>

          {/* Quick Permission Grants section */}
          <div className="p-3.5 bg-sky-950/45 border border-sky-900/40 rounded-xl flex flex-col gap-2.5 z-10">
            <span className="text-[11px] font-extrabold text-sky-300 flex items-center gap-1">
              📱 خطوة هامة: تفعيل إذن الوصول الدائم والتنبيهات على الهاتف:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={requestAlwaysLocationPermission}
                className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-[11px] font-bold transition-all text-right flex items-center justify-between"
              >
                <span>1. طلب إذن الموقع الجغرافي النشط / الدائم</span>
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
              * للتأكد من عمل البصمة بالخلفية تلقائياً، يرجى تفعيل <strong className="font-extrabold">"السماح دائماً" (Always Allow)</strong> للموقع في إعدادات جهازك، وإبقاء صفحة البرنامج مفتوحة بالخلفية على جوالك.
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
                <span className="text-xs font-bold text-slate-100">بصمة الانصراف تلقائياً عند الخروج</span>
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
                  <option value="always" className="bg-indigo-950">تلقائياً طوال اليوم بشكل مستمر 🕒</option>
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
              <span className="text-[11px] font-extrabold text-indigo-200">⚙️ إعدادات الحضور والإنذار بالخلفية:</span>
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="text-[10px] text-slate-300 font-bold">معدل تكرار فحص الموقع بالخلفية</label>
                <select
                  value={autoCheckInterval}
                  onChange={(e) => setAutoCheckInterval(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-indigo-900/60 border border-indigo-800 rounded-lg text-xs font-bold text-white focus:outline-none"
                >
                  <option value="15" className="bg-indigo-950">كل 15 دقيقة (ربع ساعة) - افتراضي</option>
                  <option value="30" className="bg-indigo-950">كل 30 دقيقة (نصف ساعة)</option>
                  <option value="60" className="bg-indigo-950">كل ساعة (60 دقيقة)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[10px] text-slate-300 font-bold">تنبيه بالخلفية إذا فات موعد الدوام</span>
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
                  المسافة للمقر: {currentDistance} م
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">جاري مسح الإشارة...</span>
              )}
            </div>

            <div className="text-slate-200 text-[11px] flex items-center gap-1.5 font-semibold">
              <span className={`w-2 h-2 rounded-full ${autoCheckIn || autoCheckOut ? 'bg-sky-400 animate-pulse' : 'bg-slate-500'}`}></span>
              <span>{autoStatusText}</span>
            </div>

            {/* Auto logs */}
            {autoLogs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-indigo-900">
                <div className="text-[10px] text-indigo-300 block mb-1.5 font-bold">آخر عمليات البصمة والتحقق بالخلفية:</div>
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
