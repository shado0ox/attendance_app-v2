import { validAttendanceDate } from './attendanceMonths';
import { employeeAtDate } from './employeeLifecycle';
export const permissionNames = ['canEditSchedule', 'canManageEmployees', 'canManageDepts', 'canApproveRequests', 'canViewReports', 'canManageSettings', 'canPrint'] as const;
export type AdminAccess = { permissions: Record<string, boolean>; departmentIds: string[] | null };
export const fullAdminAccess = (): AdminAccess => ({ permissions: Object.fromEntries(permissionNames.map(p => [p, true])), departmentIds: null });
export function parseAdminAccess(input: any, departments: any[]): AdminAccess {
  if (!input?.permissions || typeof input.permissions !== 'object' || Array.isArray(input.permissions) || permissionNames.some(p => typeof input.permissions[p] !== 'boolean')) throw new Error('حدد صلاحيات المسؤول كاملة');
  const ids = input.departmentIds;
  if (ids !== null && (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !departments.some(d => d.id === id)))) throw new Error('اختر قسمًا واحدًا على الأقل من الأقسام المسجلة');
  const permissions = Object.fromEntries(permissionNames.map(p => [p, input.permissions[p] === true]));
  if (ids !== null && ['canManageEmployees', 'canManageDepts', 'canManageSettings'].some(p => permissions[p])) throw new Error('مدير القسم يدير الجدول والتقارير والطلبات؛ إدارة الحسابات والموظفين والإعدادات لإدارة الشركة');
  return { permissions, departmentIds: ids === null ? null : [...new Set<string>(ids)] };
}
export const ownsEmployee = (access: AdminAccess, data: any, id: unknown) => access.departmentIds === null || !!data?.employees?.some((e: any) => String(e.id) === String(id) && access.departmentIds!.includes(e.dept));
export function ownsDay(access: AdminAccess, data: any, row: any) {
  if (access.departmentIds === null) return true;
  if (!ownsEmployee(access, data, row.empId)) return false;
  const employee = data.employees.find((e: any) => String(e.id) === String(row.empId));
  const dept = row.dept || employeeAtDate(employee, row.date)?.dept;
  return access.departmentIds.includes(dept) && access.departmentIds.includes(employeeAtDate(employee, row.date)?.dept) && (!row.swapWithEmpId || ownsDay(access, data, { empId: row.swapWithEmpId, date: row.date }));
}
export function scopedMainData(data: any, access: AdminAccess) {
  if (access.departmentIds === null) return { ...data,
    employees: access.permissions.canManageEmployees ? data.employees : (data.employees || []).map((e: any) => ({ id: e.id, name: e.name, dept: e.dept, color: e.color, status: e.status, hasPassword: !!e.password })),
    settings: access.permissions.canManageSettings ? data.settings : { companyName: data.settings?.companyName, logoDataUrl: data.settings?.logoDataUrl, attendanceAnalysis: data.settings?.attendanceAnalysis } };
  const employees = (data.employees || []).filter((e: any) => ownsEmployee(access, data, e.id));
  const filterSchedule = (schedule: any) => Object.fromEntries(Object.entries(schedule || {}).map(([date, entries]) => [date, Object.fromEntries(Object.entries(entries as any).filter(([empId]) => ownsDay(access, data, { empId, date })))]));
  return { departments: (data.departments || []).filter((d: any) => access.departmentIds!.includes(d.id)),
    employees: employees.map((e: any) => ({ id: e.id, name: e.name, dept: e.dept, color: e.color, status: e.status, hasPassword: !!e.password })),
    shiftTypes: data.shiftTypes || [], schedule: filterSchedule(data.schedule),
    settings: { companyName: data.settings?.companyName, logoDataUrl: data.settings?.logoDataUrl, attendanceAnalysis: data.settings?.attendanceAnalysis },
    _version: data._version,
    _schedulePublication: data._schedulePublication ? { ...data._schedulePublication, schedule: filterSchedule(data._schedulePublication.schedule) } : undefined };
}
/** A department save contains only visible rows. Merge schedules and preserve the full company blob. */
export function mergeAdminData(current: any, incoming: any, access: AdminAccess) {
  const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
  if (access.departmentIds !== null) {
    if (!access.permissions.canEditSchedule) throw new Error('ليس لديك صلاحية تعديل الجدول');
    const view = scopedMainData(current, access);
    for (const field of ['employees', 'departments', 'shiftTypes', 'settings']) if (!equal(incoming[field], view[field])) throw new Error('هذا الحساب يمكنه تعديل جدول أقسامه فقط');
    const schedule = structuredClone(current.schedule || {});
    for (const [date, entries] of Object.entries(incoming.schedule || {})) {
      if (!validAttendanceDate(date) || !entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('تاريخ أو بيانات الجدول غير صحيحة');
      for (const id of Object.keys(entries as any)) if (!ownsDay(access, current, { empId: id, date })) throw new Error('الجدول يحتوي على موظف أو تاريخ خارج أقسامك');
    }
    for (const date of new Set([...Object.keys(schedule), ...Object.keys(incoming.schedule || {})])) {
      const entries = schedule[date] || {};
      for (const id of Object.keys(entries)) if (ownsDay(access, current, { empId: id, date })) delete entries[id];
      Object.assign(entries, incoming.schedule?.[date] || {}); schedule[date] = entries;
    }
    return { ...current, schedule };
  }
  const view = scopedMainData(current, access);
  const next = { ...current };
  for (const [field, permission] of [['employees','canManageEmployees'],['departments','canManageDepts'],['shiftTypes','canManageDepts'],['schedule','canEditSchedule'],['settings','canManageSettings']]) {
    if (!access.permissions[permission] && !equal(view[field], incoming[field])) throw new Error('ليس لديك صلاحية تعديل ' + field);
    if (access.permissions[permission]) next[field] = incoming[field];
  }
  return next;
}
export function allowedAdminRoute(access: AdminAccess, method: string, route: string) {
  const read = method === 'GET';
  if (route === '/api/system-health') return read && access.departmentIds === null && access.permissions.canManageSettings;
  if (route === '/api/notifications' || route === '/api/notifications/read') return (read || (route.endsWith('/read') && method === 'POST')) && ['canApproveRequests', 'canViewReports', 'canEditSchedule', 'canPrint', 'canManageDepts'].some(p => access.permissions[p]);
  if (route === '/api/main-data') return read || access.permissions.canEditSchedule || access.permissions.canManageEmployees || access.permissions.canManageDepts || access.permissions.canManageSettings;
  if (route === '/api/schedule-publication') return access.departmentIds === null && access.permissions.canEditSchedule;
  if (route === '/api/requests' || /^\/api\/requests\/\d+$/.test(route)) return read ? access.permissions.canApproveRequests || access.permissions.canViewReports : method === 'PUT' && access.permissions.canApproveRequests;
  if (['/api/attendance-report','/api/attendance-exceptions'].includes(route)) return read && access.permissions.canViewReports;
  if (route === '/api/attendance-months') return access.departmentIds === null && access.permissions.canViewReports;
  if (route === '/api/attendance' || /^\/api\/attendance\/\d+$/.test(route)) return access.permissions.canViewReports && (read || access.departmentIds === null);
  if (/^\/api\/employees\/[^/]+\/profile$/.test(route) || route === '/api/employee-audit') return read && (access.permissions.canViewReports || access.permissions.canManageEmployees);
  if (/^\/api\/employees\/[^/]+\/welcome-email$/.test(route)) return access.departmentIds === null && access.permissions.canManageEmployees;
  if (route.startsWith('/api/registration-requests')) return access.departmentIds === null && access.permissions.canManageEmployees;
  if (route.startsWith('/api/admins') || route === '/api/audit-log') return access.departmentIds === null && access.permissions.canManageSettings;
  return false;
}
