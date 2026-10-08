import { PNG } from 'pngjs';

const MAX_SIGNATURE_LENGTH = 500000;
const MAX_REASON_LENGTH = 2000;
const REQUEST_TYPES = ['temporary_exit', 'early_exit', 'late_arrival', 'absence'] as const;
const ABSENCE_TYPES = ['annual', 'sick', 'other'] as const;

type NormalizedForm = {
  date: string;
  requestType: typeof REQUEST_TYPES[number];
  absenceType: string;
  exitTime: string;
  expectedReturnTime: string;
  actualAttendanceTime: string;
  absenceFrom: string;
  absenceTo: string;
  reason: string;
  employeeCommitment: true;
};

export const validateDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const validateTime = (value: unknown) =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validateSignature(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > MAX_SIGNATURE_LENGTH ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const bytes = Buffer.from(value.split(',')[1], 'base64');
    // Bound dimensions before decoding untrusted compressed image data.
    if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 2048 || height > 2048 || width * height > 1048576) return false;
    const png = PNG.sync.read(bytes, { checkCRC: true });
    let ink = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (png.data[i + 3] > 32 && Math.min(png.data[i], png.data[i + 1], png.data[i + 2]) < 240 && ++ink >= 8) return true;
    }
    return false;
  } catch { return false; }
}

const stringField = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max ? value.trim() : '';

export function normalizeForm(form: unknown): { value: NormalizedForm } | { error: string } {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return { error: 'بيانات الطلب غير صالحة' };
  const input = form as Record<string, unknown>;
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  const requestType = typeof input.requestType === 'string' ? input.requestType.trim() : '';
  const absenceType = typeof input.absenceType === 'string' ? input.absenceType.trim() : '';
  const exitTime = typeof input.exitTime === 'string' ? input.exitTime.trim() : '';
  const expectedReturnTime = typeof input.expectedReturnTime === 'string' ? input.expectedReturnTime.trim() : '';
  const actualAttendanceTime = typeof input.actualAttendanceTime === 'string' ? input.actualAttendanceTime.trim() : '';
  const absenceFrom = typeof input.absenceFrom === 'string' ? input.absenceFrom.trim() : '';
  const absenceTo = typeof input.absenceTo === 'string' ? input.absenceTo.trim() : '';
  const reason = stringField(input.reason, MAX_REASON_LENGTH);

  if (typeof input.reason !== 'string' || input.reason.trim().length === 0) return { error: 'سبب الطلب مطلوب' };
  if (input.reason.length > MAX_REASON_LENGTH) return { error: 'سبب الطلب يتجاوز الحد المسموح وهو 2000 حرف' };
  if (!validateDate(date)) return { error: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' };
  if (!REQUEST_TYPES.includes(requestType as any)) return { error: 'نوع الطلب غير صالح' };
  if (input.employeeCommitment !== true) return { error: 'إقرار الموظف مطلوب' };

  if (requestType === 'temporary_exit') {
    if (!validateTime(exitTime) || !validateTime(expectedReturnTime)) return { error: 'وقت الخروج والعودة المتوقعة مطلوبان بصيغة HH:MM' };
  } else if (requestType === 'early_exit') {
    if (!validateTime(exitTime)) return { error: 'وقت الخروج مطلوب بصيغة HH:MM' };
  } else if (requestType === 'late_arrival') {
    if (!validateTime(actualAttendanceTime)) return { error: 'وقت الحضور الفعلي مطلوب بصيغة HH:MM' };
  } else if (requestType === 'absence') {
    if (!ABSENCE_TYPES.includes(absenceType as any)) return { error: 'نوع الغياب غير صالح' };
    if (!validateDate(absenceFrom) || !validateDate(absenceTo) || absenceFrom > absenceTo) return { error: 'فترة الغياب مطلوبة ويجب أن تكون صحيحة' };
  }

  return {
    value: {
      date,
      requestType: requestType as NormalizedForm['requestType'],
      absenceType: requestType === 'absence' ? absenceType : '',
      exitTime: requestType === 'temporary_exit' || requestType === 'early_exit' ? exitTime : '',
      expectedReturnTime: requestType === 'temporary_exit' ? expectedReturnTime : '',
      actualAttendanceTime: requestType === 'late_arrival' ? actualAttendanceTime : '',
      absenceFrom: requestType === 'absence' ? absenceFrom : '',
      absenceTo: requestType === 'absence' ? absenceTo : '',
      reason,
      employeeCommitment: true,
    },
  };
}
