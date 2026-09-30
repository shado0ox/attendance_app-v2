import assert from 'node:assert/strict';
import { getEmployeeLocations, matchAttendanceLocation } from '../src/lib/attendanceLocations';
import { checkPunchLocation } from '../src/lib/punchPolicy';
const settings = { officeLocation: { lat:24, lng:46, radius:150 }, attendanceLocations: [
  { id:'east', name:'الشرقية', lat:26, lng:50, radius:100 },
  { id:'disabled', name:'معطل', lat:25, lng:49, radius:100, enabled:false }
] };
const restricted = { restrictAttendanceLocations:true, allowedAttendanceLocationIds:['east'] };
assert.equal(getEmployeeLocations(settings, restricted).length,1);
assert.equal(matchAttendanceLocation(settings,26,50,restricted).inside,true);
assert.equal(matchAttendanceLocation(settings,24,46,restricted).inside,false);
assert.equal(checkPunchLocation(settings,26,50,true,restricted).error,null);
assert.ok(checkPunchLocation(settings,24,46,true,restricted).error);
assert.equal(checkPunchLocation(settings,24,46,false,restricted).error,null);
assert.ok(checkPunchLocation(settings,26,50,true,{...restricted,allowedAttendanceLocationIds:[]}).error);
assert.ok(checkPunchLocation(settings,25,49,true,{...restricted,allowedAttendanceLocationIds:['disabled']}).error);
assert.ok(checkPunchLocation(settings,26,50,true,{...restricted,allowedAttendanceLocationIds:['deleted']}).error);
assert.equal(getEmployeeLocations(settings,{}).length,2);
assert.equal(getEmployeeLocations({...settings,_attendanceEmployee:restricted}).length,1);
assert.equal(matchAttendanceLocation({...settings,_attendanceEmployee:restricted},24,46).inside,false);
assert.ok(checkPunchLocation({},null,null,true,restricted).error);
console.log('PASS: employee restrictions, multiple/default sites, disabled/deleted/empty assignments, client context, unrestricted checkout.');
