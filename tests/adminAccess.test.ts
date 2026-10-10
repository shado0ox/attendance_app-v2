import test from 'node:test';
import assert from 'node:assert/strict';
import { fullAdminAccess, parseAdminAccess, scopedMainData, mergeAdminData, ownsDay, allowedAdminRoute } from '../src/lib/adminAccess';
const data = { departments: [{id:'a'}, {id:'b'}], employees: [{id:'ea',name:'A',dept:'a',password:'secret',phone:'private',employmentHistory:{dept:[{date:'2026-09-10',before:'b',after:'a'}]}},{id:'eb',name:'B',dept:'b',password:'other'}], shiftTypes:[{id:'S'}], settings:{companyName:'Test',password:'admin-secret',graceMinutes:5}, schedule:{'2026-09-09':{ea:{shiftType:'S'},eb:{shiftType:'S'}},'2026-09-11':{ea:{shiftType:'S'},eb:{shiftType:'S'}}}, _schedulePublication:{schedule:{'2026-09-11':{ea:{shiftType:'S'},eb:{shiftType:'S'}}}} };
const scoped = () => parseAdminAccess({departmentIds:['a'],permissions:{...fullAdminAccess().permissions,canManageEmployees:false,canManageDepts:false,canManageSettings:false}},data.departments);
test('department configuration rejects empty, foreign and privileged scopes',()=>{
 const access=scoped(); assert.deepEqual(access.departmentIds,['a']);
 for(const departmentIds of [[],['missing'],'a',undefined]) assert.throws(()=>parseAdminAccess({...access,departmentIds},data.departments));
 assert.throws(()=>parseAdminAccess({...access,permissions:{...access.permissions,canManageSettings:true}},data.departments));
 assert.throws(()=>parseAdminAccess({...access,permissions:{canViewReports:true}},data.departments));
});
test('scoped data excludes secrets, other employees and historical schedules before transfer',()=>{
 const view=scopedMainData(data,scoped());
 assert.deepEqual(view.employees.map((e:any)=>e.id),['ea']); assert.equal(view.employees[0].password,undefined);
 assert.equal(view.settings.password,undefined); assert.equal(view.employees[0].phone,undefined);
 assert.deepEqual(view.schedule['2026-09-09'],{}); assert.deepEqual(Object.keys(view.schedule['2026-09-11']),['ea']);
 assert.deepEqual(Object.keys(view._schedulePublication!.schedule['2026-09-11']),['ea']);
 assert.equal(ownsDay(scoped(),data,{empId:'ea',date:'2026-09-09',dept:'a'}),false);
 assert.equal(ownsDay(scoped(),data,{empId:'ea',date:'2026-09-11',swapWithEmpId:'eb'}),false);
});
test('scoped schedule save preserves hidden schedules, employees, settings and published data',()=>{
 const access=scoped(), view=scopedMainData(data,access);
 view.schedule['2026-09-11'].ea={shiftType:'OFF'};
 const merged=mergeAdminData(data,view,access);
 assert.equal(merged.schedule['2026-09-11'].ea.shiftType,'OFF'); assert.equal(merged.schedule['2026-09-11'].eb.shiftType,'S');
 assert.deepEqual(merged.schedule['2026-09-09'],data.schedule['2026-09-09']); assert.deepEqual(merged.employees,data.employees); assert.deepEqual(merged.settings,data.settings); assert.deepEqual(merged._schedulePublication,data._schedulePublication);
 assert.equal(data.schedule['2026-09-11'].ea.shiftType,'S','no mutation');
});
test('forged foreign employee, historical dates and company fields cannot be saved',()=>{
 const access=scoped();
 for(const field of ['settings','employees','departments','shiftTypes']) { const view:any=scopedMainData(data,access); view[field]=field==='settings'?{companyName:'forged'}:[]; assert.throws(()=>mergeAdminData(data,view,access)); }
 for(const [date,id] of [['2026-09-09','ea'],['2026-09-11','eb']]) { const view:any=scopedMainData(data,access); view.schedule[date][id]={shiftType:'OFF'}; assert.throws(()=>mergeAdminData(data,view,access)); }
 assert.throws(()=>mergeAdminData(data,scopedMainData(data,access),{...access,permissions:{...access.permissions,canEditSchedule:false}}));
});
test('server route permissions separate department review from company-wide operations',()=>{
 const access=scoped();
 for(const route of ['/api/admins','/api/audit-log','/api/attendance-months','/api/schedule-publication','/api/registration-requests']) assert.equal(allowedAdminRoute(access,'GET',route),false);
 assert.equal(allowedAdminRoute(access,'GET','/api/attendance-exceptions'),true);
 assert.equal(allowedAdminRoute(access,'PUT','/api/requests/1'),true);
 assert.equal(allowedAdminRoute(access,'DELETE','/api/attendance/1'),false);
 assert.equal(allowedAdminRoute(access,'POST','/api/requests'),false);
 assert.equal(allowedAdminRoute(access,'GET','/api/document-approval/token'),true);
 assert.equal(allowedAdminRoute(access,'POST','/api/document-approval/token'),true);
 assert.equal(allowedAdminRoute(access,'POST','/api/electronic-documents/1/cancel'),true);
 assert.equal(allowedAdminRoute({...access,permissions:{...access.permissions,canApproveRequests:false}},'POST','/api/electronic-documents/1/cancel'),false);
 assert.equal(allowedAdminRoute({...access,permissions:{...access.permissions,canApproveRequests:false}},'POST','/api/document-approval/token'),false);
 assert.equal(allowedAdminRoute(access,'GET','/api/new-unreviewed-endpoint'),false);
 assert.equal(allowedAdminRoute({...access,permissions:{...access.permissions,canApproveRequests:false}},'PUT','/api/requests/1'),false);
});

test('company-wide delegated permissions preserve hidden credentials and reject writes to readonly fields',()=>{
 const access={...fullAdminAccess(),permissions:{...fullAdminAccess().permissions,canManageEmployees:false,canManageSettings:false}};
 const view=scopedMainData(data,access); assert.equal(view.settings.password,undefined); assert.equal(view.employees[0].password,undefined);
 const merged=mergeAdminData(data,{...view,schedule:{'2026-09-11':{ea:{shiftType:'OFF'}}}},access);
 assert.deepEqual(merged.employees,data.employees); assert.deepEqual(merged.settings,data.settings);
 assert.throws(()=>mergeAdminData(data,{...view,employees:[]},access));
});
