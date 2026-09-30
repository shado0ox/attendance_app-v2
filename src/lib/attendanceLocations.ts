export type AttendanceLocation = { id: string; name: string; lat: number; lng: number; radius: number; enabled?: boolean };

export function isValidLocation(location: any): boolean {
  return location && location.lat !== '' && location.lng !== '' && location.lat != null && location.lng != null &&
    Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng)) &&
    Math.abs(Number(location.lat)) <= 90 && Math.abs(Number(location.lng)) <= 180 &&
    Number.isFinite(Number(location.radius)) && Number(location.radius) > 0;
}

// Existing companies retain their main office; additional branches are optional.
export function getApprovedLocations(settings: any): AttendanceLocation[] {
  const main = settings?.officeLocation;
  const entries = [
    ...(main ? [{ ...main, id: 'main', name: 'المقر الرئيسي', radius: main.radius || 150 }] : []),
    ...(Array.isArray(settings?.attendanceLocations) ? settings.attendanceLocations : [])
  ];
  return entries.filter(location => location.enabled !== false && isValidLocation(location))
    .map(location => ({ ...location, lat: Number(location.lat), lng: Number(location.lng), radius: Number(location.radius) }));
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lng2 - lng1) * radians / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - Math.min(1, a)));
}

export function getEmployeeLocations(settings: any, employee: any = settings?._attendanceEmployee): AttendanceLocation[] {
  const locations = getApprovedLocations(settings);
  if (!employee?.restrictAttendanceLocations) return locations;
  const ids = Array.isArray(employee.allowedAttendanceLocationIds) ? employee.allowedAttendanceLocationIds : [];
  return locations.filter(location => ids.includes(location.id));
}

export function matchAttendanceLocation(settings: any, lat: number, lng: number, employee: any = settings?._attendanceEmployee) {
  const candidates = getEmployeeLocations(settings, employee).map(location => ({
    location, distance: distanceMeters(lat, lng, location.lat, location.lng)
  })).sort((a, b) => a.distance - b.distance);
  // A farther site's larger radius may contain the person even if the nearest site's does not.
  const match = candidates.find(candidate => candidate.distance <= candidate.location.radius);
  const nearest = match || candidates[0];
  return { inside: !!match, location: nearest?.location, distance: nearest?.distance ?? Infinity };
}
