export class CorrectionValidationError extends Error {}
import { validAttendanceDate } from './attendanceMonths';
export const validCorrectionTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const timestamp = (date: string, time: string, nextDay: boolean) => new Date(`${date}T${time}:00+03:00`).getTime() + (nextDay ? 86400000 : 0);
export function correctionValues(request: any, original?: any) {
  if (!validAttendanceDate(request.date) || (!request.checkInTime && !request.checkOutTime)) throw new CorrectionValidationError('حدد تاريخًا صحيحًا ووقت بصمة واحدة على الأقل');
  const period = request.details?.period || 1;
  if (![1, 2].includes(period)) throw new CorrectionValidationError('الفترة غير صحيحة');
  if (period === 2 && (!original?.checkIn || !original?.checkOut)) throw new CorrectionValidationError('أكمل حضور وانصراف الفترة الأولى قبل تصحيح الثانية');
  const suffix = period === 2 ? '2' : '';
  const values: any = {};
  for (const kind of ['checkIn', 'checkOut']) {
    const time = request[kind + 'Time'];
    if (!time) continue;
    if (!validCorrectionTime(time)) throw new CorrectionValidationError('وقت البصمة غير صحيح');
    const nextDay = request.details?.[kind + 'NextDay'] === true;
    values[kind + suffix] = time;
    values[kind + 'Ts' + suffix] = String(timestamp(request.date, time, nextDay));
    values[kind + 'Location' + suffix] = 'تصحيح معتمد — دون إثبات موقع';
    if (kind === 'checkIn') { values['checkInLat' + suffix] = null; values['checkInLng' + suffix] = null; }
  }
  const knownTime = (kind: string) => values[kind + 'Ts' + suffix] ? Number(values[kind + 'Ts' + suffix]) : original?.[kind + suffix] ? Number(original[kind + 'Ts' + suffix]) || timestamp(request.date, original[kind + suffix], false) : null;
  const start = knownTime('checkIn'), end = knownTime('checkOut');
  if ((start != null && !Number.isFinite(start)) || (end != null && !Number.isFinite(end))) throw new CorrectionValidationError('البصمة الأصلية غير صالحة؛ اطلب تصحيح الطرفين');
  if (period === 1 && end != null && original?.checkInTs2 && end > Number(original.checkInTs2)) throw new CorrectionValidationError('نهاية الفترة الأولى يجب أن تسبق بداية الثانية');
  if (start != null && end != null && end <= start) throw new CorrectionValidationError('الانصراف يجب أن يكون بعد الحضور؛ حدد اليوم التالي للدوام الليلي');
  if (start != null && end != null && end - start > 24 * 3600000) throw new CorrectionValidationError('مدة الفترة تتجاوز 24 ساعة؛ راجع اليوم والوقت');
  if (period === 2 && start != null && original?.checkOutTs && start < Number(original.checkOutTs)) throw new CorrectionValidationError('الفترة الثانية تبدأ بعد نهاية الفترة الأولى');
  return values;
}
