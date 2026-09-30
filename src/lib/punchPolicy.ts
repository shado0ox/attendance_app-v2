import { getApprovedLocations, matchAttendanceLocation } from './attendanceLocations';
export const punchFields = ['checkIn', 'checkOut', 'checkIn2', 'checkOut2'] as const;
export function validatePunchTransition(record: any, field: typeof punchFields[number]): string | null {
  if (record?.[field]) return 'duplicate';
  if (field === 'checkIn') return record ? 'سجل اليوم موجود بالفعل' : null;
  if (!record?.checkIn) return 'يجب تسجيل الحضور أولًا';
  if (field === 'checkIn2' && !record.checkOut) return 'يجب تسجيل انصراف الفترة الأولى أولًا';
  if (field === 'checkOut2' && !record.checkIn2) return 'يجب تسجيل حضور الفترة الثانية أولًا';
  if (field === 'checkOut' && record.checkIn2) return 'الفترة الأولى مغلقة';
  return null;
}
export function checkPunchLocation(settings: any, lat: any, lng: any, restricted: boolean) {
  const valid = lat != null && lng != null && lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
  const sites = getApprovedLocations(settings);
  if (restricted && sites.length && !valid) return { error: 'يلزم إرسال موقع GPS صحيح لتسجيل البصمة', name: '' };
  if (!valid) return { name: 'غير مسجل', error: null };
  const match = matchAttendanceLocation(settings, Number(lat), Number(lng));
  if (restricted && sites.length && !match.inside) return { error: 'أنت خارج مواقع البصمة المعتمدة للشركة', name: '' };
  return { error: null, name: match.inside ? match.location!.name : 'خارج المواقع المعتمدة' };
}
