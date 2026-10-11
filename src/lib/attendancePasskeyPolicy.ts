export type AttendancePasskeyPolicy = { mode: 'off' | 'all' | 'selected'; employeeIds: string[]; approved: Record<string, Record<string, string>> };
export const emptyPasskeyPolicy = (): AttendancePasskeyPolicy => ({ mode: 'off', employeeIds: [], approved: {} });
export const attendancePasskeyRequired = (policy: AttendancePasskeyPolicy, id: string) => policy.mode === 'all' || policy.mode === 'selected' && policy.employeeIds.includes(id);
export function parsePasskeyPolicy(value: any, employees: any[]) {
  if (!['off', 'all', 'selected'].includes(value?.mode) || !Array.isArray(value.employeeIds) || value.employeeIds.some((id: any) => typeof id !== 'string' || !employees.some(e => String(e.id) === id))) throw new Error('اختر وضع التحقق وموظفين من الشركة فقط');
  return { mode: value.mode as AttendancePasskeyPolicy['mode'], employeeIds: [...new Set<string>(value.employeeIds)] };
}
