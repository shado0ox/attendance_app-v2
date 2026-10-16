import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { ownsDay, type AdminAccess } from '../lib/adminAccess';

/** Only an explicit web-managed account link delegates approvals; never infer by name/email. */
export async function employeeApprovalAccess(companyId: string, employeeId: string, executor: any = db, lock = false): Promise<AdminAccess | null> {
  let query = executor.select({ access: schema.systemData.value }).from(schema.systemData)
    .innerJoin(schema.admins, eq(schema.systemData.key, sql`'adminAccess:' || ${companyId} || ':' || ${schema.admins.id}::text`))
    .where(and(eq(schema.admins.companyId, companyId), sql`${schema.systemData.value}->>'employeeId' = ${employeeId}`));
  if (lock) query = query.for('share');
  const rows = await query;
  // Ambiguous legacy links fail closed. No fallback to full administrator access.
  if (rows.length !== 1) return null;
  const value = rows[0].access as AdminAccess;
  if (value?.permissions?.canApproveRequests !== true || (value.departmentIds !== null && (!Array.isArray(value.departmentIds) || !value.departmentIds.length))) return null;
  return { permissions: { canApproveRequests: true }, departmentIds: value.departmentIds };
}
export function canReviewEmployeeRequest(access: AdminAccess | null, data: any, actorId: string, row: any) {
  return !!access && String(row.empId) !== actorId && String(row.swapWithEmpId || '') !== actorId && ownsDay(access, data, row);
}
export function approvalRequestView(row: any) {
  return { id: row.id, empName: row.empName, date: row.date, type: row.type, status: row.status, notes: row.notes,
    targetShift: row.targetShift, swapWithEmpName: row.swapWithEmpName,
    checkInTime: row.checkInTime, checkOutTime: row.checkOutTime,
    period: row.details?.period || 1, checkInNextDay: row.details?.checkInNextDay === true, checkOutNextDay: row.details?.checkOutNextDay === true };
}
