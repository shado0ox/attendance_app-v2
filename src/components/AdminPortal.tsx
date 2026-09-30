import { attendanceToday } from '../lib/attendanceQuery';
import { getApprovedLocations } from '../lib/attendanceLocations';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, ClipboardCheck, Bell, Users, Building2,
  Clock, Inbox, Settings, LogOut, ChevronRight, ChevronLeft, Printer, Plus,
  Search, Download, Trash2, Check, X, Shield, UserCheck, UserX, Key, Save,
  Crosshair, MessageCircle, UploadCloud, Loader, AlertTriangle, Edit
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import AdminSidebar from './AdminSidebar';
import DashboardView from '../pages/admin/DashboardView';
import AttendanceView from '../pages/admin/AttendanceView';
import ScheduleView from '../pages/admin/ScheduleView';
import AlertsView from '../pages/admin/AlertsView';
import EmployeesView from '../pages/admin/EmployeesView';
import DepartmentsView from '../pages/admin/DepartmentsView';
import RequestsView from '../pages/admin/RequestsView';
import ShiftTypesView from '../pages/admin/ShiftTypesView';
import SettingsView from '../pages/admin/SettingsView';
import CompaniesView from '../pages/admin/CompaniesView';

interface AdminPortalProps {
  admin: any;
  appSettings: any;
  appData: any;
  departments: any[];
  employees: any[];
  shiftTypes: any[];
  schedule: any;
  onLogout: () => void;
  onUpdateSettings: (settings: any) => Promise<boolean>;
  onUpdateAppData: (data: any) => Promise<boolean>;
  registrationRequests: any[];
  companyId: string;
  companiesList: any[];
  fetchCompanies: () => void;
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
  registrationRequests,
  companyId,
  companiesList,
  fetchCompanies
}: AdminPortalProps) {
  const { view: routeView } = useParams<{ view: string }>();
  const navigate = useNavigate();
  const activeView = routeView || 'dashboard';
  const setActiveTab = (view: string) => navigate(`/admin/${view}`);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Month navigation state
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDept, setSelectedDept] = useState(departments[0]?.id || 'dept1');

  // Attendance report state
  const [attFilterFrom, setAttFilterFrom] = useState(attendanceToday);
  const [attFilterTo, setAttFilterTo] = useState(attendanceToday);
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

  // Company management states
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [compName, setCompName] = useState('');
  const [compSlug, setCompSlug] = useState('');
  const [compLogoUrl, setCompLogoUrl] = useState('');
  const [compMonthlyFee, setCompMonthlyFee] = useState('150');
  const [compAdminUsername, setCompAdminUsername] = useState('');
  const [compAdminPassword, setCompAdminPassword] = useState('');
  const [compCompanyCode, setCompCompanyCode] = useState('0');
  const [compMonths, setCompMonths] = useState('12');
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [emName, setEmName] = useState('');
  const [emDept, setEmDept] = useState('');
  const [emUsername, setEmUsername] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emColor, setEmColor] = useState('#01696f');
  const [emPassword, setEmPassword] = useState('');
  const [emRestrictLocations, setEmRestrictLocations] = useState(false);
  const [emLocationIds, setEmLocationIds] = useState<string[]>([]);
  const employeeLocationOptions = getApprovedLocations(appSettings);

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
  }, [activeView, companyId]);

  const hasPermission = (perm: string) => {
    if (admin.role === 'superadmin') return true;
    return admin.permissions?.[perm] === true;
  };

  const loadSubAdmins = async () => {
    setSubAdminsLoading(true);
    try {
      const response = await fetch(`/api/admins?companyId=${companyId}`);
      if (response.ok) {
        const loaded = await response.json();
        setSubAdmins(loaded);
      }
    } catch (e) {
      console.error('Error loading admins from PostgreSQL:', e);
    } finally {
      setSubAdminsLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const response = await fetch(`/api/requests?companyId=${companyId}`);
      if (response.ok) {
        const loaded = await response.json();
        loaded.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setAdminRequests(loaded);
      }
    } catch (e) {
      console.error('Error loading requests from PostgreSQL:', e);
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadAttendance = async () => {
    setAttLoading(true);
    try {
      const response = await fetch(`/api/attendance?companyId=${encodeURIComponent(companyId)}&from=${attendanceToday()}&to=${attendanceToday()}`);
      if (response.ok) {
        const loaded = await response.json();
        setAttendanceRecords(loaded);
      }
    } catch (e) {
      console.error('Error loading attendance from PostgreSQL:', e);
    } finally {
      setAttLoading(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!compName.trim() || !compSlug.trim() || !compAdminUsername.trim() || !compAdminPassword.trim()) {
      alert('الرجاء إدخال كافة الحقول الأساسية: اسم الشركة، رمز الرابط، اسم المستخدم، ورمز المرور');
      return;
    }

    const cleanSlug = compSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanSlug) {
      alert('الرجاء إدخال رمز رابط صالح (حروف إنجليزية وأرقام فقط)');
      return;
    }

    // Subscription expiration calculation
    const months = parseInt(compMonths) || 12;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const payload = {
      id: cleanSlug,
      name: compName.trim(),
      logoUrl: compLogoUrl.trim(),
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expiresAt.toISOString(),
      monthlyFee: compMonthlyFee.trim() || '150',
      adminUsername: compAdminUsername.trim().toLowerCase(),
      adminPassword: compAdminPassword.trim(),
      companyCode: compCompanyCode.trim() || '0',
    };

    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'فشل حفظ الشركة');
      }

      alert('🎉 تم إنشاء مساحة عمل الشركة والبيانات الافتراضية بنجاح!');
      setCompanyModalOpen(false);
      
      // Clear fields
      setCompName('');
      setCompSlug('');
      setCompLogoUrl('');
      setCompMonthlyFee('150');
      setCompAdminUsername('');
      setCompAdminPassword('');
      setCompCompanyCode('0');
      setCompMonths('12');

      fetchCompanies();
    } catch (e: any) {
      alert('حدث خطأ: ' + e.message);
    }
  };

  const handleExtendCompanySubscription = async (comp: any) => {
    const currentExpire = comp.subscriptionExpiresAt ? new Date(comp.subscriptionExpiresAt) : new Date();
    const newExpire = new Date(currentExpire.getTime() + 30 * 24 * 60 * 60 * 1000); // Add 30 days
    
    try {
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...comp,
          subscriptionExpiresAt: newExpire.toISOString(),
          subscriptionStatus: 'active'
        })
      });

      if (!response.ok) throw new Error('فشل تمديد الاشتراك');
      alert(`🎉 تم تمديد اشتراك شركة (${comp.name}) لمدة 30 يوماً بنجاح!`);
      fetchCompanies();
    } catch (err: any) {
      alert('خطأ أثناء التمديد: ' + err.message);
    }
  };

  const handleToggleCompanyStatus = async (comp: any) => {
    const nextStatus = comp.subscriptionStatus === 'active' ? 'suspended' : 'active';
    const msg = nextStatus === 'suspended' ? 'هل تريد بالتأكيد تجميد/تعليق اشتراك هذه الشركة؟' : 'هل تريد تنشيط اشتراك هذه الشركة؟';
    
    requestConfirm(msg, async () => {
      try {
        const response = await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...comp,
            subscriptionStatus: nextStatus
          })
        });

        if (!response.ok) throw new Error('فشل تعديل حالة الاشتراك');
        alert(`تم تحديث حالة الاشتراك بنجاح إلى (${nextStatus === 'active' ? 'نشط' : 'معلّق'}).`);
        fetchCompanies();
      } catch (err: any) {
        alert('خطأ أثناء التعديل: ' + err.message);
      }
    });
  };

  const handleDeleteCompanySpace = async (compId: string) => {
    requestConfirm('🛑 تحذير خطير: هل أنت متأكد تماماً من حذف مساحة العمل هذه؟ سيتم مسح كافة البيانات والموظفين والشيفتات وسجلات الحضور التابعة لهذه الشركة نهائياً ولا يمكن الاسترجاع!', async () => {
      try {
        const response = await fetch(`/api/companies/${compId}`, {
          method: 'DELETE'
        });

        if (!response.ok) throw new Error('فشل حذف مساحة العمل');
        alert('🗑️ تم حذف مساحة عمل الشركة بالكامل بنجاح.');
        fetchCompanies();
      } catch (err: any) {
        alert('خطأ أثناء الحذف: ' + err.message);
      }
    });
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
    const todayStrFull = attendanceToday();
    const todayCheckedIn = attendanceRecords.filter(r => r.date === todayStrFull && (r.checkIn || r.checkIn2));
    const presentIds = [...new Set(todayCheckedIn.map(r => r.empId))];

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

  const handleSaveShift = async () => {
    if (!smEmployee) {
      alert('الرجاء اختيار الموظف');
      return;
    }

    const updatedSchedule = structuredClone(schedule);

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

    if (!await onUpdateAppData({ ...appData, schedule: updatedSchedule })) return;
    setShiftModalOpen(false);
  };

  const handleAddEmployee = async () => {
    if (!emName.trim()) return;
    if (emRestrictLocations && !emLocationIds.some(id => employeeLocationOptions.some(site => site.id === id))) {
      alert('اختر موقع بصمة مفعّلًا واحدًا على الأقل للموظف.'); return;
    }
    const newEmp = {
      restrictAttendanceLocations: emRestrictLocations,
      allowedAttendanceLocationIds: emRestrictLocations ? emLocationIds : [],
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
      updatedEmployees = updatedEmployees.map((e) => (e.id === editingEmpId ? { ...e, ...newEmp } : e));
    } else {
      updatedEmployees.push(newEmp);
    }

    if (!await onUpdateAppData({ ...appData, employees: updatedEmployees })) return;
    setEmpModalOpen(false);
    setEditingEmpId(null);
  };

  const handleDeleteEmployee = (id: string) => {
    requestConfirm('هل تريد حذف الموظف المحدد؟', () => {
      const updated = employees.filter((e) => e.id !== id);
      onUpdateAppData({ ...appData, employees: updated });
    });
  };

  const handleAddDept = async () => {
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

    if (!await onUpdateAppData({ ...appData, departments: updatedDepts })) return;
    setDeptModalOpen(false);
    setEditingDeptId(null);
  };

  const handleAddShiftType = async () => {
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

    if (!await onUpdateAppData({ ...appData, shiftTypes: updatedShiftTypes })) return;
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
    if (!admName.trim() || !admUsername.trim() || (!editingAdmId && !admPwd.trim())) {
      alert('الرجاء إدخال اسم المسؤول، واسم المستخدم، ورمز تسجيل الدخول');
      return;
    }
    const adminData: any = {
      name: admName.trim(),
      username: admUsername.trim().toLowerCase(),
      email: admEmail.trim() || `${admUsername.trim().toLowerCase()}@company.com`,
      role: 'admin',
      permissions: admPerms,
      companyId: companyId || 'default'
    };
    if (admPwd.trim()) {
      adminData.password = admPwd.trim();
    }

    try {
      const payload = editingAdmId 
        ? { id: editingAdmId, ...adminData }
        : adminData;

      const response = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('فشل الحفظ على الخادم');
      }

      if (editingAdmId) {
        alert('تم تحديث بيانات المسؤول بنجاح');
      } else {
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
      // 1. Update request status
      const reqResponse = await fetch(`/api/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision })
      });

      if (!reqResponse.ok) {
        throw new Error('فشل تحديث حالة الطلب في قاعدة البيانات');
      }

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
          // Look up this employee-day independently of the currently displayed report.
          const existingResponse = await fetch(`/api/attendance?${new URLSearchParams({ companyId, from: matchedReq.date, to: matchedReq.date, empId: matchedReq.empId })}`);
          if (!existingResponse.ok) throw new Error('تعذر التحقق من سجل البصمة');
          const existingRecord = (await existingResponse.json())[0];

          const formattedCheckIn = matchedReq.checkInTime || '08:00';
          const formattedCheckOut = matchedReq.checkOutTime || '16:00';

          const [inH, inM] = formattedCheckIn.split(':').map(Number);
          const [outH, outM] = formattedCheckOut.split(':').map(Number);

          const inDateObj = new Date(matchedReq.date);
          inDateObj.setHours(inH || 8, inM || 0, 0, 0);

          const outDateObj = new Date(matchedReq.date);
          outDateObj.setHours(outH || 16, outM || 0, 0, 0);

          const checkInTimestamp = isNaN(inDateObj.getTime()) ? Date.now() : inDateObj.getTime();
          const checkOutTimestamp = isNaN(outDateObj.getTime()) ? Date.now() : outDateObj.getTime();

          const attendancePayload: any = {
            empId: matchedReq.empId,
            empName: matchedReq.empName,
            date: matchedReq.date,
            checkIn: formattedCheckIn,
            checkInTs: checkInTimestamp,
            checkOut: formattedCheckOut,
            checkOutTs: checkOutTimestamp,
            note: 'تم البصم بموافقة الإدارة',
            status: 'present',
            source: 'الإدارة',
            companyId: companyId || 'default'
          };

          if (existingRecord) {
            attendancePayload.id = existingRecord.id;
          } else {
            const empObj = employees.find((e) => e.id === matchedReq.empId);
            attendancePayload.dept = empObj?.dept || '';
          }

          const attResponse = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(attendancePayload)
          });

          if (!attResponse.ok) {
            throw new Error('فشل تعديل سجل البصمة المعتمدة');
          }
        }

        onUpdateAppData({ ...appData, schedule: updatedSch });
      }

      alert('تم تحديث حالة الطلب بنجاح.');
      loadRequests();
      loadAttendance();
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

  const handleUpdatePassword = async () => {
    if (!settingsNewPwd) {
      setSettingsPwdMsg('الرجاء إدخال كلمة المرور الجديدة');
      return;
    }
    if (settingsNewPwd !== settingsConfirmPwd) {
      setSettingsPwdMsg('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!await onUpdateSettings({ ...appSettings, password: settingsNewPwd })) return;
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
      
      <AdminSidebar
        appSettings={appSettings}
        admin={admin}
        activeView={activeView}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        hasPermission={hasPermission}
        unreadAlertsCount={getShiftGaps().filter(g => !(appSettings.readAlerts || []).includes(g.id)).length}
        pendingRequestsCount={
          registrationRequests.filter((r) => r.status === 'pending').length +
          adminRequests.filter((r) => r.status === 'pending').length
        }
        companyId={companyId}
        onLogout={onLogout}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur border-b border-sky-100 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 border rounded-lg md:hidden text-slate-500 hover:bg-slate-50"
            >
              <LayoutDashboard size={18} />
            </button>
            <span className="hidden sm:block w-1 h-8 rounded-full bg-gradient-to-b from-amber-400 to-sky-600" />
            <div>
              <h1 className="text-base font-extrabold text-slate-800 tracking-tight">
                {activeView === 'dashboard' && 'لوحة التحكم المباشرة'}
                {activeView === 'schedule' && 'جدول وشيفتات الدوام'}
                {activeView === 'attendance' && 'كشف حضور وانصراف الموظفين'}
                {activeView === 'alerts' && 'تنبيهات غياب التغطية'}
                {activeView === 'employees' && 'إدارة الموظفين والبطاقات'}
                {activeView === 'shifttypes' && 'نوع ومدة الشيفت'}
                {activeView === 'departments' && 'الأقسام والشيفتات'}
                {activeView === 'requests' && 'صندوق طلبات الحضور والمسكن'}
                {activeView === 'settings' && 'إعدادات الشركة والمنصات'}
                {activeView === 'companies' && 'إدارة مساحات عمل الشركات والاشتراكات الشهرية'}
              </h1>
              <p className="hidden sm:block text-[10px] text-slate-400 font-bold mt-0.5">
                {new Date().toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeView === 'schedule' && hasPermission('canEditSchedule') && (
              <button
                onClick={() => {
                  setSmMode('single');
                  setSmEmployee(employees[0]?.id || '');
                  setSmShiftType('S');
                  setSmNote('');
                  setSmDate(getAttTodayStr());
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
            <DashboardView
              employees={employees}
              departments={departments}
              shiftTypes={shiftTypes}
              schedule={schedule}
              appSettings={appSettings}
              selectedDept={selectedDept}
              setSelectedDept={setSelectedDept}
              hasPermission={hasPermission}
              getShiftGaps={getShiftGaps}
              toggleAlertRead={toggleAlertRead}
              DAYS_AR={DAYS_AR}
              onEditCell={(empId, dateStr, shiftType, note) => {
                setSmEmployee(empId);
                setSmDate(dateStr);
                setSmShiftType(shiftType);
                setSmNote(note);
                setSmMode('single');
                setShiftModalOpen(true);
              }}
            />
          )}

          {/* View: Schedule */}
          {activeView === 'schedule' && (
            <ScheduleView
              departments={departments}
              employees={employees}
              shiftTypes={shiftTypes}
              schedule={schedule}
              selectedDept={selectedDept}
              setSelectedDept={setSelectedDept}
              scheduleMonth={scheduleMonth}
              setScheduleMonth={setScheduleMonth}
              hasPermission={hasPermission}
              getDaysInSelectedMonth={getDaysInSelectedMonth}
              getAttTodayStr={getAttTodayStr}
              DAYS_AR={DAYS_AR}
              onEditCell={(empId, dateStr, shiftType, note) => {
                setSmEmployee(empId);
                setSmDate(dateStr);
                setSmShiftType(shiftType);
                setSmNote(note);
                setSmMode('single');
                setShiftModalOpen(true);
              }}
            />
          )}

          {/* View: Attendance Records list */}
          {activeView === 'attendance' && (
            <AttendanceView
              companyId={companyId}
              employees={employees}
              departments={departments}
              attFilterFrom={attFilterFrom}
              attFilterTo={attFilterTo}
              attFilterEmp={attFilterEmp}
              attFilterDept={attFilterDept}
              attFilterStatus={attFilterStatus}
              setAttFilterFrom={setAttFilterFrom}
              setAttFilterTo={setAttFilterTo}
              setAttFilterEmp={setAttFilterEmp}
              setAttFilterDept={setAttFilterDept}
              setAttFilterStatus={setAttFilterStatus}
              loadAttendance={loadAttendance}
              getTodayAttendanceStats={getTodayAttendanceStats}
              requestConfirm={requestConfirm}
              onDeleteRecord={async (id) => {
                try {
                  const response = await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
                  if (!response.ok) throw new Error();
                } catch (err: any) {
                  alert(err.message || 'تعذر الحذف');
                  throw err;
                }
              }}
            />
          )}

          {/* View: Department Coverage Alerts */}
          {activeView === 'alerts' && (
            <AlertsView
              appSettings={appSettings}
              scheduleMonth={scheduleMonth}
              getShiftGaps={getShiftGaps}
              toggleAlertRead={toggleAlertRead}
              dismissAlert={dismissAlert}
              dismissAllAlerts={dismissAllAlerts}
              markAllAlertsAsRead={markAllAlertsAsRead}
              onUpdateSettings={onUpdateSettings}
              requestConfirm={requestConfirm}
            />
          )}

          {/* View: Employees CRUD */}
          {activeView === 'employees' && (
            <EmployeesView
              appSettings={appSettings}
              employees={employees}
              departments={departments}
              onAddNew={() => {
                setEditingEmpId(null);
                setEmName('');
                setEmDept(departments[0]?.id || '');
                setEmUsername('');
                setEmPhone('');
                setEmColor('#01696f');
                setEmPassword('');
                setEmRestrictLocations(false);
                setEmLocationIds([]);
                setEmpModalOpen(true);
              }}
              onEdit={(emp) => {
                setEditingEmpId(emp.id);
                setEmName(emp.name);
                setEmDept(emp.dept);
                setEmUsername(emp.username || '');
                setEmPhone(emp.phone || '');
                setEmColor(emp.color || '#01696f');
                setEmPassword(emp.password || '');
                setEmRestrictLocations(!!emp.restrictAttendanceLocations);
                setEmLocationIds(Array.isArray(emp.allowedAttendanceLocationIds) ? emp.allowedAttendanceLocationIds : []);
                setEmpModalOpen(true);
              }}
              onDelete={handleDeleteEmployee}
              onOpenWhatsApp={handleOpenWaModal}
            />
          )}

          {/* View: Departments CRUD */}
          {activeView === 'departments' && (
            <DepartmentsView
              departments={departments}
              employees={employees}
              onAddNew={() => {
                setEditingDeptId(null);
                setDmName('');
                setDmMorning(true);
                setDmEvening(true);
                setDmFriday('off');
                setDeptModalOpen(true);
              }}
              onEdit={(dept) => {
                setEditingDeptId(dept.id);
                setDmName(dept.name);
                setDmMorning(dept.needsMorning);
                setDmEvening(dept.needsEvening);
                setDmFriday(dept.friday || 'off');
                setDeptModalOpen(true);
              }}
              onDelete={(deptId) => {
                requestConfirm('هل تريد حذف هذا القسم بالكامل؟', () => {
                  const updated = departments.filter((d) => d.id !== deptId);
                  onUpdateAppData({ ...appData, departments: updated });
                });
              }}
            />
          )}

          {/* View: Received Requests approval */}
          {activeView === 'requests' && (
            <RequestsView adminRequests={adminRequests} requestsLoading={requestsLoading} onReview={handleReviewRequest} />
          )}

          {/* View: Shift Types Management */}
          {activeView === 'shifttypes' && (
            <ShiftTypesView
              shiftTypes={shiftTypes}
              onAddNew={() => {
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
              onEdit={(st) => {
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
              onDelete={handleDeleteShiftType}
            />
          )}

          {/* View: General Settings */}
          {activeView === 'settings' && (
            <SettingsView
              admin={admin}
              appSettings={appSettings}
              onUpdateSettings={onUpdateSettings}
              employees={employees}
              departments={departments}
              appData={appData}
              companyId={companyId}
              requestConfirm={requestConfirm}
              companySettingsName={companySettingsName}
              setCompanySettingsName={setCompanySettingsName}
              handleLogoUpload={handleLogoUpload}
              handleDetectGPS={handleDetectGPS}
              geoSettingStatus={geoSettingStatus}
              settingsNewPwd={settingsNewPwd}
              setSettingsNewPwd={setSettingsNewPwd}
              settingsConfirmPwd={settingsConfirmPwd}
              setSettingsConfirmPwd={setSettingsConfirmPwd}
              settingsPwdMsg={settingsPwdMsg}
              handleUpdatePassword={handleUpdatePassword}
              subAdmins={subAdmins}
              subAdminsLoading={subAdminsLoading}
              onAddSubAdmin={() => {
                setEditingAdmId(null);
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
              onEditSubAdmin={(item) => {
                setEditingAdmId(item.id);
                setAdmName(item.name || '');
                setAdmUsername(item.username || '');
                setAdmEmail(item.email || '');
                setAdmPwd('');
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
              onDeleteSubAdmin={(id) =>
                new Promise<void>((resolve) => {
                  requestConfirm('هل تريد إلغاء صلاحية هذا المسؤول وحذفه؟', async () => {
                    try {
                      const response = await fetch(`/api/admins/${id}`, { method: 'DELETE' });
                      if (!response.ok) throw new Error();
                      loadSubAdmins();
                    } catch (err) {
                      alert('فشل الإجراء');
                    }
                    resolve();
                  });
                })
              }
              registrationRequests={registrationRequests}
              onApproveRegistration={(it) =>
                new Promise<void>((resolve) => {
                  requestConfirm('موافقة وقبول التسجيل؟', async () => {
                    try {
                      const response = await fetch(`/api/registration-requests/${it.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'approved' })
                      });
                      if (!response.ok) throw new Error();

                      if (it.type === 'employee') {
                        const updated = [...employees, {
                          id: 'e' + Date.now(),
                          name: it.name,
                          dept: departments[0]?.id || '',
                          phone: it.phone,
                          username: it.username || it.name.replace(/\s+/g, '_').toLowerCase(),
                          password: it.password || '123456',
                          color: '#01696f'
                        }];
                        onUpdateAppData({ ...appData, employees: updated });
                      } else if (it.type === 'admin') {
                        const adminData = {
                          name: it.name,
                          username: (it.username || it.name.replace(/\s+/g, '_')).toLowerCase(),
                          email: `${(it.username || it.name.replace(/\s+/g, '_')).toLowerCase()}@company.com`,
                          password: it.password,
                          role: 'admin',
                          companyId: companyId || 'default',
                          permissions: {
                            canEditSchedule: true,
                            canManageEmployees: true,
                            canManageDepts: true,
                            canApproveRequests: true,
                            canViewReports: true,
                            canManageSettings: true,
                            canPrint: true
                          }
                        };
                        const resAdmin = await fetch('/api/admins', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(adminData)
                        });
                        if (!resAdmin.ok) throw new Error();
                      }
                      alert('تم اعتماد وتسجيل الحساب بنجاح.');
                      loadRequests();
                    } catch (e) {
                      alert('فشل الإجراء');
                    }
                    resolve();
                  });
                })
              }
              onRejectRegistration={(it) =>
                new Promise<void>((resolve) => {
                  requestConfirm('رفض طلب التسجيل هذا؟', async () => {
                    try {
                      const response = await fetch(`/api/registration-requests/${it.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'rejected' })
                      });
                      if (!response.ok) throw new Error();
                      alert('تم رفض الطلب.');
                      loadRequests();
                    } catch (e) {
                      alert('فشل الإجراء');
                    }
                    resolve();
                  });
                })
              }
            />
          )}

          {/* View: Companies & Subscriptions Management */}
          {/* View: Companies & Subscriptions Management */}
          {activeView === 'companies' && admin.role === 'superadmin' && companyId === 'default' && (
            <CompaniesView
              companiesList={companiesList}
              onAddNew={() => {
                setEditingCompId(null);
                setCompName('');
                setCompSlug('');
                setCompLogoUrl('');
                setCompMonthlyFee('150');
                setCompAdminUsername('');
                setCompAdminPassword('');
                setCompMonths('12');
                setCompanyModalOpen(true);
              }}
              onExtendSubscription={handleExtendCompanySubscription}
              onToggleStatus={handleToggleCompanyStatus}
              onDeleteCompany={handleDeleteCompanySpace}
            />
          )}


        </main>

        {/* Design and Development Footer credit */}
        <footer className="mb-6 mt-2 text-center text-[11px] text-slate-400 font-sans tracking-wide">
          التصميم والتطوير عن طريق <strong className="text-slate-500 font-extrabold hover:text-sky-500 transition-colors">SHADY NASSEF</strong> &nbsp;•&nbsp; جميع الحقوق محفوظة © 2026
        </footer>
      </div>

      {/* Company Registration Modal */}
      {companyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl border border-sky-100 max-h-[85vh] overflow-y-auto" dir="rtl">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 pb-2 border-b text-right">
              🏢 تسجيل شركة جديدة وتوليد مساحة عمل باشتراك شهري
            </h3>
            
            <div className="flex flex-col gap-4 text-right">
              {/* Company Name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">اسم الشركة / المؤسسة</label>
                <input
                  type="text"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="مثال: شركة النجوم للتجارة"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-bold"
                />
              </div>

              {/* Company Slug / Unique Link */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">رمز مساحة العمل الفريد (للرابط)</label>
                <input
                  type="text"
                  value={compSlug}
                  onChange={(e) => setCompSlug(e.target.value)}
                  placeholder="مثال: stars (حروف إنجليزية صغيرة فقط)"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400">سيكون الرابط ومساحة الدخول مخصصة لهذه الشركة عبر تحديدها من القائمة.</span>
              </div>

              {/* Logo Url */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">رابط صورة شعار الشركة (اختياري)</label>
                <input
                  type="text"
                  value={compLogoUrl}
                  onChange={(e) => setCompLogoUrl(e.target.value)}
                  placeholder="مثال: https://example.com/logo.png"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              {/* Monthly Subscription Fee */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">قيمة الاشتراك الشهري (بالريال)</label>
                <input
                  type="number"
                  value={compMonthlyFee}
                  onChange={(e) => setCompMonthlyFee(e.target.value)}
                  placeholder="مثال: 150"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-bold"
                />
              </div>

              {/* Company Code */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">رمز التحقق للشركة (Company Code)</label>
                <input
                  type="text"
                  value={compCompanyCode}
                  onChange={(e) => setCompCompanyCode(e.target.value)}
                  placeholder="مثال: 1234 (الرمز الافتراضي: 0)"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400">هذا الرمز سيطلب من المسؤولين عند تسجيل الدخول لتأمين حسابات الشركة.</span>
              </div>

              {/* Subscription Duration */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-600">مدة الاشتراك المبدئية (بالأشهر)</label>
                <select
                  value={compMonths}
                  onChange={(e) => setCompMonths(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-sky-500 font-bold"
                >
                  <option value="1">شهر واحد</option>
                  <option value="3">3 أشهر</option>
                  <option value="6">6 أشهر</option>
                  <option value="12">سنة كاملة (12 شهر)</option>
                  <option value="24">سنتين (24 شهر)</option>
                </select>
              </div>

              <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 flex flex-col gap-2 mt-1">
                <span className="text-[10px] font-bold text-sky-800">🔑 بيانات الدخول لمدير الشركة المشترك (Master Admin):</span>
                
                {/* Admin Username */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-600">اسم المستخدم للمدير</label>
                  <input
                    type="text"
                    value={compAdminUsername}
                    onChange={(e) => setCompAdminUsername(e.target.value)}
                    placeholder="مثال: owner"
                    className="w-full px-3 py-1.5 text-xs bg-white border rounded focus:outline-none font-mono font-bold"
                  />
                </div>

                {/* Admin Password */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-600">رمز الدخول السري للمدير</label>
                  <input
                    type="text"
                    value={compAdminPassword}
                    onChange={(e) => setCompAdminPassword(e.target.value)}
                    placeholder="مثال: 1234"
                    className="w-full px-3 py-1.5 text-xs bg-white border rounded focus:outline-none font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 justify-end mt-6 pt-4 border-t text-xs">
              <button
                onClick={() => setCompanyModalOpen(false)}
                className="px-4 py-2 hover:bg-slate-100 border rounded-lg text-slate-500 font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveCompany}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold shadow transition-all"
              >
                إنشاء وتفعيل مساحة العمل ✨
              </button>
            </div>
          </div>
        </div>
      )}

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
                  placeholder={editingAdmId ? 'اتركه فارغًا للإبقاء على الرمز الحالي' : 'رمز الدخول الفرعي'}
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
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto p-6 bg-white rounded-2xl shadow-xl border border-sky-100">
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

              <fieldset className="border rounded-xl p-3 flex flex-col gap-2">
                <legend className="text-xs font-bold">مواقع البصمة المسموحة</legend>
                <label className="text-xs flex gap-2 items-center">
                  <input type="checkbox" checked={emRestrictLocations} onChange={e => setEmRestrictLocations(e.target.checked)} />
                  تحديد مواقع لهذا الموظف
                </label>
                {!emRestrictLocations ? <p className="text-xs text-slate-500">كل مواقع الشركة المفعّلة مسموحة.</p> : <>
                  {employeeLocationOptions.map(site => <label key={site.id} className="text-xs flex gap-2 items-center">
                    <input type="checkbox" checked={emLocationIds.includes(site.id)} onChange={e => setEmLocationIds(ids => e.target.checked ? [...ids, site.id] : ids.filter(id => id !== site.id))} />
                    {site.name}
                  </label>)}
                  {!employeeLocationOptions.length && <p className="text-xs text-rose-600">أضف موقعًا مفعّلًا من الإعدادات أولًا.</p>}
                  {emLocationIds.some(id => !employeeLocationOptions.some(site => site.id === id)) && <p className="text-xs text-amber-700">بعض المواقع المختارة محذوفة أو معطّلة ولن تسمح بالبصمة.</p>}
                </>}
              </fieldset>
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
