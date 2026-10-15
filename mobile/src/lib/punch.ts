import type { Attendance } from "./types";
export type PunchField = "checkIn" | "checkOut" | "checkIn2" | "checkOut2";
export function nextPunch(
  records: Attendance[],
  date: string,
  double: boolean,
  now: number,
): { field: PunchField; record?: Attendance } | null {
  const active = records.find(
    (record) =>
      record.checkIn &&
      (!record.checkOut || (record.checkIn2 && !record.checkOut2)),
  );
  // Never create another day's check-in while an earlier period remains open.
  if (active) {
    const start = Number(active.checkInTs);
    if (!Number.isFinite(start) || now - start > 86400000 || start > now)
      return null;
    return {
      field: active.checkIn2 ? "checkOut2" : "checkOut",
      record: active,
    };
  }
  const record = records.find((record) => record.date === date);
  if (!record) return { field: "checkIn" };
  if (double && record.checkOut && !record.checkIn2)
    return { field: "checkIn2", record };
  return null;
}
export const punchLabel: Record<PunchField, string> = {
  checkIn: "تسجيل الحضور",
  checkOut: "تسجيل الانصراف",
  checkIn2: "حضور الفترة الثانية",
  checkOut2: "انصراف الفترة الثانية",
};
