import test from 'node:test';
import assert from 'node:assert/strict';
import {permissionMarkers,attachPermissionMarkers} from '../src/lib/permissionMarkers';
test('only approved documents mark the actual day or absence range',()=>{
 const markers=permissionMarkers([{id:1,employeeId:'a',status:'approved',formData:{date:'2026-10-09'}},{id:2,employeeId:'b',status:'pending_manager',formData:{date:'2026-10-09'}},{id:3,employeeId:'a',status:'approved',formData:{requestType:'absence',absenceFrom:'2026-10-08',absenceTo:'2026-10-10'}}],'2026-10-09','2026-10-10');
 assert.equal(markers.length,3);assert.ok(markers.every(marker=>marker.employeeId==='a'));
 const original={empId:'a',date:'2026-10-09',minutes:540,analysis:{lateMinutes:15}};
 const days=attachPermissionMarkers([original,{empId:'b',date:'2026-10-09'}],markers);
 assert.equal(days[0].permissions.length,2);assert.equal(days[1].permissions.length,0);
 assert.equal(days[0].minutes,540);assert.deepEqual(days[0].analysis,original.analysis);assert.equal((original as any).permissions,undefined);
});
