import { getEmployeeLocations } from "./attendanceLocations";
import { autoPeriodWindow } from "./autoPunch";
import { employeeScheduleContent } from "./schedulePublication";
/** Only inline raster images; no external tracking URLs or active SVG content. */
export const mobileIdentityImage = (value: unknown, max = 1500000): string =>
  typeof value === 'string' && value.length <= max && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
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
      photoDataUrl: mobileIdentityImage(employee.photoDataUrl, 420000),
      departmentName:
        data.departments?.find((d: any) => d.id === employee.dept)?.name || "",
    },
    companyName: data.settings?.companyName || "وفر دوام",
    companyLogo: mobileIdentityImage(data.settings?.logoDataUrl),
    attendanceLocations: getEmployeeLocations(data.settings, employee).map(({ id, name, lat, lng, radius }) => ({ id, name, lat, lng, radius })),
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

/** Include the previous schedule day even at month/year boundaries for overnight periods. */
export function mobileScheduleRange(now = Date.now()) {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const noon = Date.parse(today + "T12:00:00Z");
  const yesterday = new Date(noon - 86400000).toISOString().slice(0, 10);
  return { today, yesterday, from: yesterday, to: new Date(noon + 31 * 86400000).toISOString().slice(0, 10) };
}
export function mobilePunchPlans(schedule: { date: string; shiftType: string; shift: any }[]) {
  return schedule.flatMap(entry => {
    if (!entry.shift || ["OFF", "A"].includes(entry.shiftType)) return [];
    return [1, 2].flatMap(period => {
      const window = autoPeriodWindow(entry.date, entry.shift, period === 2);
      return window ? [{ date: entry.date, period, start: window.start, end: window.end }] : [];
    });
  });
}
