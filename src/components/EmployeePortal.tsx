import { useState, useEffect } from 'react';
import { Key, LogOut, ChevronRight, ChevronLeft, CalendarOff, Repeat, ArrowRightLeft, Clock, RefreshCw, Loader, AlertCircle } from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { collection, query, where, limit, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

interface EmployeePortalProps {
  employee: any;
  appSettings: any;
  departments: any[];
  employees: any[];
  onLogout: () => void;
  onOpenChangePassword: () => void;
}

export default function EmployeePortal({
  employee,
  appSettings,
  departments,
  employees,
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
      const q = query(
        collection(db, 'requests'),
        where('empId', '==', employee.id),
        limit(50)
      );
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'requests');
        throw e;
      }
      
      const loaded: any[] = [];
      querySnapshot.forEach((d) => {
        loaded.push({ id: d.id, ...d.data() });
      });
      // Sort locally by createdAt desc
      loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
      const q = query(
        collection(db, 'attendance'),
        where('empId', '==', employee.id),
        where('date', '==', todayStr),
        limit(1)
      );
      
      let snap;
      try {
        snap = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'attendance');
        throw e;
      }

      if (snap.empty) {
        setAttendanceStatus('not-checked-in');
        setTodayRecord(null);
      } else {
        const docData = snap.docs[0].data();
        const record = { id: snap.docs[0].id, ...docData };
        setTodayRecord(record);
        if (!docData.checkOut) {
          setAttendanceStatus('checked-in');
        } else {
          setAttendanceStatus('checked-out');
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
        ...(lat !== null && { checkInLat: lat, checkInLng: lng }),
        createdAt: Date.now()
      };

      try {
        await addDoc(collection(db, 'attendance'), payload);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'attendance');
        throw e;
      }

      setGeoStatus('✅ تم تسجيل حضورك بنجاح اليوم!');
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

    requestConfirm('هل تريد تأكيد تسجيل انصرافك الآن؟', async () => {
      setCheckActionLoading(true);
      setGeoStatus('⏳ جاري تسجيل الانصراف...');

      try {
        const formattedTime = new Date().toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const recordRef = doc(db, 'attendance', todayRecord.id);
        try {
          await updateDoc(recordRef, {
            checkOut: formattedTime,
            checkOutTs: Date.now()
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `attendance/${todayRecord.id}`);
          throw e;
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

    try {
      try {
        await addDoc(collection(db, 'requests'), payload);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'requests');
        throw e;
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
  const saudiFirstCol = (rawFirstDay + 2) % 7; // Convert to Saudi standard (Saturday is col 0, Friday is col 6)

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

                    if (stType === 'S') {
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
                        className={`p-2 border border-sky-100 text-center align-top relative transition-all ${cellBg} ${
                          isToday ? 'outline-2 outline-amber-500 shadow-md ring-2 ring-amber-100' : ''
                        }`}
                        title={assigned?.note ? `ملاحظة: ${assigned.note}` : ''}
                      >
                        <div className={`font-bold text-xs ${isToday ? 'text-amber-600 font-black' : 'text-slate-700'}`}>
                          {cell}
                          {isToday && <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full mr-1"></span>}
                        </div>
                        <div className={`text-[10px] font-bold mt-1.5 ${labelColor}`}>{label}</div>
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

          {attendanceStatus === 'checked-out' && (
            <div className="p-4 bg-sky-50 border border-sky-100 rounded-xl text-xs text-sky-800">
              <span className="font-extrabold text-sm block mb-1">✅ انتهت نوبة عملك اليوم بنجاح</span>
              وقت الحضور: <strong className="font-bold">{todayRecord?.checkIn}</strong> | وقت الانصراف: <strong className="font-bold">{todayRecord?.checkOut}</strong>
              {todayRecord?.checkInTs && todayRecord?.checkOutTs && (
                <div className="mt-1 bg-white inline-block px-2 py-0.5 rounded text-[10px] font-extrabold text-sky-600 shadow-sm">
                  ⏱️ مدة العمل الكلية:{' '}
                  {Math.floor((todayRecord.checkOutTs - todayRecord.checkInTs) / 3600000)}ساعة{' '}
                  {Math.round(((todayRecord.checkOutTs - todayRecord.checkInTs) % 3600000) / 60000)}دقيقة
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
