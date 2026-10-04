import { validEmployeeEmail } from './employeeDirectory';
export const normalizedEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function employeeEmailVerified(employee: any) {
  return validEmployeeEmail(employee?.email) && normalizedEmail(employee.email) === normalizedEmail(employee.emailVerifiedAddress) && typeof employee.emailVerifiedAt === 'string' && Number.isFinite(Date.parse(employee.emailVerifiedAt));
}
/** Verification is server owned and bound to the exact normalized address. */
export function preserveEmailVerification(before: any[], incoming: any[]) {
  const previous = new Map(before.map(e => [String(e.id), e]));
  return incoming.map(employee => {
    const { emailVerifiedAt: ignoredTime, emailVerifiedAddress: ignoredAddress, ...next } = employee;
    const old = previous.get(String(employee.id));
    return employeeEmailVerified(old) && normalizedEmail(old.email) === normalizedEmail(next.email)
      ? { ...next, emailVerifiedAt: old.emailVerifiedAt, emailVerifiedAddress: old.emailVerifiedAddress } : next;
  });
}
