import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftPeriods, coverageAlerts, proposeSchedule, applyProposal, planningDates, type PlanOptions } from '../src/lib/schedulePlanning';

const shifts = [
  {id:'M2',name:'صباحي ثاني',type:'morning',start:'08:00',end:'16:00'},
  {id:'V2',name:'مسائي ثاني',type:'evening',start:'16:00',end:'23:00'},
  {id:'DOUBLE',type:'double',start:'08:00',end:'12:00',start2:'16:00',end2:'20:00'}
];
const dept = {id:'one',name:'القسم',needsMorning:true,needsEvening:true,friday:'normal'};
const employees = Array.from({length:6},(_,i)=>({id:'e'+i,name:'موظف '+i,dept:'one'}));
const options: PlanOptions = {
  from:'2026-10-03',to:'2026-10-16',morning:1,evening:1,shiftIds:['M2','V2'],
  employeeIds:employees.map(e=>e.id),restDays:1,maxConsecutive:6,minRestHours:11,unavailable:{}
};
test('custom shift classification clears morning and evening alerts including normal Friday',()=>{
  const date='2026-10-09';
  const schedule={[date]:{e0:{shiftType:'M2'},e1:{shiftType:'V2'}}};
  assert.equal(coverageAlerts([dept],employees,shifts,schedule,[date]).length,0);
  assert.deepEqual(shiftPeriods({id:'S',type:'evening'}),['evening']);
  assert.deepEqual(shiftPeriods({id:'S'}),['morning']);
  assert.deepEqual(shiftPeriods({id:'unknown'}),[]);
  assert.deepEqual(shiftPeriods(shifts[2]),['morning','evening']);
  assert.equal(coverageAlerts([dept],employees,shifts,{},[date]).length,2);
});
test('Friday off and partial policies remain distinct and departments never share coverage',()=>{
  const date='2026-10-09',schedule={[date]:{e0:{shiftType:'M2'}}};
  assert.equal(coverageAlerts([{...dept,friday:'off'}],employees,shifts,{},[date]).length,0);
  assert.equal(coverageAlerts([{...dept,friday:'partial'}],employees,shifts,schedule,[date]).length,0);
  assert.equal(coverageAlerts([{...dept,friday:'partial'}],employees,shifts,{},[date])[0].id,date+'_one_friday');
  assert.equal(coverageAlerts([{...dept,id:'two'}],employees,shifts,schedule,[date]).length,2);
});
test('proposal covers periods while preserving leave, other departments and original schedule',()=>{
  const base={'2026-10-03':{e0:{shiftType:'A',note:'إجازة معتمدة'},outsider:{shiftType:'V2',note:'ثابت'}}};
  const original=JSON.stringify(base);
  const result=proposeSchedule(dept,employees,shifts,base,options);
  assert.deepEqual(result.issues,[]);
  assert.equal(JSON.stringify(base),original);
  assert.deepEqual(result.schedule['2026-10-03'].e0,base['2026-10-03'].e0);
  assert.deepEqual(result.schedule['2026-10-03'].outsider,base['2026-10-03'].outsider);
  assert.equal(coverageAlerts([dept],employees,shifts,result.schedule,planningDates(options.from,options.to)).length,0);
  assert.deepEqual(result,proposeSchedule(dept,employees,shifts,base,options));
  assert.deepEqual(applyProposal(base,result.changes),result.schedule);
});
test('proposal respects unavailable days, rolling rest, consecutive cap and inter-shift rest',()=>{
  const o={...options,restDays:2,maxConsecutive:3,unavailable:{e0:[0,1,2,3,4,5,6]}};
  const r=proposeSchedule(dept,employees,shifts,{},o);
  assert.deepEqual(r.issues,[]);
  const dates=planningDates(o.from,o.to);
  assert.ok(dates.every(d=>r.schedule[d].e0.shiftType==='A'));
  for(const e of employees){
    let streak=0,lastEnd=-Infinity;
    for(const date of dates){
      const entry=r.schedule[date][e.id];
      if(entry.shiftType==='A'){streak=0;continue;}
      assert.ok(++streak<=3);
      const shift=shifts.find(s=>s.id===entry.shiftType)!;
      const start=Date.parse(date+'T'+shift.start+':00Z'),end=Date.parse(date+'T'+shift.end+':00Z');
      assert.ok(start-lastEnd>=11*3600000);lastEnd=end;
    }
    for(let i=0;i+7<=dates.length;i++) assert.ok(dates.slice(i,i+7).filter(d=>r.schedule[d][e.id].shiftType==='A').length>=2);
  }
});
test('infeasible coverage is explicit; conflicting existing overnight and future shifts are protected',()=>{
  const o={...options,from:'2026-10-03',to:'2026-10-03',employeeIds:['e0']};
  assert.ok(proposeSchedule(dept,employees,shifts,{},o).issues.length>0);
  const night={id:'N',type:'evening',start:'22:00',end:'06:00'};
  const base={'2026-10-02':{e0:{shiftType:'N'}},'2026-10-04':{e0:{shiftType:'M2'}}};
  const r=proposeSchedule(dept,employees,[...shifts,night],base,{...o,evening:0});
  assert.equal(r.schedule['2026-10-03'].e0.shiftType,'A');
  assert.ok(r.issues.length>0);
});
test('stale application cannot overwrite an existing assignment; invalid input is rejected',()=>{
  assert.throws(()=>applyProposal({'2026-10-03':{e0:{shiftType:'A'}}},[{date:'2026-10-03',employeeId:'e0',shiftType:'M2',note:''}]));
  assert.throws(()=>planningDates('2026-02-30','2026-03-01'));
  assert.throws(()=>planningDates('2026-10-01','2026-11-01'));
  assert.throws(()=>proposeSchedule(dept,employees,shifts,{}, {...options,restDays:7}));
});


test('planner does not assign archived or suspended employees or count them as coverage',()=>{
 const staff=[{id:'active',name:'Active',dept:'one'},{id:'archived',name:'Archived',dept:'one',status:'archived'},{id:'suspended',name:'Suspended',dept:'one',status:'suspended'}];
 const o={...options,from:'2026-10-03',to:'2026-10-03',employeeIds:staff.map(e=>e.id)};
 const result=proposeSchedule(dept,staff,shifts,{},o);
 assert.ok(result.changes.every(change=>change.employeeId==='active'));
 assert.ok(result.issues.length>0,'one active employee cannot cover two separate shifts');
});
test('planner rejects overlapping double shifts using the same rules as attendance analysis',()=>{
 const invalid={id:'BAD',type:'double',start:'08:00',end:'12:00',start2:'11:00',end2:'15:00'};
 assert.throws(()=>proposeSchedule(dept,employees,[invalid],{},{...options,shiftIds:['BAD']}));
});
