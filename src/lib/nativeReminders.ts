import {
  dueAttendanceReminders,
  REMINDER_DURATION,
  reminderSlot,
} from "./attendanceReminders";
import { effectiveScheduleData } from "./schedulePublication";
import { autoPeriodWindow } from "./autoPunch";
import { employeeAtDate, isActiveEmployee } from "./employeeLifecycle";
export const validNativeToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{20,200}\]$/.test(value);
export function dueNativeReminders(
  data: any,
  employeeId: string,
  records: any[],
  leaves: any[],
  now: number,
) {
  const attendance = dueAttendanceReminders(
    data,
    employeeId,
    records,
    leaves,
    now,
  ).map((item) => ({
    ...item,
    kind: "attendance" as const,
    key: "in:" + item.key,
  }));
  const departure: (Omit<(typeof attendance)[number], "kind"> & {
    kind: "departure";
  })[] = [];
  const employee = data?.employees?.find(
    (e: any) => String(e.id) === employeeId,
  );
  if (!isActiveEmployee(employee)) return attendance;
  const published = effectiveScheduleData(data);
  // A shift ending near midnight may belong to either of the two previous dates.
  for (const offset of [-2, -1, 0]) {
    const date = new Date(now + 3 * 3600000 + offset * 86400000)
      .toISOString()
      .slice(0, 10);
    if (!isActiveEmployee(employeeAtDate(employee, date))) continue;
    const assignment = published.schedule?.[date]?.[employeeId];
    if (!assignment || ["OFF", "A"].includes(assignment.shiftType)) continue;
    const shift = published.shiftTypes?.find(
      (s: any) => s.id === assignment.shiftType,
    );
    for (const period of [1, 2]) {
      const window = shift && autoPeriodWindow(date, shift, period === 2);
      if (!window) continue;
      const slot = reminderSlot(
        window.end,
        window.end + REMINDER_DURATION,
        now,
      );
      const own = records.filter(
        (r) => String(r.empId) === employeeId && r.date === date,
      );
      if (
        slot === null ||
        !own.some((r) => r[period === 1 ? "checkIn" : "checkIn2"]) ||
        own.some((r) => r[period === 1 ? "checkOut" : "checkOut2"])
      )
        continue;
      departure.push({
        key: `out:${date}:${period}:${window.end}:${slot}`,
        kind: "departure",
        date,
        period,
        start: window.end,
        expiresAt: window.end + REMINDER_DURATION,
        shiftName: shift.name || "الدوام",
      });
    }
  }
  return [...attendance, ...departure];
}
