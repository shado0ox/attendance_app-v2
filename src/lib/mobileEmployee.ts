import { employeeScheduleContent } from "./schedulePublication";
/** A deliberately small projection: no colleague directory, credentials or company settings. */
export function mobileEmployeeData(
  data: any,
  employeeId: string,
  from: string,
  to: string,
) {
  const employee = data?.employees?.find(
    (entry: any) => String(entry.id) === employeeId,
  );
  if (!employee) return null;
  const published = employeeScheduleContent(data, employeeId);
  const schedule = Object.entries(published.schedule)
    .filter(([date]) => date >= from && date <= to)
    .map(([date, assignment]: [string, any]) => ({
      date,
      shiftType: assignment.shiftType,
      note: assignment.note || "",
      shift:
        published.shiftTypes.find(
          (shift: any) => shift.id === assignment.shiftType,
        ) || null,
    }));
  return {
    employee: {
      id: employeeId,
      name: employee.name,
      displayName: employee.displayName || employee.name,
      departmentName:
        data.departments?.find((d: any) => d.id === employee.dept)?.name || "",
    },
    companyName: data.settings?.companyName || "وفر دوام",
    schedule: schedule.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
/** Native Android origins are derived from the final signing certificate, never wildcards. */
export function webauthnExpectedOrigins(
  webOrigin: string,
  androidOrigins = "",
): string[] {
  const origins = androidOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    origins.length > 10 ||
    origins.some(
      (value) => !/^android:apk-key-hash:[A-Za-z0-9_-]{43}$/.test(value),
    )
  )
    throw new Error(
      "WEBAUTHN_ANDROID_ORIGINS must contain exact Android signing-certificate origins",
    );
  return [...new Set([webOrigin, ...origins])];
}
