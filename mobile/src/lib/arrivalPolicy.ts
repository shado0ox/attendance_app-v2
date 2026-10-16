export type ArrivalPlan = { key: string; start: number; end: number; checkedIn: boolean };
export type ArrivalState = { scope: string; regionSignature?: string; validUntil: number; regionIds: string[]; plans: ArrivalPlan[]; delivered: string[] };
/** Region events are hints to remind the employee, never attendance evidence. */
export function arrivalReminder(state: ArrivalState | null, regionId: string, now: number): string | null {
  if (!state || now >= state.validUntil || !state.regionIds.includes(regionId)) return null;
  const plan = state.plans.find(p => !p.checkedIn && now >= p.start && now < p.start + 3600000 && !state.delivered.includes(p.key));
  return plan?.key || null;
}
