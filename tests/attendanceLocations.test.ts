import assert from 'node:assert/strict';
import { getApprovedLocations, matchAttendanceLocation, isValidLocation } from '../src/lib/attendanceLocations';
const settings = {
  officeLocation: { lat: 24.7136, lng: 46.6753, radius: 150 },
  attendanceLocations: [{ id: 'dammam', name: 'الدمام', lat: 26.42, lng: 50.09, radius: 200, enabled: true }]
};
assert.equal(getApprovedLocations(settings).length, 2);
assert.equal(matchAttendanceLocation(settings, 26.42, 50.09).location?.id, 'dammam');
assert.equal(matchAttendanceLocation(settings, 26.42, 50.09).inside, true);
assert.equal(matchAttendanceLocation(settings, 24.7136, 46.6753).inside, true);
assert.equal(matchAttendanceLocation(settings, 25, 48).inside, false);
assert.equal(matchAttendanceLocation({ ...settings, attendanceLocations: [{ ...settings.attendanceLocations[0], enabled: false }] }, 26.42, 50.09).inside, false);
assert.equal(matchAttendanceLocation({ attendanceLocations: settings.attendanceLocations }, 26.42, 50.09).inside, true);
assert.equal(isValidLocation({ lat: 0, lng: 0, radius: 1 }), true);
assert.equal(isValidLocation({ lat: '', lng: 0, radius: 1 }), false);
assert.equal(isValidLocation({ lat: 91, lng: 0, radius: 1 }), false);
assert.equal(isValidLocation({ lat: 0, lng: 0, radius: -1 }), false);
assert.equal(getApprovedLocations({}).length, 0);
assert.equal(matchAttendanceLocation({ attendanceLocations: [
  { id: 'near', name: 'near', lat: 0, lng: 0.001, radius: 10 },
  { id: 'wide', name: 'wide', lat: 0, lng: 0.002, radius: 300 }
] }, 0, 0).location?.id, 'wide');
console.log('PASS: primary office, branches, disabled sites, invalid coordinates, zero coordinates, overlapping radii, and branch-only companies.');
