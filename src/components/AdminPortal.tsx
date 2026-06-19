import { useState, useEffect } from 'react';
import {
  LayoutDashboard, CalendarDays, ClipboardCheck, Bell, Users, Building2,
  Clock, Inbox, Settings, LogOut, ChevronRight, ChevronLeft, Printer, Plus,
  Search, Download, Trash2, Check, X, Shield, UserCheck, UserX, Key, Save,
  Crosshair, MessageCircle, UploadCloud, Loader, AlertTriangle, Edit
} from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, doc, updateDoc, deleteDoc, addDoc, getDocs, query, where } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface AdminPortalProps {
  admin: any;
  appSettings: any;
  appData: any;
  departments: any[];
  employees: any[];
  shiftTypes: any[];
  schedule: any;
  onLogout: () => void;
  onUpdateSettings: (settings: any) => void;
  onUpdateAppData: (data: any) => void;
  registrationRequests: any[];
}

export default function AdminPortal({
  admin,
  appSettings,
  appData,
  departments,
  employees,
  shiftTypes,
  schedule,
  onLogout,
  onUpdateSettings,
  onUpdateAppData,
  registrationRequests
}: AdminPortalProps) {
  const [activeView, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Month navigation state
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDept, setSelectedDept] = useState(departments[0]?.id || 'dept1');

  // Attendance report state
  const [attFilterFrom, setAttFilterFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [attFilterTo, setAttFilterTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [attFilterEmp, setAttFilterEmp] = useState('');
  const [attFilterDept, setAttFilterDept] = useState('');
  const [attFilterStatus, setAttFilterStatus] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attLoading, setAttLoading] = useState(false);

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

  // Modals state
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShiftCell, setEditingShiftCell] = useState<{ empId: string; dateStr: string } | null>(null);
  const [smMode, setSmMode] = useState<'single' | 'multi'>('single');
  const [smEmployee, setSmEmployee] = useState('');
  const [smShiftType, setSmShiftType] = useState('S');
  const [smNote, setSmNote] = useState('');
  const [smDate, setSmDate] = useState('');
  const [smFrom, setSmFrom] = useState('');
  const [smTo, setSmTo] = useState('');
  const [smRestDays, setSmRestDays] = useState<number[]>([5]); // Default: Friday (5) as off-day

  // CRUD Admins and Sub-admin states
  const [subAdmins, setSubAdmins] = useState<any[]>([]);
  const [subAdminsLoading, setSubAdminsLoading] = useState(false);
  const [subAdminModalOpen, setSubAdminModalOpen] = useState(false);
  const [editingAdmId, setEditingAdmId] = useState<string | null>(null);
  const [admName, setAdmName] = useState('');
  const [admUsername, setAdmUsername] = useState('');
  const [admEmail, setAdmEmail] = useState('');
  const [admPwd, setAdmPwd] = useState('');
  const [admPerms, setAdmPerms] = useState({
    canEditSchedule: false,
    canManageEmployees: false,
    canManageDepts: false,
    canApproveRequests: false,
    canViewReports: false,
    canManageSettings: false,
    canPrint: false
  });

  // Received employee requests
  const [adminRequests, setAdminRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // CRUD dialog modals for employees and departments
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [emName, setEmName] = useState('');
  const [emDept, setEmDept] = useState('');
  const [emUsername, setEmUsername] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emColor, setEmColor] = useState('#01696f');
  const [emPassword, setEmPassword] = useState('');

  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [dmName, setDmName] = useState('');
  const [dmMorning, setDmMorning] = useState(true);
  const [dmEvening, setDmEvening] = useState(true);
  const [dmFriday, setDmFriday] = useState<'off' | 'partial' | 'normal'>('off');

  // Shift Type states
  const [shiftTypeModalOpen, setShiftTypeModalOpen] = useState(false);
  const [editingStId, setEditingStId] = useState<string | null>(null);
  const [stCode, setStCode] = useState('');
  const [stName, setStName] = useState('');
  const [stStart, setStStart] = useState('08:00');
  const [stEnd, setStEnd] = useState('16:00');
  const [stStart2, setStStart2] = useState('17:00');
  const [stEnd2, setStEnd2] = useState('21:00');
  const [stType, setStType] = useState('morning');

  // WhatsApp helper
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waTargetId, setWaTargetId] = useState('');
  const [waFrom, setWaFrom] = useState('');
  const [waTo, setWaTo] = useState('');

  // GPS geolocation update log
  const [geoSettingStatus, setGeoSettingStatus] = useState('');
  const [companySettingsName, setCompanySettingsName] = useState(appSettings?.companyName || '');
  const [settingsNewPwd, setSettingsNewPwd] = useState('');
  const [settingsConfirmPwd, setSettingsConfirmPwd] = useState('');
  const [settingsPwdMsg, setSettingsPwdMsg] = useState('');

  const DAYS_AR = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const DAYS_SAUDI_COLS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

  useEffect(() => {
    // Load requests on initial mount for badges
    loadRequests();
  }, []);

  useEffect(() => {
    if (activeView === 'attendance') {
      loadAttendance();
    }
    if (activeView === 'requests') {
      loadRequests();
    }
    if (activeView === 'settings') {
      loadSubAdmins();
    }
  }, [activeView]);

  const hasPermission = (perm: string) => {
    if (admin.role === 'superadmin') return true;
    return admin.permissions?.[perm] === true;
  };

  const loadSubAdmins = async () => {
    setSubAdminsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'admins'));
      const loaded: any[] = [];
      snap.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() });
      });
      setSubAdmins(loaded);
    } catch (e) {
      console.error(e);
    } finally {
      setSubAdminsLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'requests'));
      const loaded: any[] = [];
      snap.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() });
      });
      loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAdminRequests(loaded);
    } catch (e) {
      console.error(e);
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadAttendance = async () => {
    setAttLoading(true);
    try {
      const snap = await getDocs(collection(db, 'attendance'));
      const loaded: any[] = [];
      snap.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() });
      });
      setAttendanceRecords(loaded);
    } catch (e) {
      console.error(e);
    } finally {
      setAttLoading(false);
    }
  };

  // Date calculation utilities
  const getDaysInSelectedMonth = () => {
    if (!scheduleMonth) return [];
    const [year, month] = scheduleMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const dates: { dateStr: string; date: Date }[] = [];
    while (date.getMonth() === month - 1) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dates.push({ dateStr, date: new Date(date) });
      date.setDate(date.getDate() + 1);
    }
    return dates;
  };

  const getShiftGaps = () => {
    const dates = getDaysInSelectedMonth();
    const alerts: any[] = [];
    dates.forEach(({ dateStr, date }) => {
      const isFri = date.getDay() === 5;
      departments.forEach((dept) => {
        const deptEmps = employees.filter((e) => e.dept === dept.id);
        const morningWorkers = deptEmps.filter((e) => {
          const sType = schedule[dateStr]?.[e.id]?.shiftType;
          const stObj = (shiftTypes || []).find((t: any) => t.id === sType);
          return sType === 'S' || stObj?.type === 'double';
        });
        const eveningWorkers = deptEmps.filter((e) => {
          const sType = schedule[dateStr]?.[e.id]?.shiftType;
          const stObj = (shiftTypes || []).find((t: any) => t.id === sType);
          return sType === 'E' || stObj?.type === 'double';
        });

        if (isFri) {
          if (dept.friday === 'off') return;
          if (dept.friday === 'partial') {
            if (morningWorkers.length + eveningWorkers.length === 0) {
              alerts.push({
                id: `${dateStr}_${dept.id}_friday`,
                date: dateStr,
                dept: dept.name,
                msg: `يوم الجمعة: لا يوجد أي تعيين لدوام الشيفت في القسم ${dept.name}`
              });
            }
          }
          return;
        }

        if (dept.needsMorning && morningWorkers.length === 0) {
          alerts.push({
            id: `${dateStr}_${dept.id}_morning`,
            date: dateStr,
            dept: dept.name,
            msg: `تغطية ناقصة: الشيفت الصباحي فارغ في القسم ${dept.name}`
          });
        }
        if (dept.needsEvening && eveningWorkers.length === 0) {
          alerts.push({
            id: `${dateStr}_${dept.id}_evening`,
            date: dateStr,
            dept: dept.name,
            msg: `تغطية ناقصة: الشيفت المسائي فارغ في القسم ${dept.name}`
          });
        }
      });
    });
    const deleted = appSettings.deletedAlerts || [];
    return alerts.filter(a => !deleted.includes(a.id));
  };

  const toggleAlertRead = (alertId: string) => {
    const currentRead = appSettings.readAlerts || [];
    let updated;
    if (currentRead.includes(alertId)) {
      updated = currentRead.filter((id: string) => id !== alertId);
    } else {
      updated = [...currentRead, alertId];
    }
    onUpdateSettings({ ...appSettings, readAlerts: updated });
  };

  const dismissAlert = (alertId: string) => {
    const deleted = appSettings.deletedAlerts || [];
    if (!deleted.includes(alertId)) {
      onUpdateSettings({ ...appSettings, deletedAlerts: [...deleted, alertId] });
    }
  };

  const dismissAllAlerts = (alertIds: string[]) => {
    const deleted = appSettings.deletedAlerts || [];
    const newDeleted = Array.from(new Set([...deleted, ...alertIds]));
    onUpdateSettings({ ...appSettings, deletedAlerts: newDeleted, readAlerts: [] });
  };

  const markAllAlertsAsRead = (alertIds: string[]) => {
    const read = appSettings.readAlerts || [];
    const newRead = Array.from(new Set([...read, ...alertIds]));
    onUpdateSettings({ ...appSettings, readAlerts: newRead });
  };

  const getTodayAttendanceStats = () => {
    const d = new Date();
    const todayStrFull = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    // Checked in today (from attendanceRecords)
    const todayCheckedIn = attendanceRecords.filter(r => r.date === todayStrFull && r.checkIn);
    const presentIds = todayCheckedIn.map(r => r.empId);
    
    // Who is scheduled today?
    const scheduledEmpIds = employees.filter(emp => {
      const daySchedule = schedule[todayStrFull]?.[emp.id];
      return daySchedule && daySchedule.shiftType && daySchedule.shiftType !== 'OFF';
    }).map(emp => emp.id);

    const presentCount = presentIds.length;
    // Absent: scheduled but didn't check in today. Or fallback to total inactive minus present if no schedule exists today.
    const absentCount = scheduledEmpIds.length > 0 
      ? scheduledEmpIds.filter(id => !presentIds.includes(id)).length
      : Math.max(0, employees.length - presentCount);

    return {
      presentCount,
      absentCount,
      totalActive: employees.length
    };
  };

  const handleSaveShift = () => {
    if (!smEmployee) {
      alert('الرجاء اختيار الموظف');
      return;
    }

    const updatedSchedule = { ...schedule };

    if (smMode === 'single') {
      if (!smDate) {
        alert('الرجاء تعيين تاريخ الدوام');
        return;
      }
      if (!updatedSchedule[smDate]) updatedSchedule[smDate] = {};
      updatedSchedule[smDate][smEmployee] = { shiftType: smShiftType, note: smNote };
    } else {
      if (!smFrom || !smTo) {
        alert('الرجاء تحديد نطاق التواريخ');
        return;
      }
      const start = new Date(smFrom + 'T00:00:00');
      const end = new Date(smTo + 'T00:00:00');
      const current = new Date(start);

      while (current <= end) {
        const dow = current.getDay();
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(
          current.getDate()
        ).padStart(2, '0')}`;
        if (!updatedSchedule[dateStr]) updatedSchedule[dateStr] = {};
        
        if (smRestDays.includes(dow)) {
          updatedSchedule[dateStr][smEmployee] = { shiftType: 'A', note: 'راحة أسبوعية' };
        } else {
          updatedSchedule[dateStr][smEmployee] = { shiftType: smShiftType, note: smNote };
        }
        current.setDate(current.getDate() + 1);
      }
    }

    onUpdateAppData({ ...appData, schedule: updatedSchedule });
    setShiftModalOpen(false);
  };

  const handleAddEmployee = () => {
    if (!emName.trim()) return;
    const newEmp = {
      id: editingEmpId || 'e' + Date.now(),
      name: emName.trim(),
      dept: emDept || departments[0]?.id || '',
      phone: emPhone.trim(),
      username: emUsername.trim(),
      password: emPassword.trim(),
      color: emColor
    };

    let updatedEmployees = [...employees];
    if (editingEmpId) {
      updatedEmployees = updatedEmployees.map((e) => (e.id === editingEmpId ? newEmp : e));
    } else {
      updatedEmployees.push(newEmp);
    }

    onUpdateAppData({ ...appData, employees: updatedEmployees });
    setEmpModalOpen(false);
    setEditingEmpId(null);
  };

  const handleDeleteEmployee = (id: string) => {
    requestConfirm('هل تريد حذف الموظف المحدد؟', () => {
      const updated = employees.filter((e) => e.id !== id);
      onUpdateAppData({ ...appData, employees: updated });
    });
  };

  const handleAddDept = () => {
    if (!dmName.trim()) return;
    const newDept = {
      id: editingDeptId || 'dept' + Date.now(),
      name: dmName.trim(),
      needsMorning: dmMorning,
      needsEvening: dmEvening,
      friday: dmFriday
    };

    let updatedDepts = [...departments];
    if (editingDeptId) {
      updatedDepts = updatedDepts.map((d) => (d.id === editingDeptId ? newDept : d));
    } else {
      updatedDepts.push(newDept);
    }

    onUpdateAppData({ ...appData, departments: updatedDepts });
    setDeptModalOpen(false);
    setEditingDeptId(null);
  };

  const handleAddShiftType = () => {
    if (!stCode.trim() || !stName.trim()) {
      alert('الرجاء إدخال الرمز التعريفي للشيفت والاسم العربي للشيفت');
      return;
    }

    const newST = {
      id: editingStId || stCode.trim().toUpperCase(),
      name: stName.trim(),
      start: stStart,
      end: stEnd,
      start2: stType === 'double' ? stStart2 : null,
      end2: stType === 'double' ? stEnd2 : null,
      type: stType
    };

    let updatedShiftTypes = [...(shiftTypes || [])];
    if (editingStId) {
      updatedShiftTypes = updatedShiftTypes.map((t) => (t.id === editingStId ? newST : t));
    } else {
      if (updatedShiftTypes.some(t => t.id === newST.id)) {
        alert('هذا الرمز التعريفي مستخدم بالفعل! الرجاء استخدام رمز آخر.');
        return;
      }
      updatedShiftTypes.push(newST);
    }

    onUpdateAppData({ ...appData, shiftTypes: updatedShiftTypes });
    setShiftTypeModalOpen(false);
    setEditingStId(null);
  };

  const handleDeleteShiftType = (id: string) => {
    if (id === 'S' || id === 'E') {
      alert('لا يمكن حذف نوبات العمل الأساسية (صباحي / مسائي).');
      return;
    }
    requestConfirm('هل تريد حذف هذا الشيفت نهائياً؟', () => {
      const updated = (shiftTypes || []).filter((t: any) => t.id !== id);
      onUpdateAppData({ ...appData, shiftTypes: updated });
    });
  };

  const handleSaveSubAdmin = async () => {
    if (!admName.trim() || !admUsername.trim() || !admPwd.trim()) {
      alert('الرجاء إدخال اسم المسؤول، واسم المستخدم، ورمز تسجيل الدخول');
      return;
    }
    const adminData: any = {
      name: admName.trim(),
      username: admUsername.trim().toLowerCase(),
      email: admEmail.trim() || `${admUsername.trim().toLowerCase()}@company.com`,
      password: admPwd.trim(),
      role: 'admin',
      permissions: admPerms
    };

    try {
      if (editingAdmId) {
        await updateDoc(doc(db, 'admins', editingAdmId), adminData);
        alert('تم تحديث بيانات المسؤول بنجاح');
      } else {
        adminData.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'admins'), adminData);
        alert('تم حفظ حساب المسؤول الجديد بنجاح');
      }
      setSubAdminModalOpen(false);
      setEditingAdmId(null);
      loadSubAdmins();
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    }
  };

  const handleReviewRequest = async (requestId: string, decision: 'approved' | 'rejected') => {
    if (!hasPermission('canApproveRequests')) {
      alert('ليس لديك صلاحية لاعتماد الطلبات');
      return;
    }

    const matchedReq = adminRequests.find((r) => r.id === requestId);
    if (!matchedReq) return;

    try {
      const docRef = doc(db, 'requests', requestId);
      await updateDoc(docRef, {
        status: decision,
        reviewedBy: admin.name || 'المدير',
        reviewedAt: `${new Date().toLocaleDateString('ar-SA')} ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`
      });

      // Apply changes inline to schedule on approval
      if (decision === 'approved') {
        const updatedSch = { ...schedule };
        if (!updatedSch[matchedReq.date]) updatedSch[matchedReq.date] = {};

        if (matchedReq.type === 'leave') {
          updatedSch[matchedReq.date][matchedReq.empId] = { shiftType: 'A', note: 'إجازة معتمدة' };
        } else if (matchedReq.type === 'shift_change') {
          updatedSch[matchedReq.date][matchedReq.empId] = { shiftType: matchedReq.targetShift, note: 'تعديل شيفت معتمد' };
        } else if (matchedReq.type === 'swap') {
          const originalShift1 = schedule[matchedReq.date]?.[matchedReq.empId] || { shiftType: 'A' };
          const originalShift2 = schedule[matchedReq.date]?.[matchedReq.swapWithEmpId] || { shiftType: 'A' };

          updatedSch[matchedReq.date][matchedReq.empId] = { shiftType: originalShift2.shiftType, note: `بديل لـ ${matchedReq.swapWithEmpName}` };
          updatedSch[matchedReq.date][matchedReq.swapWithEmpId] = { shiftType: originalShift1.shiftType, note: `بديل لـ ${matchedReq.empName}` };
        } else if (matchedReq.type === 'attendance_adjustment') {
          // Update or insert dynamic attendance record approved by management
          const q = query(
            collection(db, 'attendance'),
            where('empId', '==', matchedReq.empId),
            where('date', '==', matchedReq.date)
          );
          const snap = await getDocs(q);
          const formattedCheckIn = matchedReq.checkInTime || '08:00';
          const formattedCheckOut = matchedReq.checkOutTime || '16:00';

          // Correctly calculate timestamps so duration can be calculated in reports
          const [inH, inM] = formattedCheckIn.split(':').map(Number);
          const [outH, outM] = formattedCheckOut.split(':').map(Number);

          const inDateObj = new Date(matchedReq.date);
          inDateObj.setHours(inH || 8, inM || 0, 0, 0);

          const outDateObj = new Date(matchedReq.date);
          outDateObj.setHours(outH || 16, outM || 0, 0, 0);

          const checkInTimestamp = isNaN(inDateObj.getTime()) ? Date.now() : inDateObj.getTime();
          const checkOutTimestamp = isNaN(outDateObj.getTime()) ? Date.now() : outDateObj.getTime();

          if (!snap.empty) {
            const attendanceDocRef = doc(db, 'attendance', snap.docs[0].id);
            await updateDoc(attendanceDocRef, {
              checkIn: formattedCheckIn,
              checkInTs: checkInTimestamp,
              checkOut: formattedCheckOut,
              checkOutTs: checkOutTimestamp,
              note: 'تم البصم بموافقة الإدارة',
              status: 'present',
              source: 'الإدارة'
            });
          } else {
            const empObj = employees.find((e) => e.id === matchedReq.empId);
            const deptName = empObj?.dept || '';

            await addDoc(collection(db, 'attendance'), {
              empId: matchedReq.empId,
              empName: matchedReq.empName,
              dept: deptName,
              date: matchedReq.date,
              checkIn: formattedCheckIn,
              checkInTs: checkInTimestamp,
              checkOut: formattedCheckOut,
              checkOutTs: checkOutTimestamp,
              status: 'present',
              note: 'تم البصم بموافقة الإدارة',
              source: 'الإدارة',
              createdAt: Date.now()
            });
          }
        }

        onUpdateAppData({ ...appData, schedule: updatedSch });
      }

      alert('تم تحديث حالة الطلب بنجاح.');
      loadRequests();
    } catch (e: any) {
      alert('حدث خطأ: ' + e.message);
    }
  };

  const handleLogoUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الملف كبير جداً، اختر صورة أصغر من 2 ميغابايت.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event: any) => {
      onUpdateSettings({ ...appSettings, logoDataUrl: event.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handleUpdatePassword = () => {
    if (!settingsNewPwd) {
      setSettingsPwdMsg('الرجاء إدخال كلمة المرور الجديدة');
      return;
    }
    if (settingsNewPwd !== settingsConfirmPwd) {
      setSettingsPwdMsg('كلمتا المرور غير متطابقتين');
      return;
    }
    onUpdateSettings({ ...appSettings, password: settingsNewPwd });
    setSettingsPwdMsg('🔑 تم تحديث كلمة المرور العامة للمدير بنجاح!');
    setSettingsNewPwd('');
    setSettingsConfirmPwd('');
  };

  // GPS Detector
  const handleDetectGPS = () => {
    setGeoSettingStatus('📡 جاري تحديد إحداثيات موقعك...');
    if (!navigator.geolocation) {
      setGeoSettingStatus('❌ جهازك لا يدعم تتبع الموقع الجغرافي');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUpdateSettings({
          ...appSettings,
          officeLocation: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radius: appSettings?.officeLocation?.radius || 150
          }
        });
        setGeoSettingStatus('✅ تم التقاط إحداثيات موقعك الجغرافي بنجاح! راجع الحقول واضغط حفظ.');
      },
      (err) => {
        setGeoSettingStatus('❌ تعذر تحديد الإحداثيات حالياً. يرجى مراجعة إذن المتصفح.');
      },
      { enableHighAccuracy: true }
    );
  };

  // WhatsApp sender message composition
  const handleOpenWaModal = (empId: string) => {
    setWaTargetId(empId);
    const d = new Date();
    setWaFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    setWaTo(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-30`);
    setWaModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    const emp = employees.find((e) => e.id === waTargetId);
    if (!emp) return;

    const start = new Date(waFrom + 'T00:00:00');
    const end = new Date(waTo + 'T00:00:00');
    const current = new Date(start);

    let msg = `🏢 *${appSettings?.companyName || 'نظام الدوام'}*\n`;
    msg += `📅 *جدول دوام الموظف/ة: ${emp.name}*\n\n`;

    while (current <= end) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(
        current.getDate()
      ).padStart(2, '0')}`;
      const entry = schedule[dateStr]?.[emp.id];
      const dow = current.getDay();

      let shiftLabel = 'إجازة';
      let icon = '⬜';

      const st = (shiftTypes || []).find((t: any) => t.id === entry?.shiftType);
      if (st) {
        shiftLabel = st.name;
        if (st.type === 'double') {
          icon = '🔄';
        } else if (st.type === 'morning' || st.id === 'S') {
          icon = '🌅';
        } else {
          icon = '🌙';
        }
      }

      msg += `${icon} ${DAYS_AR[dow]} [${dateStr.split('-')[2]}]: *${shiftLabel}* ${
        entry?.note ? `(${entry.note})` : ''
      }\n`;
      current.setDate(current.getDate() + 1);
    }

    msg += `\n⏰ يرجى مراجعة الجدول والتأكيد على الانضباط والمواعيد.`;
    
    let cleanedPhone = emp.phone || '';
    // Strip all non-numeric characters from the input phone
    cleanedPhone = cleanedPhone.replace(/\D/g, '');
    
    if (cleanedPhone) {
      // 1. If it starts with '00', remove that prefix
      if (cleanedPhone.startsWith('00')) {
        cleanedPhone = cleanedPhone.slice(2);
      }
      
      // 2. If it is standard local starts with '05' (10 digits), convert to Saudi '9665...'
      if (cleanedPhone.startsWith('05')) {
        cleanedPhone = '9665' + cleanedPhone.slice(2);
      }
      // 3. If it starts with '96605...', convert to '9665...'
      else if (cleanedPhone.startsWith('96605')) {
        cleanedPhone = '9665' + cleanedPhone.slice(5);
      }
      // 4. If it is 9 digits starting with '5' (such as 551234567), prefix with '966'
      else if (cleanedPhone.startsWith('5') && cleanedPhone.length === 9) {
        cleanedPhone = '966' + cleanedPhone;
      }
      // 5. If it is 10 digits starting with '5', prefix with '966'
      else if (cleanedPhone.startsWith('5') && cleanedPhone.length === 10) {
        cleanedPhone = '966' + cleanedPhone;
      }
      // 6. If it starts with '9660...', standardise to '966...'
      else if (cleanedPhone.startsWith('9660')) {
        cleanedPhone = '966' + cleanedPhone.slice(4);
      }
    }

    const link = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
  };

  // PDF Download Helper using html2canvas and jsPDF
  const downloadWaPDF = () => {
    const el = document.getElementById('pdf-content-to-capture');
    if (!el) {
      alert('لم يتم العثور على لوحة المعاينة');
      return;
    }
    const emp = employees.find((e) => e.id === waTargetId);

    const originalGetComputedStyle = window.getComputedStyle;

    // Temporarily monkeypatch window.getComputedStyle to intercept oklch and oklab color values that crash html2canvas parser
    window.getComputedStyle = function(element: Element, pseudoElt?: string | null) {
      const style = originalGetComputedStyle.call(window, element, pseudoElt);

      const safeColor = (val: any, propName?: string) => {
        if (typeof val !== 'string') return val;
        if (val.includes('oklch') || val.includes('oklab')) {
          const replacer = (match: string) => {
            const isLight = match.includes('0.9') || match.includes('0.8') || match.includes('0.95');
            const isEmerald = match.includes('0.84') || match.includes('0.62') || match.includes('0.72');
            if (propName && (propName.toLowerCase().includes('background') || propName.toLowerCase().includes('shadow'))) {
              if (isEmerald) return 'rgb(209, 250, 229)';
              return isLight ? '#f8fafc' : '#ffffff';
            }
            if (propName && propName.toLowerCase().includes('border')) {
              return '#cbd5e1';
            }
            return isLight ? '#ffffff' : '#0f172a';
          };
          return val
            .replace(/oklch\([^)]+\)/g, replacer)
            .replace(/oklab\([^)]+\)/g, replacer);
        }
        return val;
      };

      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return (propertyName: string) => {
              const val = target.getPropertyValue(propertyName);
              return safeColor(val, propertyName);
            };
          }
          const val = Reflect.get(target, prop);
          if (typeof val === 'function') {
            return val.bind(target);
          }
          if (typeof prop === 'string') {
            return safeColor(val, prop);
          }
          return val;
        }
      });
    };

    html2canvas(el, { scale: 2, useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const imgW = w - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgW, imgH);
      pdf.save(`جدول_دوام_${emp ? emp.name : 'الموظف'}.pdf`);
    }).catch((err) => {
      console.error('Error in html2canvas:', err);
    }).finally(() => {
      // Safely restore original getComputedStyle
      window.getComputedStyle = originalGetComputedStyle;
    });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50">
      
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900 bg-opacity-40 md:hidden transition-all"
        />
      )}

      {/* Roster System Sidebar Navigation */}
      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 flex flex-col w-64 bg-sky-800 text-white border-l transition-all md:sticky md:top-0 md:h-screen md:translate-x-0 flex-shrink-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sky-700/60 bg-sky-900/10">
          {appSettings?.logoDataUrl ? (
            <img 
              src={appSettings.logoDataUrl} 
              alt="Logo" 
              className="w-10 h-10 object-contain rounded-xl bg-white p-1 border shadow-sm"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex items-center justify-center w-10 h-10 text-lg font-black text-white bg-sky-600 rounded-xl shadow-md border">
              {(appSettings?.companyName || 'د').charAt(0)}
            </div>
          )}
          <div>
            <h2 className="font-extrabold text-[15px]">{appSettings?.companyName || 'نظام الدوام'}</h2>
            <p className="text-[10px] text-sky-200">التحكم والتقارير العامة</p>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 flex flex-col gap-6 overflow-y-auto">
          
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-sky-200 uppercase tracking-widest px-3 mb-1">الرئيسية</span>
            
            <button
              onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                activeView === 'dashboard' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
              }`}
            >
              <LayoutDashboard size={15} />
              <span>لوحة التحكم المباشرة</span>
            </button>

            <button
              onClick={() => { setActiveTab('schedule'); setSidebarOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                activeView === 'schedule' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
              }`}
            >
              <CalendarDays size={15} />
              <span>جدول وشيفتات الدوام</span>
            </button>

            {hasPermission('canViewReports') && (
              <button
                onClick={() => { setActiveTab('attendance'); setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeView === 'attendance' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
                }`}
              >
                <ClipboardCheck size={15} />
                <span>كشف الحضور والانصراف</span>
              </button>
            )}

            <button
              onClick={() => { setActiveTab('alerts'); setSidebarOpen(false); }}
              className={`flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition-all w-full ${
                activeView === 'alerts' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell size={15} />
                <span>تنبيهات تغطية الشيفتات</span>
              </div>
              {(() => {
                const unreadGapsCount = getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id)).length;
                return unreadGapsCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] text-white font-extrabold font-mono shadow-sm animate-pulse">
                    {unreadGapsCount}
                  </span>
                ) : null;
              })()}
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-sky-200 uppercase tracking-widest px-3 mb-1">التنظيم والتنسيق</span>

            {hasPermission('canManageEmployees') && (
              <button
                onClick={() => { setActiveTab('employees'); setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeView === 'employees' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
                }`}
              >
                <Users size={15} />
                <span>شؤون الموظفين</span>
              </button>
            )}

            {hasPermission('canManageDepts') && (
              <button
                onClick={() => { setActiveTab('departments'); setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeView === 'departments' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
                }`}
              >
                <Building2 size={15} />
                <span>إدارة الأقسام</span>
              </button>
            )}

            {hasPermission('canManageDepts') && (
              <button
                onClick={() => { setActiveTab('shifttypes'); setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeView === 'shifttypes' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
                }`}
              >
                <Clock size={15} />
                <span>نوع ومدة الشيفت</span>
              </button>
            )}

            {hasPermission('canApproveRequests') && (
              <button
                onClick={() => { setActiveTab('requests'); setSidebarOpen(false); }}
                className={`flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition-all w-full ${
                  activeView === 'requests' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Inbox size={15} />
                  <span>الطلبات الواردة</span>
                </div>
                {(() => {
                  const pendingRegCount = registrationRequests.filter((r) => r.status === 'pending').length;
                  const pendingEmpRequestsCount = adminRequests.filter((r) => r.status === 'pending').length;
                  const totalPendingRequests = pendingRegCount + pendingEmpRequestsCount;
                  return totalPendingRequests > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] text-white font-extrabold font-mono shadow-sm">
                      {totalPendingRequests}
                    </span>
                  ) : null;
                })()}
              </button>
            )}

            {hasPermission('canManageSettings') && (
              <button
                onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
                className={`flex items-center gap-3 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeView === 'settings' ? 'bg-white text-sky-800 shadow-sm' : 'hover:bg-sky-700/40 text-sky-50'
                }`}
              >
                <Settings size={15} />
                <span>بيانات وإعدادات النظام</span>
              </button>
            )}
          </div>
        </nav>

        <div className="px-5 py-2.5 border-t border-sky-700/40 text-center text-[10px] text-sky-200 font-sans tracking-wide bg-sky-900/10">
          التصميم والتطوير عن طريق <span className="font-extrabold text-white">SHADY NASSEF</span>
        </div>

        <div className="p-4 border-t border-sky-700/60 bg-sky-900/10 flex items-center justify-between text-xs">
          <div className="truncate">
            <span className="block text-[10px] text-sky-300">المستخدم النشط:</span>
            <span className="font-extrabold">{admin.name || 'مدير الدوام'}</span>
          </div>
          <button
            onClick={onLogout}
            title="تسجيل الخروج"
            className="p-1.5 hover:bg-rose-600 rounded-lg text-rose-200 hover:text-white transition-all"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-sky-100 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 border rounded-lg md:hidden text-slate-500 hover:bg-slate-50"
            >
              <LayoutDashboard size={18} />
            </button>
            <h1 className="text-base font-extrabold text-slate-800">
              {activeView === 'dashboard' && 'لوحة التحكم المباشرة'}
              {activeView === 'schedule' && 'جدول وشيفتات الدوام'}
              {activeView === 'attendance' && 'كشف حضور وانصراف الموظفين'}
              {activeView === 'alerts' && 'تنبيهات غياب التغطية'}
              {activeView === 'employees' && 'إدارة الموظفين والبطاقات'}
              {activeView === 'shifttypes' && 'نوع ومدة الشيفت'}
              {activeView === 'departments' && 'الأقسام والشيفتات'}
              {activeView === 'requests' && 'صندوق طلبات الحضور والمسكن'}
              {activeView === 'settings' && 'إعدادات الشركة والمنصات'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {activeView === 'schedule' && hasPermission('canEditSchedule') && (
              <button
                onClick={() => {
                  setSmMode('single');
                  setSmEmployee(employees[0]?.id || '');
                  setSmShiftType('S');
                  setSmNote('');
                  setSmDate(getAttTodayStr);
                  setShiftModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow transition-all"
              >
                <Plus size={14} />
                <span>إضافة دوام</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Panels render based on active view */}
        <main className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full">
          
          {/* View: Dashboard */}
          {activeView === 'dashboard' && (
            <div className="flex flex-col gap-6">
              {/* KPIs Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">إجمالي الموظفين</span>
                  <div className="text-xl font-extrabold text-sky-600">{employees.length} موظف</div>
                </div>
                
                <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">عدد الأقسام</span>
                  <div className="text-xl font-extrabold text-slate-700">{departments.length} فرع</div>
                </div>

                <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">تنبيهات الشهر</span>
                  <div className="text-xl font-extrabold text-rose-600">{getShiftGaps().length} تغطية ناقصة</div>
                </div>

                <div className="p-5 bg-white border border-sky-100 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">نوبات العمل</span>
                  <div className="text-xl font-extrabold text-slate-700">{shiftTypes.length || 2} نوبة</div>
                </div>
              </div>

              {/* Side-by-side Layout of Active Schedule & Coverage Alerts */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-2" dir="rtl">
                
                {/* Right Area: Interactive Weekly Schedule Section (lg:col-span-8) */}
                <div className="lg:col-span-8 p-6 bg-white border border-sky-100 rounded-2xl shadow-sm text-right flex flex-col gap-5 animate-fade-in">
                  <div className="flex justify-between items-center flex-wrap gap-4 border-b border-sky-50 pb-4">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                        <Clock size={16} className="text-sky-500" />
                        <span>جدول دوام الأسبوع الحالي للأقسام</span>
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1">عرض تفاعلي رائع لتوزيع النوبات والنواتج للأقسام المختلفة للأسبوع الجاري.</p>
                    </div>

                    <div className="flex p-0.5 bg-slate-100 rounded-xl flex-wrap">
                      {departments.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => setSelectedDept(d.id)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            selectedDept === d.id ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-sky-50">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead>
                        <tr className="bg-sky-50/60 text-sky-900 border-b border-sky-100">
                          <th className="p-3 font-extrabold text-slate-700">الموظف</th>
                          {(() => {
                            const current = new Date();
                            const dayOfWeek = current.getDay(); // 0 is Sun, 6 is Sat
                            const dist = dayOfWeek === 6 ? 0 : -(dayOfWeek + 1);
                            const startOfWeek = new Date(current);
                            startOfWeek.setDate(current.getDate() + dist);

                            const weekDays = [];
                            for (let i = 0; i < 7; i++) {
                              const next = new Date(startOfWeek);
                              next.setDate(startOfWeek.getDate() + i);
                              const name = DAYS_AR[next.getDay()];
                              const isToday = next.toDateString() === current.toDateString();
                              weekDays.push({ date: next, name, isToday });
                            }

                            return weekDays.map((wd, index) => (
                              <th key={index} className={`p-3 font-extrabold text-center border-r border-sky-50 leading-tight ${wd.isToday ? 'bg-amber-100/60 text-amber-950 font-black' : ''}`}>
                                <div>{wd.name}</div>
                                <div className="text-[9px] text-slate-400 mt-0.5">{String(wd.date.getDate()).padStart(2, '0')}/{String(wd.date.getMonth() + 1).padStart(2, '0')}</div>
                              </th>
                            ));
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {employees.filter((e) => e.dept === selectedDept).map((emp) => {
                          const current = new Date();
                          const dayOfWeek = current.getDay();
                          const dist = dayOfWeek === 6 ? 0 : -(dayOfWeek + 1);
                          const startOfWeek = new Date(current);
                          startOfWeek.setDate(current.getDate() + dist);

                          const weekDays = [];
                          for (let i = 0; i < 7; i++) {
                            const next = new Date(startOfWeek);
                            next.setDate(startOfWeek.getDate() + i);
                            const dateStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
                            weekDays.push({ dateStr, isToday: next.toDateString() === current.toDateString() });
                          }

                          return (
                            <tr key={emp.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 font-extrabold text-slate-700 bg-slate-50/20">{emp.name}</td>
                              {weekDays.map((wd, idx) => {
                                const entry = schedule[wd.dateStr]?.[emp.id];
                                const stType = entry?.shiftType || 'A';
                                const _st = (shiftTypes || []).find((t: any) => t.id === stType);
                                
                                let badgeStyle = 'text-slate-400 bg-slate-100 font-medium border border-transparent';
                                let badgeLabel = '🏝️ إجازة';

                                if (_st) {
                                  if (_st.id === 'S') {
                                    badgeStyle = 'text-emerald-700 bg-emerald-50 border border-emerald-200/50 font-bold';
                                    badgeLabel = `🌅 ${_st.name.replace('شيفت', '').trim()}`;
                                  } else if (_st.id === 'E') {
                                    badgeStyle = 'text-indigo-700 bg-indigo-50 border border-indigo-200/50 font-bold';
                                    badgeLabel = `🌙 ${_st.name.replace('شيفت', '').trim()}`;
                                  } else if (_st.type === 'double') {
                                    badgeStyle = 'text-amber-700 bg-amber-50 border border-amber-200/50 font-bold';
                                    badgeLabel = `🔄 ${_st.name.replace('شيفت', '').trim()}`;
                                  } else {
                                    badgeStyle = 'text-sky-700 bg-sky-50 border border-sky-200/50 font-bold';
                                    badgeLabel = `⏱️ ${_st.name.replace('شيفت', '').trim()}`;
                                  }
                                }

                                return (
                                  <td
                                    key={idx}
                                    onClick={() => {
                                      if (!hasPermission('canEditSchedule')) return;
                                      setSmEmployee(emp.id);
                                      setSmDate(wd.dateStr);
                                      setSmShiftType(stType);
                                      setSmNote(entry?.note || '');
                                      setSmMode('single');
                                      setShiftModalOpen(true);
                                    }}
                                    className={`p-2 border-r border-sky-50 text-center cursor-pointer transition-all hover:bg-sky-100/30 ${wd.isToday ? 'bg-amber-100/10' : ''}`}
                                    title="انقر لتعديل هذه النوبة فورياً"
                                  >
                                    <span className={`inline-block px-2 py-1 rounded-lg text-[9px] font-bold ${badgeStyle}`}>
                                      {badgeLabel}
                                    </span>
                                    {entry?.note && (
                                      <div className="text-[8px] text-slate-400 mt-0.5 truncate max-w-[80px]" title={entry.note}>
                                        📝 {entry.note}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {employees.filter((e) => e.dept === selectedDept).length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-xs text-slate-400 font-medium">
                              لا يوجد موظفون مضافون في هذا القسم حالياً لعرض جدولهم الأسبوعي.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Left Area: Alerts & Gaps Notifications Section (lg:col-span-4) */}
                <div className="lg:col-span-4 p-5 bg-white border border-sky-100 rounded-2xl shadow-sm text-right flex flex-col gap-4 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-sky-50 pb-3">
                    <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                      <AlertTriangle size={15} className="text-rose-500 animate-pulse" />
                      <span>تنبيهات نقص التغطية الجارية</span>
                    </h3>
                    <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-extrabold font-mono">
                      {getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id)).length} نشط
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {(() => {
                      const unreadGaps = getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id));
                      if (unreadGaps.length === 0) {
                        return (
                          <div className="p-10 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center gap-2">
                            <span className="text-2xl animate-bounce">🎉</span>
                            <span>ممتاز! جميع الأقسام مغطاة بالكامل ولا توجد تنبيهات غير مقروءة حالياً.</span>
                          </div>
                        );
                      }
                      return unreadGaps.slice(0, 5).map((g) => (
                        <div key={g.id} className="p-3 bg-rose-50/40 border-r-4 border-rose-500 rounded-l-xl border border-sky-100 flex justify-between items-start gap-2.5 hover:bg-rose-50/80 transition-all">
                          <div className="text-xs text-slate-700 leading-relaxed">
                            <div className="font-extrabold text-rose-950 text-[11px] mb-0.5">{g.dept}</div>
                            <div className="text-[10px] text-slate-500 font-mono mb-1">{g.date}</div>
                            <span className="text-[10px] text-rose-800 font-bold">{g.msg}</span>
                          </div>
                          <button
                            onClick={() => toggleAlertRead(g.id)}
                            className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 transition-all flex-shrink-0"
                            title="تحديد كمقروء وحذف من القائمة الفعّالة"
                          >
                            <Check size={14} className="stroke-[3]" />
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* View: Schedule */}
          {activeView === 'schedule' && (
            <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-5">
              
              {/* Department filtering tabs */}
              <div className="flex justify-between items-center flex-wrap gap-4 border-b pb-3">
                <div className="flex p-0.5 bg-slate-100 rounded-xl flex-wrap">
                  {departments.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDept(d.id)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                        selectedDept === d.id ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const [y, m] = scheduleMonth.split('-').map(Number);
                      const target = new Date(y, m - 2, 1);
                      setScheduleMonth(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`);
                    }}
                    className="p-1.5 border hover:bg-slate-50 rounded-lg"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <input
                    type="month"
                    value={scheduleMonth}
                    onChange={(e) => setScheduleMonth(e.target.value)}
                    className="px-3 py-1 border rounded-lg text-xs font-extrabold focus:outline-none bg-sky-50 text-sky-800"
                  />
                  <button
                    onClick={() => {
                      const [y, m] = scheduleMonth.split('-').map(Number);
                      const target = new Date(y, m, 1);
                      setScheduleMonth(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`);
                    }}
                    className="p-1.5 border hover:bg-slate-50 rounded-lg"
                  >
                    <ChevronLeft size={15} />
                  </button>
                </div>
              </div>

              {/* Dynamic schedule table grid */}
              <div className="overflow-auto max-h-[72vh] rounded-xl border border-sky-100 shadow-2xs relative">
                <table className="w-full border-collapse text-right text-xs relative">
                  <thead className="sticky top-0 z-20 bg-sky-50 shadow-xs">
                    <tr className="bg-sky-50 text-sky-900 border-b">
                      <th className="p-3 font-extrabold bg-sky-50 sticky right-0 z-30 shadow-2xs">التاريخ</th>
                      <th className="p-3 font-extrabold bg-sky-50 border-l border-sky-100 sticky right-[82px] z-30 shadow-2xs">اليوم</th>
                      {employees
                        .filter((e) => e.dept === selectedDept)
                        .map((emp) => (
                          <th key={emp.id} className="p-3 font-extrabold text-center border-r border-sky-100 bg-sky-50">
                            {emp.name}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getDaysInSelectedMonth().map(({ dateStr, date }) => {
                      const isFri = date.getDay() === 5;
                      const isToday = dateStr === getAttTodayStr();
                      const cellBg = isToday ? 'bg-amber-50' : isFri ? 'bg-slate-50/90' : 'bg-white';
                      
                      return (
                        <tr
                          key={dateStr}
                          className={`border-b last:border-0 hover:bg-sky-50/20 transition-colors ${
                            isToday ? 'border-y-2 border-amber-300' : ''
                          }`}
                        >
                          <td className={`p-3 font-extrabold text-slate-700 sticky right-0 z-10 shadow-2xs ${cellBg}`}>{dateStr}</td>
                          <td className={`p-3 font-bold sticky right-[82px] z-10 border-l border-sky-100 shadow-2xs ${isFri ? 'text-indigo-600' : 'text-slate-500'} ${cellBg}`}>{DAYS_AR[date.getDay()]}</td>
                          {employees
                            .filter((e) => e.dept === selectedDept)
                            .map((emp) => {
                              const entry = schedule[dateStr]?.[emp.id];
                              const stType = entry?.shiftType || 'A';

                              const st = (shiftTypes || []).find((t: any) => t.id === stType);
                              let badgeStyle = 'text-slate-400 bg-slate-100 font-medium';
                              let badgeLabel = '🏝️ إجازة';

                              if (st) {
                                if (st.id === 'S') {
                                  badgeStyle = 'text-emerald-700 bg-emerald-50 border border-emerald-200/60 font-bold';
                                  badgeLabel = `🌅 ${st.name}`;
                                } else if (st.id === 'E') {
                                  badgeStyle = 'text-indigo-700 bg-indigo-50 border border-indigo-200/60 font-bold';
                                  badgeLabel = `🌙 ${st.name}`;
                                } else if (st.type === 'double') {
                                  badgeStyle = 'text-amber-700 bg-amber-50 border border-amber-200/60 font-bold animate-pulse';
                                  badgeLabel = `🔄 ${st.name} (كامل)`;
                                } else {
                                  badgeStyle = 'text-sky-700 bg-sky-50 border border-sky-300/30 font-bold';
                                  badgeLabel = `⏱️ ${st.name}`;
                                }
                              }

                              return (
                                <td
                                  key={emp.id}
                                  onClick={() => {
                                    if (!hasPermission('canEditSchedule')) return;
                                    setSmEmployee(emp.id);
                                    setSmDate(dateStr);
                                    setSmShiftType(stType);
                                    setSmNote(entry?.note || '');
                                    setSmMode('single');
                                    setShiftModalOpen(true);
                                  }}
                                  className="p-2 border-r border-sky-100 text-center cursor-pointer transition-all hover:bg-sky-100/30"
                                >
                                  <span className={`inline-block px-2.5 py-1 rounded-full font-bold text-[10px] ${badgeStyle}`}>
                                    {badgeLabel}
                                  </span>
                                  {entry?.note && (
                                    <span className="block text-[8px] text-slate-400 mt-0.5 truncate max-w-[80px] mx-auto">
                                      {entry.note}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* View: Attendance Records list */}
          {activeView === 'attendance' && (
            <div className="flex flex-col gap-6">
              {/* Widgets Summary Cards */}
              {(() => {
                const stats = getTodayAttendanceStats();
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" dir="rtl">
                    <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between shadow-sm text-right">
                      <div>
                        <span className="text-xs font-bold text-emerald-600">الموظفون الحاضرون (اليوم)</span>
                        <h4 className="text-2xl font-black text-emerald-800 mt-1">{stats.presentCount}</h4>
                        <p className="text-[10px] text-emerald-700 mt-1">سجلوا حضورهم لليوم</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-600 text-lg">
                        <UserCheck size={24} />
                      </div>
                    </div>

                    <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between shadow-sm text-right">
                      <div>
                        <span className="text-xs font-bold text-rose-600">الموظفون الغائبون (اليوم)</span>
                        <h4 className="text-2xl font-black text-rose-800 mt-1">{stats.absentCount}</h4>
                        <p className="text-[10px] text-rose-700 mt-1">لم يسجلوا حضورهم حتى الآن</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-rose-600/10 flex items-center justify-center text-rose-600 text-lg">
                        <UserX size={24} />
                      </div>
                    </div>

                    <div className="p-5 bg-sky-50 border border-sky-100 rounded-2xl flex items-center justify-between shadow-sm sm:col-span-2 lg:col-span-1 text-right">
                      <div>
                        <span className="text-xs font-bold text-sky-600">إجمالي قوة العمل</span>
                        <h4 className="text-2xl font-black text-sky-800 mt-1">{stats.totalActive} موظف</h4>
                        <p className="text-[10px] text-sky-700 mt-1">الموظفون المسجلون في قواعد البيانات</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-sky-600/10 flex items-center justify-center text-sky-600 text-lg">
                        <Users size={24} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Reports Query Filter */}
              <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
                <h3 className="font-extrabold text-slate-800 text-sm">تصفية وبحث كشف الحضور</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500">من تاريخ</label>
                    <input
                      type="date"
                      value={attFilterFrom}
                      onChange={(e) => setAttFilterFrom(e.target.value)}
                      className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                    />
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500">إلى تاريخ</label>
                    <input
                      type="date"
                      value={attFilterTo}
                      onChange={(e) => setAttFilterTo(e.target.value)}
                      className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500">الموظف</label>
                    <select
                      value={attFilterEmp}
                      onChange={(e) => setAttFilterEmp(e.target.value)}
                      className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                    >
                      <option value="">الكل</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500">القسم</label>
                    <select
                      value={attFilterDept}
                      onChange={(e) => setAttFilterDept(e.target.value)}
                      className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                    >
                      <option value="">الكل</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={loadAttendance}
                      className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
                    >
                      <Search size={14} />
                      <span>تحديث</span>
                    </button>

                    <button
                      onClick={() => {
                        const d = new Date();
                        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        setAttFilterFrom(todayStr);
                        setAttFilterTo(todayStr);
                        setAttFilterEmp('');
                        setAttFilterDept('');
                        setAttFilterStatus('');
                        // Trigger load
                        setTimeout(() => {
                          loadAttendance();
                        }, 50);
                      }}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-extrabold text-xs border border-slate-200/60 transition-all text-center whitespace-nowrap"
                      title="إعادة تعيين حقول الفلترة والبحث"
                    >
                      إعادة تعيين
                    </button>
                    
                    <button
                      onClick={() => {
                        // EXPORT CSV
                        let csv = '\uFEFF';
                        csv += 'التاريخ,الموظف,القسم,الحضور,الانصراف,المدة,مصدر البصمة\n';
                        attendanceRecords.forEach((r) => {
                          const deptObj = departments.find((d) => d.id === r.dept);
                          const fSource = r.source || (r.note?.includes('الإدارة') || r.note?.includes('الادارة') ? 'الإدارة' : 'المقر');
                          csv += `${r.date},${r.empName},${deptObj ? deptObj.name : r.dept},${r.checkIn},${r.checkOut || 'لم يسجل'},${
                            r.checkOutTs && r.checkInTs ? Math.round((r.checkOutTs - r.checkInTs) / 60000) + ' د' : ''
                          },${fSource}\n`;
                        });
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `كشف_حضور_${attFilterFrom}.csv`;
                        link.click();
                      }}
                      className="p-2.5 hover:bg-sky-50 border rounded-lg text-sky-600 transition-all"
                      title="تصدير CSV"
                    >
                      <Download size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Records List Log */}
              <div className="bg-white border border-sky-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-right text-xs">
                    <thead>
                      <tr className="bg-sky-50 text-slate-700 font-bold border-b border-sky-100">
                        <th className="p-3 font-extrabold">التاريخ</th>
                        <th className="p-3 font-extrabold">الموظف</th>
                        <th className="p-3 font-extrabold">القسم</th>
                        <th className="p-3 font-extrabold">الحضور</th>
                        <th className="p-3 font-extrabold">الانصراف</th>
                        <th className="p-3 font-extrabold">مدة العمل</th>
                        <th className="p-3 font-extrabold">مكان البصمة</th>
                        <th className="p-3 font-extrabold text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords
                        .filter((r) => {
                          if (attFilterFrom && r.date < attFilterFrom) return false;
                          if (attFilterTo && r.date > attFilterTo) return false;
                          if (attFilterEmp && r.empId !== attFilterEmp) return false;
                          if (attFilterDept && r.dept !== attFilterDept) return false;
                          if (attFilterStatus === 'present' && r.checkOut) return false;
                          if (attFilterStatus === 'checkedout' && !r.checkOut) return false;
                          return true;
                        })
                        .map((rec) => {
                          const deptObj = departments.find((d) => d.id === rec.dept);
                          
                          let duration = '-';
                          if (rec.checkInTs && rec.checkOutTs) {
                            const diffMins = Math.round((rec.checkOutTs - rec.checkInTs) / 60000);
                            duration = `${Math.floor(diffMins / 60)}ساعة ${diffMins % 60}د`;
                          }

                          const fSource = rec.source || (rec.note?.includes('الإدارة') || rec.note?.includes('الادارة') ? 'الإدارة' : 'المقر');

                          return (
                            <tr key={rec.id} className="border-b last:border-0 hover:bg-sky-50/20 text-slate-700 text-xs">
                              <td className="p-3 font-bold">{rec.date}</td>
                              <td className="p-3 font-black text-slate-800">{rec.empName}</td>
                              <td className="p-3 text-slate-500 font-medium">{deptObj ? deptObj.name : rec.dept}</td>
                              <td className="p-3 font-bold text-emerald-600">{rec.checkIn}</td>
                              <td className="p-3 text-slate-600 font-bold">{rec.checkOut || '—'}</td>
                              <td className="p-3 font-extrabold text-sky-600">{duration}</td>
                              <td className="p-3">
                                {fSource === 'الإدارة' ? (
                                  <span className="inline-block bg-purple-50 text-purple-700 border border-purple-100 rounded-lg px-2.5 py-0.5 font-extrabold text-[10px]">
                                    💼 الإدارة
                                  </span>
                                ) : (
                                  <span className="inline-block bg-sky-50 text-sky-700 border border-sky-100 rounded-lg px-2.5 py-0.5 font-extrabold text-[10px]">
                                    📍 المقر
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => {
                                    requestConfirm('هل تريد تأكيد حذف هذا السجل وحجبه من البيانات؟', async () => {
                                      try {
                                        await deleteDoc(doc(db, 'attendance', rec.id));
                                        loadAttendance();
                                      } catch (err) {
                                        alert('تعذر الحذف');
                                      }
                                    });
                                  }}
                                  className="p-1 hover:bg-rose-50 text-rose-500 rounded transition-all"
                                  title="حذف السجل"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                      {attendanceRecords.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-10 text-center text-slate-400 font-medium">
                            لا توجد سجلات حضور صالحة للمواصفات المحددة حالياً.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* View: Department Coverage Alerts */}
          {activeView === 'alerts' && (
            <div className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4 text-right animate-fade-in" dir="rtl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">تنبيهات نقص التغطية الجارية لشهر {scheduleMonth}</h3>
                  <p className="text-[10px] text-slate-400 mt-1">يتم الكشف التلقائي عن الأيام التي لا يوجد بها موظفون معينون في الشيفتات.</p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id)).length > 0 && (
                    <button
                      onClick={() => {
                        const unreadIds = getShiftGaps()
                          .filter(g => !(appSettings.readAlerts || []).includes(g.id))
                          .map(g => g.id);
                        markAllAlertsAsRead(unreadIds);
                      }}
                      className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-[10px] font-extrabold transition-all border border-sky-200/50 flex items-center gap-1"
                    >
                      <Check size={12} className="text-sky-600" />
                      <span>تحديد الكل كمقروء</span>
                    </button>
                  )}

                  {getShiftGaps().length > 0 && (
                    <button
                      onClick={() => {
                        requestConfirm('هل أنت متأكد من رغبتك في حذف جميع التنبيهات الحالية؟', () => {
                          const allIds = getShiftGaps().map(g => g.id);
                          dismissAllAlerts(allIds);
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
                      onClick={() => {
                        onUpdateSettings({ ...appSettings, readAlerts: [], deletedAlerts: [] });
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1"
                    >
                      <span>إعادة تعيين الكل</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                {getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id)).map((g) => {
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
                          تاريخ النقص: <strong className="font-extrabold font-mono text-slate-700">{g.date}</strong> — <span className={isRead ? 'text-slate-400' : 'text-amber-800'}>{g.msg}</span>
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

              {getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id)).length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  🎉 ممتاز! لا توجد تنبيهات نشطة غير مقروءة حالياً في كافة الأقسام النشطة!
                </div>
              )}
            </div>
          )}

          {/* View: Employees CRUD */}
          {activeView === 'employees' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-extrabold text-slate-800">قائمة بطاقات وموظفو الدوام</h3>
                <button
                  onClick={() => {
                    setEditingEmpId(null);
                    setEmName('');
                    setEmDept(departments[0]?.id || '');
                    setEmUsername('');
                    setEmPhone('');
                    setEmColor('#01696f');
                    setEmPassword('');
                    setEmpModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
                >
                  <Plus size={14} />
                  <span>إضافة موظف جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {employees.map((emp) => {
                  const empDept = departments.find((d) => d.id === emp.dept);
                  return (
                    <div key={emp.id} className="p-5 bg-white border border-sky-100 rounded-xl shadow-sm flex flex-col gap-3 relative overflow-hidden text-right" dir="rtl">
                      <div className="absolute top-0 right-0 w-2.5 h-full" style={{ backgroundColor: emp.color }}></div>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center w-10 h-10 text-sm font-black text-white rounded-full shadow-sm"
                          style={{ backgroundColor: emp.color }}
                        >
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs text-right">{emp.name}</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5 text-right">{empDept ? empDept.name : 'بدون فرع'}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 text-[10px] text-slate-500 font-medium">
                        <div>الجوال/واتساب: <strong className="font-extrabold text-slate-700">{emp.phone || 'غير مسجل'}</strong></div>
                        <div>حساب البوابة: <strong className="font-extrabold text-slate-700">{emp.username || 'غير مسجل'}</strong></div>
                        <div>الرمز السري: <strong className="font-extrabold text-emerald-600">{emp.password || '123456'}</strong></div>
                      </div>

                      <div className="flex gap-1.5 justify-end mt-2 pt-2 border-t text-[10px]">
                        <button
                          onClick={() => handleOpenWaModal(emp.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-sky-600 hover:bg-sky-50 rounded font-bold"
                        >
                          <MessageCircle size={12} />
                          <span>إرسال الجدول</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            setEditingEmpId(emp.id);
                            setEmName(emp.name);
                            setEmDept(emp.dept);
                            setEmUsername(emp.username || '');
                            setEmPhone(emp.phone || '');
                            setEmColor(emp.color || '#01696f');
                            setEmPassword(emp.password || '');
                            setEmpModalOpen(true);
                          }}
                          className="px-2.5 py-1 hover:bg-slate-50 text-slate-500 rounded font-bold"
                        >
                          تعديل
                        </button>

                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="px-2.5 py-1 hover:bg-rose-50 text-rose-500 rounded font-bold"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* View: Departments CRUD */}
          {activeView === 'departments' && (
            <div className="flex flex-col gap-5">
              <div className="flex justify-between items-center pb-2 border-b">
                <h3 className="text-sm font-extrabold text-slate-800">إدارة الأقسام والشيفتات النشطة</h3>
                <button
                  onClick={() => {
                    setEditingDeptId(null);
                    setDmName('');
                    setDmMorning(true);
                    setDmEvening(true);
                    setDmFriday('off');
                    setDeptModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
                >
                  <Plus size={14} />
                  <span>إضافة قسم جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {departments.map((dept) => {
                  const deptEmps = employees.filter((e) => e.dept === dept.id);
                  return (
                    <div key={dept.id} className="p-5 bg-white border border-sky-100 rounded-xl shadow-sm flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-sm">{dept.name}</h4>
                          <span className="inline-block mt-1 px-2.5 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-extrabold rounded-full">
                            📋 {deptEmps.length} موظف نشط
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingDeptId(dept.id);
                              setDmName(dept.name);
                              setDmMorning(dept.needsMorning);
                              setDmEvening(dept.needsEvening);
                              setDmFriday(dept.friday || 'off');
                              setDeptModalOpen(true);
                            }}
                            className="p-1 hover:bg-slate-50 text-slate-500 rounded"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => {
                              requestConfirm('هل تريد حذف هذا القسم بالكامل؟', () => {
                                const updated = departments.filter((d) => d.id !== dept.id);
                                onUpdateAppData({ ...appData, departments: updated });
                              });
                            }}
                            className="p-1 hover:bg-rose-50 text-rose-500 rounded"
                          >
                            حذف
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                        <div className={`p-2 rounded-lg ${dept.needsMorning ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                          صباحي: {dept.needsMorning ? 'مطلوب' : 'لا'}
                        </div>
                        <div className={`p-2 rounded-lg ${dept.needsEvening ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>
                          مسائي: {dept.needsEvening ? 'مطلوب' : 'لا'}
                        </div>
                        <div className="p-2 rounded-lg bg-rose-50 text-rose-700">
                          الجمعة: {dept.friday === 'off' ? 'إجازة' : dept.friday === 'partial' ? 'دوام جزئي' : 'عادي'}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {deptEmps.map((emp) => (
                          <span key={emp.id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                            👤 {emp.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* View: Received Requests approval */}
          {activeView === 'requests' && (
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
                                ⏱️ الفترات المطلوبة للبصمة: حضور <strong className="font-black text-slate-900">({req.checkInTime || '-'})</strong> • انصراف <strong className="font-black text-slate-900">({req.checkOutTime || '-'})</strong>
                              </span>
                            )}
                          </div>
                          {req.note && <div className="p-2 bg-white rounded mt-1.5 border leading-relaxed text-[11px]">{req.note}</div>}
                          
                          {!isPending && (req.reviewedBy || req.reviewedAt) && (
                            <div className="mt-2 text-[10px] text-slate-600 bg-slate-100/60 p-2 border border-slate-200/50 rounded-lg flex items-center gap-2 flex-wrap">
                              <span>👮 مراجع البوبة: <strong className="font-extrabold text-slate-900">{req.reviewedBy || 'المدير'}</strong></span>
                              <span className="text-slate-300">|</span>
                              <span>وقت الإجراء: <strong className="font-extrabold text-slate-700">{req.reviewedAt}</strong></span>
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
                                onClick={() => handleReviewRequest(req.id, 'approved')}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-all"
                              >
                                قبول واعتماد
                              </button>
                              <button
                                onClick={() => handleReviewRequest(req.id, 'rejected')}
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
          )}

          {/* View: Shift Types Management */}
          {activeView === 'shifttypes' && (
            <div className="flex flex-col gap-5 text-right animate-fade-in" dir="rtl">
              <div className="flex justify-between items-center pb-2 border-b border-sky-100">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">إدارة أنواع وفترات ومدد الشيفتات</h3>
                  <p className="text-[10px] text-slate-400 mt-1">قم بإدارة وتعيين فترات العمل اليومية المتوفرة للجدولة كشيفتات الصباح والمساء والليل.</p>
                </div>
                <button
                  onClick={() => {
                    setEditingStId(null);
                    setStCode('');
                    setStName('');
                    setStStart('08:00');
                    setStEnd('16:00');
                    setStStart2('17:00');
                    setStEnd2('21:00');
                    setStType('morning');
                    setShiftTypeModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all"
                >
                  <Plus size={14} />
                  <span>إضافة نوع شيفت جديد</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(shiftTypes || []).map((st: any) => {
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
                                    <span>{st.start} إلى {st.end}</span>
                                    <span className="text-[9px] bg-amber-50 text-amber-700 px-1 rounded-sm">
                                      ({(() => {
                                        const [sh, sm] = st.start.split(':').map(Number);
                                        const [eh, em] = st.end.split(':').map(Number);
                                        let diff = (eh * 60 + em) - (sh * 60 + sm);
                                        if (diff < 0) diff += 24 * 60;
                                        return `${Math.round(diff / 60)} س`;
                                      })()})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-extrabold">
                                    <span className="text-indigo-600">🌙 المسائية:</span>
                                    <span>{st.start2 || '17:00'} إلى {st.end2 || '21:00'}</span>
                                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1 rounded-sm">
                                      ({(() => {
                                        const [sh, sm] = (st.start2 || '17:00').split(':').map(Number);
                                        const [eh, em] = (st.end2 || '21:00').split(':').map(Number);
                                        let diff = (eh * 60 + em) - (sh * 60 + sm);
                                        if (diff < 0) diff += 24 * 60;
                                        return `${Math.round(diff / 60)} س`;
                                      })()})
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
                            onClick={() => {
                              setEditingStId(st.id);
                              setStCode(st.id);
                              setStName(st.name);
                              setStStart(st.start);
                              setStEnd(st.end);
                              setStStart2(st.start2 || '17:00');
                              setStEnd2(st.end2 || '21:00');
                              setStType(st.type || 'morning');
                              setShiftTypeModalOpen(true);
                            }}
                            className="px-2.5 py-1 hover:bg-sky-50 text-sky-600 border border-sky-100 rounded text-[10px] font-extrabold transition-all"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDeleteShiftType(st.id)}
                            className="px-2.5 py-1 hover:bg-rose-50 text-rose-500 border border-transparent hover:border-rose-100 rounded text-[10px] font-extrabold transition-all"
                          >
                            حذف
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-semibold">
                        <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-700">
                          نطاق الشيفت: <span className="font-extrabold text-indigo-700">
                            {st.type === 'double' ? 'شيفت يجمع فترتين' : (st.type === 'morning' ? 'دوام صباحي' : 'دوام مسائي / ليلي')}
                          </span>
                        </div>
                        <div className="p-2.5 bg-sky-50 border border-sky-100 rounded-lg text-sky-800">
                          المدة الإجمالية: <span className="font-extrabold text-sky-600">
                            {(() => {
                              const [sh, sm] = st.start.split(':').map(Number);
                              const [eh, em] = st.end.split(':').map(Number);
                              let diff = (eh * 60 + em) - (sh * 60 + sm);
                              if (diff < 0) diff += 24 * 60; // overnight check
                              
                              if (st.type === 'double') {
                                const [sh2, sm2] = (st.start2 || '17:00').split(':').map(Number);
                                const [eh2, em2] = (st.end2 || '21:00').split(':').map(Number);
                                let diff2 = (eh2 * 60 + em2) - (sh2 * 60 + sm2);
                                if (diff2 < 0) diff2 += 24 * 60;
                                diff += diff2;
                              }
                              
                              const hours = Math.floor(diff / 60);
                              const mins = diff % 60;
                              return mins > 0 ? `${hours} س و ${mins} د` : `${hours} سَاعات`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* View: General Settings */}
          {activeView === 'settings' && (
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
                      onClick={() => {
                        onUpdateSettings({ ...appSettings, companyName: companySettingsName });
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
                    <input
                      type="file"
                      id="logo-file-picker-input"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
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
                      value={appSettings?.officeLocation?.lat || ''}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...appSettings,
                          officeLocation: {
                            ...appSettings.officeLocation,
                            lat: e.target.value === '' ? '' : parseFloat(e.target.value)
                          }
                        })
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
                      value={appSettings?.officeLocation?.lng || ''}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...appSettings,
                          officeLocation: {
                            ...appSettings.officeLocation,
                            lng: e.target.value === '' ? '' : parseFloat(e.target.value)
                          }
                        })
                      }
                      placeholder="مثال: 46.67530"
                      className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-600">نطاق البصمة المسموح (بالمتر)</label>
                    <input
                      type="number"
                      value={appSettings?.officeLocation?.radius || 150}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...appSettings,
                          officeLocation: {
                            ...appSettings.officeLocation,
                            radius: parseInt(e.target.value) || 150
                          }
                        })
                      }
                      className="px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-extrabold"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-sky-50 bg-opacity-30 p-3.5 rounded-xl border border-sky-100/50">
                  <input
                    type="checkbox"
                    id="preventOutCheckout"
                    checked={!!appSettings?.officeLocation?.preventOutCheckout}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...appSettings,
                        officeLocation: {
                          ...appSettings.officeLocation,
                          preventOutCheckout: e.target.checked
                        }
                      })
                    }
                    className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
                  />
                  <label htmlFor="preventOutCheckout" className="text-xs font-extrabold text-slate-700 cursor-pointer select-none">
                    🔒 تفعيل خدمة عدم تسجيل انصراف خارج الموقع (التحقق من بقاء الموظف ضمن النطاق المسموح جغرافياً عند تسجيل الانصراف)
                  </label>
                </div>

                <div className="flex gap-2 flex-wrap items-center mt-1">
                  <button
                    onClick={handleDetectGPS}
                    className="flex items-center gap-1.5 px-4 py-2 border border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-xl font-bold text-xs transition-all shadow-sm"
                  >
                    <Crosshair size={13} />
                    <span>تحديد موقعي المباشر الحالي</span>
                  </button>
                  <button
                    onClick={() => {
                      alert('✅ تم حفظ كافة إعدادات سياج البصمة بنجاح.');
                    }}
                    className="flex items-center gap-1.5 px-5 py-2 hover:bg-sky-700 bg-sky-600 text-white rounded-xl font-bold text-xs font-medium transition-all shadow-sm"
                  >
                    <span>حفظ التعديلات الجغرافية</span>
                  </button>
                </div>

                {geoSettingStatus && (
                  <div className="text-[11px] font-bold text-slate-600 bg-slate-50 border p-2.5 rounded-xl">
                    {geoSettingStatus}
                  </div>
                )}
              </div>

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
                      onClick={() => {
                        setAdmName('');
                        setAdmUsername('');
                        setAdmEmail('');
                        setAdmPwd('');
                        setAdmPerms({
                          canEditSchedule: false,
                          canManageEmployees: false,
                          canManageDepts: false,
                          canApproveRequests: false,
                          canViewReports: false,
                          canManageSettings: false,
                          canPrint: false
                        });
                        setSubAdminModalOpen(true);
                      }}
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
                                    {key === 'canEditSchedule' && '📅 الجداول'}
                                    {key === 'canManageEmployees' && '👥 الموظفين'}
                                    {key === 'canManageDepts' && '🏢 الأقسام'}
                                    {key === 'canApproveRequests' && '✅ الاعتمادات'}
                                    {key === 'canViewReports' && '📊 التقارير'}
                                    {key === 'canManageSettings' && '⚙️ الإعدادات'}
                                    {key === 'canPrint' && '🖨️ الطباعة'}
                                  </span>
                                ))}
                            </div>
                          </div>
                          
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingAdmId(item.id);
                                setAdmName(item.name || '');
                                setAdmUsername(item.username || '');
                                setAdmEmail(item.email || '');
                                setAdmPwd(item.password || '');
                                setAdmPerms({
                                  canEditSchedule: !!item.permissions?.canEditSchedule,
                                  canManageEmployees: !!item.permissions?.canManageEmployees,
                                  canManageDepts: !!item.permissions?.canManageDepts,
                                  canApproveRequests: !!item.permissions?.canApproveRequests,
                                  canViewReports: !!item.permissions?.canViewReports,
                                  canManageSettings: !!item.permissions?.canManageSettings,
                                  canPrint: !!item.permissions?.canPrint
                                });
                                setSubAdminModalOpen(true);
                              }}
                              className="p-1.5 hover:bg-sky-50 text-sky-600 rounded transition-all"
                              title="تعديل بيانات المسؤول"
                            >
                              <Edit size={13} />
                            </button>

                            <button
                              onClick={() => {
                                requestConfirm('هل تريد إلغاء صلاحية هذا المسؤول وحذفه؟', async () => {
                                  try {
                                    await deleteDoc(doc(db, 'admins', item.id));
                                    loadSubAdmins();
                                  } catch (err) {
                                    alert('فشل الإجراء');
                                  }
                                });
                              }}
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
                    {registrationRequests.filter((r) => r.status === 'pending').map((it) => (
                      <div key={it.id} className="p-4 border rounded-xl bg-slate-50 flex justify-between items-center text-xs flex-wrap gap-2">
                        <div>
                          <div className="font-extrabold text-slate-800 text-xs">👤 الاسم: {it.name}</div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            النوع:{' '}
                            <strong className="font-bold text-sky-700">
                              {it.type === 'employee' ? 'موظف' : 'مسؤول فرعي'}
                            </strong>{' '}
                            | الجوال/الهاتف: <strong className="font-bold">{it.phone}</strong>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              requestConfirm('موافقة وقبول التسجيل؟', async () => {
                                try {
                                  const docRef = doc(db, 'registrationRequests', it.id);
                                  await updateDoc(docRef, { status: 'approved' });
                                  
                                  if (it.type === 'employee') {
                                    const updated = [...employees, {
                                      id: 'e' + Date.now(),
                                      name: it.name,
                                      dept: departments[0]?.id || '',
                                      phone: it.phone,
                                      username: it.username || it.name.replace(/\s+/g, '_').toLowerCase(),
                                      color: '#01696f'
                                    }];
                                    onUpdateAppData({ ...appData, employees: updated });
                                  }
                                  alert('تم اعتماد وتسجيل الحساب بنجاح.');
                                  loadRequests();
                                } catch (e) {
                                  alert('فشل الإجراء');
                                }
                              });
                            }}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-[10px] font-bold"
                          >
                            قبول واعتماد
                          </button>
                          <button
                            onClick={() => {
                              requestConfirm('رفض طلب التسجيل هذا؟', async () => {
                                try {
                                  const docRef = doc(db, 'registrationRequests', it.id);
                                  await updateDoc(docRef, { status: 'rejected' });
                                  alert('تم رفض الطلب.');
                                  loadRequests();
                                } catch (e) {
                                  alert('فشل الإجراء');
                                }
                              });
                            }}
                            className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded text-[10px] font-bold"
                          >
                            رفض
                          </button>
                        </div>
                      </div>
                    ))}

                    {registrationRequests.filter((r) => r.status === 'pending').length === 0 && (
                      <div className="py-8 text-center text-xs text-slate-400 font-medium">
                        لا توجد حالياً طلبات تسجيل حسابات جديدة في الانتظار.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Design and Development Footer credit */}
        <footer className="mb-6 mt-2 text-center text-[11px] text-slate-400 font-sans tracking-wide">
          التصميم والتطوير عن طريق <strong className="text-slate-500 font-extrabold hover:text-sky-500 transition-colors">SHADY NASSEF</strong> &nbsp;•&nbsp; جميع الحقوق محفوظة © 2026
        </footer>
      </div>

      {/* Admin Creator Modal */}
      {subAdminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl border border-sky-100 max-h-[85vh] overflow-y-auto">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b">
              {editingAdmId ? '✍️ تعديل بيانات حساب وصلاحيات المسؤول' : 'إضافة مسؤول / مدير دوام فرعي'}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-right" dir="rtl">
                <label className="text-xs font-bold text-slate-600">اسم المسؤول الكامل</label>
                <input
                  type="text"
                  value={admName}
                  onChange={(e) => setAdmName(e.target.value)}
                  placeholder="مثال: صالح العلي"
                  className="px-3.5 py-2.5 text-xs border rounded-lg focus:outline-none text-right font-medium"
                />
              </div>

              <div className="flex flex-col gap-1 text-right" dir="rtl">
                <label className="text-xs font-bold text-slate-600">اسم حساب الدخول (اسم المستخدم)</label>
                <input
                  type="text"
                  value={admUsername}
                  onChange={(e) => setAdmUsername(e.target.value)}
                  placeholder="مثال: saleh"
                  className="px-3.5 py-2.5 text-xs border rounded-lg focus:outline-none text-right font-mono"
                />
                <span className="text-[9px] text-slate-400">هذا الاسم يُستخدم لتسجيل الدخول بدلاً من البريد الإلكتروني</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">البريد الإلكتروني للربط</label>
                <input
                  type="email"
                  value={admEmail}
                  onChange={(e) => setAdmEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="px-3.5 py-2.5 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">الرمز السري المساعد</label>
                <input
                  type="password"
                  value={admPwd}
                  onChange={(e) => setAdmPwd(e.target.value)}
                  placeholder="رمز الدخول الفرعي"
                  className="px-3.5 py-2.5 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center bg-sky-50 p-2.5 rounded-lg border border-sky-100 mb-1">
                  <span className="text-[11px] text-sky-950 font-black">🌟 تعيين كامل الصلاحيات للمسؤول</span>
                  <input
                    type="checkbox"
                    checked={Object.values(admPerms).every(v => v === true)}
                    onChange={(e) => {
                      const updatedValue = e.target.checked;
                      setAdmPerms({
                        canEditSchedule: updatedValue,
                        canManageEmployees: updatedValue,
                        canManageDepts: updatedValue,
                        canApproveRequests: updatedValue,
                        canViewReports: updatedValue,
                        canManageSettings: updatedValue,
                        canPrint: updatedValue
                      });
                    }}
                    className="rounded text-sky-600 font-extrabold w-4 h-4 cursor-pointer"
                  />
                </div>

                <label className="text-xs font-bold text-slate-600">الصلاحيات المعتمدة التفصيلية</label>
                {Object.entries({
                  canEditSchedule: '📅 تعديل الجداول وإضافة دوام',
                  canManageEmployees: '👥 إدارة الموظفين (إضافة / تعديل / حذف)',
                  canManageDepts: '🏢 إدارة الأقسام والشيفتات',
                  canApproveRequests: '✅ الموافقة على طلبات الموظفين ورفضها',
                  canViewReports: '📊 عرض التقارير والإحصائيات ككشف حضور',
                  canManageSettings: '⚙️ تعديل إعدادات الشركة وإدارتها وبطاقاتها',
                  canPrint: '🖨️ طباعة وتصدير الجداول'
                }).map(([key, labelName]) => (
                  <label key={key} className="flex justify-between items-center p-2.5 bg-slate-50 border rounded-lg cursor-pointer hover:bg-slate-100/50 transition-colors">
                    <span className="text-[11px] text-slate-700 font-bold">{labelName}</span>
                    <input
                      type="checkbox"
                      checked={(admPerms as any)[key]}
                      onChange={(e) => setAdmPerms({ ...admPerms, [key]: e.target.checked })}
                      className="rounded text-sky-600 cursor-pointer"
                    />
                  </label>
                ))}
              </div>

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setSubAdminModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveSubAdmin}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  حفظ الحساب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift Roster Assignment Modal */}
      {shiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl border border-sky-100">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b">
              {editingShiftCell ? 'تعديل شيفت الدوام' : 'إسناد وتعيين شيفت جديد'}
            </h3>

            <div className="flex flex-col gap-4">
              
              {/* Assignment Mode choice */}
              <div className="flex p-0.5 bg-slate-100 rounded-lg text-center text-xs font-bold">
                <button
                  onClick={() => setSmMode('single')}
                  className={`flex-1 py-1.5 rounded ${smMode === 'single' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-500'}`}
                >
                  📅 يوم واحد
                </button>
                <button
                  onClick={() => setSmMode('multi')}
                  className={`flex-1 py-1.5 rounded ${smMode === 'multi' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-500'}`}
                >
                  📆 عدّة أيام
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600">الموظف</label>
                <select
                  value={smEmployee}
                  onChange={(e) => setSmEmployee(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>

              {smMode === 'single' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-600">تاريخ اليوم المرجو</label>
                  <input
                    type="date"
                    value={smDate}
                    onChange={(e) => setSmDate(e.target.value)}
                    className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500">من تاريخ</label>
                      <input
                        type="date"
                        value={smFrom}
                        onChange={(e) => setSmFrom(e.target.value)}
                        className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500">إلى تاريخ</label>
                      <input
                        type="date"
                        value={smTo}
                        onChange={(e) => setSmTo(e.target.value)}
                        className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                      />
                    </div>
                  </div>
                  <div id="sm-rest-days-container" className="flex flex-col gap-1.5 mt-1 border-t border-slate-100 pt-2.5">
                    <span className="text-[11px] font-bold text-slate-600">
                      تخصيص أيام الراحة الأسبوعية للموظف (سيتم تعيينها كإجازة تمنع البصمة):
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: 'السبت', val: 6 },
                        { label: 'الأحد', val: 0 },
                        { label: 'الاثنين', val: 1 },
                        { label: 'الثلاثاء', val: 2 },
                        { label: 'الأربعاء', val: 3 },
                        { label: 'الخميس', val: 4 },
                        { label: 'الجمعة', val: 5 },
                      ].map((day) => {
                        const isSelected = smRestDays.includes(day.val);
                        return (
                          <button
                            id={`sm-rest-day-btn-${day.val}`}
                            key={day.val}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSmRestDays(smRestDays.filter(d => d !== day.val));
                              } else {
                                setSmRestDays([...smRestDays, day.val]);
                              }
                            }}
                            className={`py-1 rounded-md font-bold text-[10px] text-center border transition-all ${
                              isSelected
                                ? 'bg-sky-600 border-sky-700 text-white shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[9px] text-slate-400">
                      * خلال الفترة المذكورة، سيتم إسناد "إجازة" للأيام المختارة أعلاه، بينما تسند نوبة الدوام لباقي الأيام.
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600">نوع نوبة/شيفت الدوام</label>
                <select
                  value={smShiftType}
                  onChange={(e) => setSmShiftType(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium text-slate-800"
                >
                  {(shiftTypes || []).map((st: any) => (
                    <option key={st.id} value={st.id}>
                      {st.id === 'S' ? '🌅' : st.id === 'E' ? '🌙' : st.type === 'double' ? '🔄' : '⏱️'} {st.name} {st.type === 'double' ? '— (كامل: صباحي ومسائي)' : ''} — ({st.start} حتى {st.end})
                    </option>
                  ))}
                  <option value="A">🏝️ إجازة / راحة أسبوعية</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600">ملاحظات توضيحية (اختياري)</label>
                <input
                  type="text"
                  value={smNote}
                  onChange={(e) => setSmNote(e.target.value)}
                  placeholder="مثال: بديل ترحيل، تعويض..."
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setShiftModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveShift}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  حفظ الدوام
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Dialog CRUD Modal */}
      {empModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-sky-100">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b">
              {editingEmpId ? 'تعديل بيانات الموظف' : 'بطاقة موظف جديدة'}
            </h3>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">الاسم الكامل</label>
                <input
                  type="text"
                  value={emName}
                  onChange={(e) => setEmName(e.target.value)}
                  placeholder="محمد أحمد"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">الفرع / القسم النشط</label>
                <select
                  value={emDept}
                  onChange={(e) => setEmDept(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">اسم مستخدم البوابة (للدخول المباشر)</label>
                <input
                  type="text"
                  value={emUsername}
                  onChange={(e) => setEmUsername(e.target.value)}
                  placeholder="ahmed_mohammed"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none placeholder-slate-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">الرقم السري للموظف (مينيموم 6 خانات)</label>
                <input
                  type="text"
                  value={emPassword}
                  onChange={(e) => setEmPassword(e.target.value)}
                  placeholder="123456"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none placeholder-slate-300 font-mono text-left"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">رقم جوال واتساب</label>
                <input
                  type="tel"
                  value={emPhone}
                  onChange={(e) => setEmPhone(e.target.value)}
                  placeholder="مثال: 966501234567"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600">رمز أو لون تمييز الهوية</label>
                <div className="flex gap-2 flex-wrap">
                  {['#01696f', '#2563eb', '#7c3aed', '#dc2626', '#d97706', '#0891b2', '#be185d', '#065f46'].map((hex) => (
                    <button
                      key={hex}
                      onClick={() => setEmColor(hex)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        emColor === hex ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setEmpModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddEmployee}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  حفظ البيانات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Creator Dialog Modal */}
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-sky-100">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b">
              {editingDeptId ? 'تعديل صلاحيات القسم' : 'إدارة فرع أو قسم جديد'}
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">اسم القسم</label>
                <input
                  type="text"
                  value={dmName}
                  onChange={(e) => setDmName(e.target.value)}
                  placeholder="مثال: قسم المبيعات"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600">نظام الرقابة وتامين التغطية</label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dmMorning}
                    onChange={(e) => setDmMorning(e.target.checked)}
                    className="rounded text-sky-600"
                  />
                  <span>يتطلب تأمين تغطية نوبة الصباح</span>
                </label>
                
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dmEvening}
                    onChange={(e) => setDmEvening(e.target.checked)}
                    className="rounded text-sky-600"
                  />
                  <span>يتطلب تأمين تغطية نوبة المساء</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600">وضعية عطلة نهاية الأسبوع (الجمعة)</label>
                <select
                  value={dmFriday}
                  onChange={(e: any) => setDmFriday(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                >
                  <option value="off">الجمعة إجازة رسمية بالكامل</option>
                  <option value="partial">عمل جزئي (شيفت واحد فقط)</option>
                  <option value="normal">يوم عمل عادي ونظام كامل</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setDeptModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddDept}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  حفظ القسم
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift Type Creator Dialog Modal */}
      {shiftTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-sky-100 text-right" dir="rtl">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b">
              {editingStId ? 'تعديل نوع الشيفت' : 'إضافة نوع شيفت جديد'}
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">الرمز التعريفي للشيفت (بحد أقصى ٣ حروف)</label>
                <input
                  type="text"
                  maxLength={3}
                  disabled={!!editingStId}
                  value={stCode}
                  onChange={(e) => setStCode(e.target.value.toUpperCase())}
                  placeholder="مثال: N، M، S"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">اسم الشيفت المفسر (العربي)</label>
                <input
                  type="text"
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  placeholder="مثال: نوبة ليلية"
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600">بداية الشيفت (أو الصباحي)</label>
                  <input
                    type="time"
                    value={stStart}
                    onChange={(e) => setStStart(e.target.value)}
                    className="px-3 py-2 text-xs border rounded-lg focus:outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600">نهاية الشيفت (أو الصباحي)</label>
                  <input
                    type="time"
                    value={stEnd}
                    onChange={(e) => setStEnd(e.target.value)}
                    className="px-3 py-2 text-xs border rounded-lg focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600">نطاق عمل نوبة الدوام</label>
                <select
                  value={stType}
                  onChange={(e) => setStType(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg focus:outline-none bg-white font-medium"
                >
                  <option value="morning">🌅 دوام صباحي</option>
                  <option value="evening">🌙 دوام مسائي / ليلي</option>
                  <option value="double">🔄 شيفت يجمع فترة صباحي وفترة مسائي</option>
                </select>
              </div>

              {stType === 'double' && (
                <div className="p-3 bg-sky-50/50 border border-sky-100 rounded-xl flex flex-col gap-2.5">
                  <span className="text-[10px] font-extrabold text-sky-800">🌙 مواقيت الفترة المسائية (الشيفت الثاني):</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-bold text-slate-500">بداية المسائي</label>
                      <input
                        type="time"
                        value={stStart2}
                        onChange={(e) => setStStart2(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none font-mono bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-bold text-slate-500">نهاية المسائي</label>
                      <input
                        type="time"
                        value={stEnd2}
                        onChange={(e) => setStEnd2(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none font-mono bg-white"
                      />
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium">
                    * سيظهر النظام للموظف في واجهته ساعات عمل الصباح وساعات عمل المساء لحساب فترات البصم والمدد بدقة.
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setShiftTypeModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddShiftType}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  حفظ الشيفت
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message preview and Schedule PDF generator Modal */}
      {waModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-3xl p-6 bg-white rounded-2xl shadow-xl border border-sky-100 max-h-[92vh] overflow-y-auto">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b text-right" dir="rtl">📅 معالجة وإرسال جدول الدوام الشهري</h3>

            <div className="flex flex-col gap-4">
              {/* Year and Month Dropdowns */}
              <div className="grid grid-cols-2 gap-3 pb-2 border-b text-right" dir="rtl">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500">اختر شهر التقويم</label>
                  <select
                    value={(() => {
                      const d = waFrom ? new Date(waFrom + 'T00:00:00') : new Date();
                      return d.getMonth();
                    })()}
                    onChange={(e) => {
                      const m = parseInt(e.target.value);
                      const d = waFrom ? new Date(waFrom + 'T00:00:00') : new Date();
                      const y = d.getFullYear();
                      const firstDayStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                      const lastDayVal = new Date(y, m + 1, 0).getDate();
                      const lastDayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;
                      setWaFrom(firstDayStr);
                      setWaTo(lastDayStr);
                    }}
                    className="px-3 py-1.5 text-xs border rounded-lg focus:outline-none bg-white font-bold text-slate-700 cursor-pointer"
                  >
                    {[
                      'يناير (1)', 'فبراير (2)', 'مارس (3)', 'أبريل (4)', 'مايو (5)', 'يونيو (6)',
                      'يوليو (7)', 'أغسطس (8)', 'سبتمبر (9)', 'أكتوبر (10)', 'نوفمبر (11)', 'ديسمبر (12)'
                    ].map((mName, idx) => (
                      <option key={idx} value={idx}>{mName}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500">اختر السنة</label>
                  <select
                    value={(() => {
                      const d = waFrom ? new Date(waFrom + 'T00:00:00') : new Date();
                      return d.getFullYear();
                    })()}
                    onChange={(e) => {
                      const y = parseInt(e.target.value);
                      const d = waFrom ? new Date(waFrom + 'T00:00:00') : new Date();
                      const m = d.getMonth();
                      const firstDayStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                      const lastDayVal = new Date(y, m + 1, 0).getDate();
                      const lastDayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayVal).padStart(2, '0')}`;
                      setWaFrom(firstDayStr);
                      setWaTo(lastDayStr);
                    }}
                    className="px-3 py-1.5 text-xs border rounded-lg focus:outline-none bg-white font-bold text-slate-700 cursor-pointer"
                  >
                    {[2025, 2026, 2027, 2028, 2029].map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Real-time PDF preview builder panel - Renders a beautiful monthly calendar image */}
              <div className="p-4 bg-slate-50/50 rounded-xl max-h-[520px] overflow-y-auto border border-dashed border-slate-200" id="pdf-wa-render-panel">
                <div 
                  id="pdf-content-to-capture"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#0c2340',
                    fontFamily: "'Tajawal', Arial, sans-serif",
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1px solid #7dd3fc',
                    boxShadow: '0 4px 16px rgba(14,165,233,.08)',
                    direction: 'rtl',
                    textAlign: 'right',
                    width: '100%',
                    maxWidth: '680px',
                    margin: '0 auto'
                  }}
                >
                  {(() => {
                    const start = waFrom ? new Date(waFrom + 'T00:00:00') : new Date();
                    const selYear = start.getFullYear();
                    const selMonth = start.getMonth();
                    const emp = employees.find((e) => e.id === waTargetId);
                    const empDept = departments.find((d) => d.id === emp?.dept);
                    
                    const monthArNames = [
                      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
                    ];

                    const firstDayOfWeek = new Date(selYear, selMonth, 1).getDay(); // Sunday=0, Monday=1 etc.
                    const totalDaysInMonth = new Date(selYear, selMonth + 1, 0).getDate();

                    const cells: any[] = [];
                    // Previous month pad cells
                    for (let i = 0; i < firstDayOfWeek; i++) {
                      cells.push({ empty: true });
                    }
                    // Current month cells
                    for (let d = 1; d <= totalDaysInMonth; d++) {
                      const dateStr = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const entry = schedule[dateStr]?.[waTargetId];
                      cells.push({
                        empty: false,
                        dayNum: d,
                        dateStr,
                        entry
                      });
                    }

                    const WEEKDAYS_AR_CAL = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

                    return (
                      <>
                        {/* Elegant Calendar Header for the PDF rendering */}
                        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #0ea5e9', paddingBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
                            {appSettings?.logoDataUrl ? (
                              <img 
                                src={appSettings.logoDataUrl} 
                                alt="Logo" 
                                style={{ width: '45px', height: '45px', objectFit: 'contain', backgroundColor: '#ffffff', borderRadius: '8px', padding: '2px', border: '1px solid #e2e8f0' }}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span style={{ fontSize: '32px' }}>📅</span>
                            )}
                            <h1 style={{ fontSize: '20px', fontWeight: '900', color: '#0c2340', margin: 0 }}>
                              {appSettings?.companyName || 'نظام إدارة الدوام الذكي'}
                            </h1>
                          </div>
                          <h2 style={{ fontSize: '13px', color: '#0ea5e9', fontWeight: 'bold', margin: '4px 0' }}>
                            التقويم الشهري لدوام وشيفتات الموظف الفردي
                          </h2>
                          <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>
                            مستند رسمي صادر عن إدارة شؤون الموظفين بـ {appSettings?.companyName || 'المؤسسة'}
                          </p>
                        </div>

                        {/* Employee Metadata */}
                        <div style={{ 
                          backgroundColor: '#f0f8ff', 
                          border: '1px solid #bae6fd', 
                          borderRadius: '12px', 
                          padding: '12px 16px', 
                          marginBottom: '20px',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '10px',
                          fontSize: '12px'
                        }}>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#3b7ab5', fontWeight: 'bold' }}>👤 اسم الموظف: </span>
                            <strong style={{ color: '#0c2340', fontWeight: '900', fontSize: '13px' }}>{emp?.name || 'غير مسجل'}</strong>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#3b7ab5', fontWeight: 'bold' }}>🏢 الفرع / القسم: </span>
                            <strong style={{ color: '#0c2340', fontWeight: '900' }}>{empDept ? empDept.name : 'بدون فرع'}</strong>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#3b7ab5', fontWeight: 'bold' }}>📞 رقم الجوال: </span>
                            <strong style={{ color: '#0c2340', fontWeight: '900', fontFamily: 'monospace' }}>{emp?.phone || 'غير مسجل'}</strong>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#3b7ab5', fontWeight: 'bold' }}>📅 فترة الجدول: </span>
                            <strong style={{ color: '#0ea5e9', fontWeight: '900' }}>{monthArNames[selMonth]} {selYear}</strong>
                          </div>
                        </div>

                        {/* Calendar Grid Header (Weekdays starting Sunday) */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(7, 1fr)', 
                          gap: '6px', 
                          marginBottom: '8px', 
                          textAlign: 'center' 
                        }}>
                          {WEEKDAYS_AR_CAL.map((dayName) => (
                            <div 
                              key={dayName} 
                              style={{ 
                                backgroundColor: '#0284c7', 
                                color: '#ffffff', 
                                fontWeight: '900', 
                                fontSize: '11px', 
                                padding: '8px 4px', 
                                borderRadius: '6px' 
                              }}
                            >
                              {dayName}
                            </div>
                          ))}
                        </div>

                        {/* Calendar Days Grid */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(7, 1fr)', 
                          gap: '6px' 
                        }}>
                          {cells.map((cell, idx) => {
                            if (cell.empty) {
                              return (
                                <div 
                                  key={`empty-${idx}`} 
                                  style={{ 
                                    aspectRatio: '1', 
                                    backgroundColor: '#f8fafc', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px', 
                                    opacity: '0.4' 
                                  }}
                                />
                              );
                            }

                            const stType = cell.entry?.shiftType || 'A';
                            const st = (shiftTypes || []).find((t: any) => t.id === stType);
                            
                            let bgStyle = '#f1f5f9';
                            let textStyle = '#475569';
                            let borderStyleColor = '#cbd5e1';
                            let icon = '🏝️';
                            let title = 'إجازة';
                            
                            if (st) {
                              title = st.name.replace(/شيفت|شفت/g, '').trim();
                              if (st.id === 'S') {
                                bgStyle = '#dcfce7';
                                textStyle = '#15803d';
                                borderStyleColor = '#bbf7d0';
                                icon = '🌅';
                              } else if (st.id === 'E') {
                                bgStyle = '#fef3c7';
                                textStyle = '#b45309';
                                borderStyleColor = '#fde68a';
                                icon = '🌙';
                              } else if (st.type === 'double') {
                                bgStyle = '#ffedd5';
                                textStyle = '#c2410c';
                                borderStyleColor = '#fed7aa';
                                icon = '🔄';
                              } else {
                                bgStyle = '#e0f2fe';
                                textStyle = '#0369a1';
                                borderStyleColor = '#bae6fd';
                                icon = '⏱️';
                              }
                            }

                            const isFriday = new Date(selYear, selMonth, cell.dayNum).getDay() === 5;
                            if (title === 'إجازة' && isFriday) {
                              bgStyle = '#f8fafc';
                              textStyle = '#64748b';
                              borderStyleColor = '#e2e8f0';
                              title = 'جـمـعـة';
                            }

                            return (
                              <div 
                                key={cell.dateStr} 
                                style={{ 
                                  aspectRatio: '1',
                                  padding: '4px 6px 6px 6px',
                                  border: '1.5px solid',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  position: 'relative',
                                  overflow: 'hidden',
                                  backgroundColor: bgStyle, 
                                  color: textStyle, 
                                  borderColor: borderStyleColor 
                                }}
                              >
                                <div style={{ 
                                  width: '100%', 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  lineHeight: '1'
                                }}>
                                  <span style={{ 
                                    fontSize: '11px', 
                                    fontWeight: '900', 
                                    color: '#0c2340' 
                                  }}>
                                    {cell.dayNum}
                                  </span>
                                  <span style={{ fontSize: '13px', lineHeight: '1' }}>
                                    {icon}
                                  </span>
                                </div>
                                
                                <div style={{ 
                                  fontSize: '9.5px', 
                                  fontWeight: '900', 
                                  textAlign: 'center', 
                                  lineHeight: '1.2',
                                  width: '100%',
                                  marginTop: '2px',
                                  marginBottom: '2px',
                                  whiteSpace: 'normal',
                                  direction: 'rtl'
                                }}>
                                  {title}
                                </div>

                                {st && (
                                  <div style={{
                                    fontSize: '8px',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    color: textStyle,
                                    opacity: 0.9,
                                    lineHeight: '1.1'
                                  }}>
                                    {st.hours ? `${st.hours} س` : ''} {st.start && st.end ? `[${st.start}-${st.end}]` : ''}
                                  </div>
                                )}

                                {cell.entry?.note ? (
                                  <div style={{ 
                                    fontSize: '7px', 
                                    color: '#475569', 
                                    textAlign: 'center', 
                                    whiteSpace: 'nowrap', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis',
                                    width: '100%',
                                    marginTop: '2px' 
                                  }} title={cell.entry.note}>
                                    📝 {cell.entry.note}
                                  </div>
                                ) : (
                                  <div style={{ height: '2px' }}></div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Summary Footer on the PDF */}
                        <div style={{ 
                          marginTop: '20px', 
                          borderTop: '1px dashed #7dd3fc', 
                          paddingTop: '12px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          fontSize: '9px', 
                          color: '#475569' 
                        }}>
                          <div>تاريخ الطباعة والحفظ: <strong style={{ color: '#0c2340' }}>{new Date().toLocaleDateString('ar-SA')}</strong></div>
                          <div>شؤون الموظفين • {appSettings?.companyName || 'نظام الرعاية والدوام الذكي'}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-2 pt-2 border-t text-xs">
                <button
                  onClick={() => setWaModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-50 border rounded-lg text-slate-500 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={downloadWaPDF}
                  className="px-4 py-2 hover:bg-slate-100 border border-sky-100 text-sky-700 rounded-lg font-bold"
                >
                  تنزيل تقويم الشهر كصورة PDF 🖨️
                </button>
                <button
                  onClick={handleSendWhatsApp}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold"
                >
                  إرسال واتساب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col gap-4 text-center animate-fade-in">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-full">
                <AlertTriangle size={24} />
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

const getAttTodayStr = () => {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
};
