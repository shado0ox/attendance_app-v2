import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeRequestValues} from '../src/lib/employeeRequests';
const data={employees:[{id:'a',name:'Actual A',dept:'new',employmentHistory:{dept:[{date:'2026-10-01',before:'old',after:'new'}]}},{id:'b',name:'Actual B',dept:'other'},{id:'c',name:'Archived',status:'archived'}],shiftTypes:[{id:'S'}]};
const request={empId:'a',date:'2026-09-30',type:'leave',notes:'طلب'};
test('requests use actual employee identity and historical department; discard unrelated fields',()=>{
  const values=employeeRequestValues({...request,dept:'forged',empName:'forged',swapWithEmpId:'b',checkInTime:'08:00'},data);
  assert.equal(values.empName,'Actual A');assert.equal(values.dept,'old');assert.equal(values.swapWithEmpId,undefined);assert.equal(values.checkInTime,undefined);
});
test('invalid dates, request types, people and shifts are rejected',()=>{
  for(const patch of [{date:'2026-02-30'},{type:'unreviewed'},{empId:'missing'},{type:'shift_change',targetShift:'missing'},{notes:'x'.repeat(1001)},{status:'unreviewed'}])assert.throws(()=>employeeRequestValues({...request,...patch},data));
  assert.equal(employeeRequestValues({...request,type:'shift_change',targetShift:'S'},data).targetShift,'S');
});
test('swaps cannot impersonate a peer, target self or an archived employee',()=>{
  const values=employeeRequestValues({...request,type:'swap',swapWithEmpId:'b',swapWithEmpName:'forged'},data);
  assert.equal(values.swapWithEmpName,'Actual B');
  for(const swapWithEmpId of ['a','missing','c'])assert.throws(()=>employeeRequestValues({...request,type:'swap',swapWithEmpId},data));
});
