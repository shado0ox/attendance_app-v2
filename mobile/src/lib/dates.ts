export const today = (now = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const displayDate = (date: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Riyadh",
    calendar: "gregory",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00Z"));
export const clock = (value: number) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
export function shiftMonth(month: string, delta: number) {
  const date = new Date(month + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
export const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
