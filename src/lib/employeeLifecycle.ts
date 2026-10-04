export type EmployeeStatus = 'active' | 'suspended' | 'archived';
export const employeeStatus = (employee: any): EmployeeStatus => employee?.status === 'suspended' || employee?.status === 'archived' ? employee.status : 'active';
export const isActiveEmployee = (employee: any) => !!employee && employeeStatus(employee) === 'active';
export const statusLabels = { active: 'نشط', suspended: 'موقوف', archived: 'مؤرشف' };
const fields = ['name', 'dept', 'phone', 'email', 'username', 'status', 'restrictAttendanceLocations', 'allowedAttendanceLocationIds', 'color', 'statusReason'];
export function employeeChanges(before: any[], after: any[]) {
  const previous = new Map(before.map(e => [String(e.id), e]));
  return after.flatMap(e => {
    const old = previous.get(String(e.id));
    const changes: Record<string, { before: any; after: any }> = {};
    for (const field of fields) {
      const a = field === 'status' ? employeeStatus(old) : old?.[field] ?? null;
      const b = field === 'status' ? employeeStatus(e) : e[field] ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) changes[field] = { before: a, after: b };
    }
    if (old && old.password !== e.password) changes.password = { before: 'محجوب', after: 'تم تغيير رمز الدخول' };
    return !old || Object.keys(changes).length ? [{ id: String(e.id), name: e.name, action: !old ? 'employee.create' : changes.status ? 'employee.status' : 'employee.update', changes }] : [];
  });
}
