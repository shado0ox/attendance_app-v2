import test from 'node:test';
import assert from 'node:assert/strict';
import { fullAdminAccess } from '../src/lib/adminAccess';
import { parseNotificationQuery, notificationPage, updateNotificationRead } from '../src/lib/adminNotifications';
import { buildAdminNotifications, notificationStateKey } from '../src/server/adminNotifications';
const now = Date.parse('2026-10-05T10:00:00Z'), today = '2026-10-05';
const query = () => parseNotificationQuery({from:'2026-10-04',to:'2026-10-06'},today);
const data = { departments:[{id:'a',name:'A',needsMorning:true,friday:'off'},{id:'b',name:'B',needsMorning:true,friday:'off'}], employees:[{id:'ea',name:'Employee A',dept:'a'},{id:'eb',name:'Employee B',dept:'b'}], shiftTypes:[{id:'M2',name:'Second morning',type:'morning',start:'08:00',end:'16:00'}], settings:{}, schedule:{}, _schedulePublication:{shiftTypes:[{id:'M2',name:'Second morning',type:'morning',start:'08:00',end:'16:00'}],schedule:{'2026-10-04':{ea:{shiftType:'M2'},eb:{shiftType:'M2'}},'2026-10-05':{ea:{shiftType:'M2'},eb:{shiftType:'M2'}},'2026-10-06':{ea:{shiftType:'M2'}}}} };
const records = [{id:1,empId:'ea',empName:'Employee A',dept:'a',date:'2026-10-04',checkIn:'08:00'}];
const requests = [{id:1,empId:'ea',empName:'Employee A',dept:'a',date:today,type:'leave',status:'pending',notes:'Please review'}, {id:2,empId:'eb',empName:'Employee B',dept:'b',date:today,type:'leave',status:'pending',notes:'Private other request'}];
const build = (access = fullAdminAccess(), r = records, q = requests) => buildAdminNotifications('company',data,r,q,access,query(),now);
test('center merges pending requests, future coverage and past exceptions; repeated reads have stable IDs',()=>{
 const items=build(); assert.equal(items.filter(i=>i.category==='requests').length,2); assert.equal(items.filter(i=>i.category==='coverage').length,1); assert.equal(items.filter(i=>i.category==='attendance').length,2);
 assert.equal(items.find(i=>i.category==='coverage')!.dept,'b','custom morning type covers morning');
 assert.ok(items.filter(i=>i.category==='coverage').every(i=>i.date>=today)); assert.ok(items.filter(i=>i.category==='attendance').every(i=>i.date<today));
 assert.deepEqual(build(),items); assert.ok(items.every(i=>/^(requests|coverage|attendance)-[a-f0-9]{64}$/.test(i.id)));
 assert.ok(!JSON.stringify(items).includes('checkInLat'));
});
test('approved leave removes scheduled employee from coverage; resolved requests and complete punches disappear',()=>{
 const leave={...requests[0],status:'approved',date:'2026-10-06'};
 const items=build(fullAdminAccess(),[{...records[0],checkOut:'16:00'}] as any,[leave]);
 assert.equal(items.filter(i=>i.category==='requests').length,0);
 assert.equal(items.filter(i=>i.category==='coverage').length,2,'approved leave creates real gap');
 assert.ok(!items.some(i=>i.category==='attendance'&&i.empId==='ea'),'completed valid day is resolved');
});
test('ownership and category permissions are applied before summaries and paging',()=>{
 const access={...fullAdminAccess(),departmentIds:['a']}; const items=build(access);
 assert.equal(items.length,2); assert.ok(items.every(i=>i.dept==='a')); assert.ok(!JSON.stringify(items).includes('Private other'));
 const onlyCoverage={...access,permissions:Object.fromEntries(Object.keys(access.permissions).map(p=>[p,p==='canEditSchedule']))};
 assert.equal(build(onlyCoverage).length,0,'covered own department has no notifications');
 const filtered=buildAdminNotifications('company',data,records,requests,fullAdminAccess(),{...query(),dept:'b'},now); assert.ok(filtered.every(i=>i.dept==='b'));
});
test('one employee-day produces one exception alert even with multiple reasons',()=>{
 const rows=[{...records[0],checkIn:'08:20',checkOut:'15:00'},{...records[0],id:2,checkIn:'08:30',checkOut:'14:00'}];
 const own=build(fullAdminAccess(),rows as any).filter(i=>i.category==='attendance'&&i.empId==='ea'); assert.equal(own.length,1); assert.ok(own[0].title.includes('تأخير')); assert.ok(own[0].title.includes('سجلات متعددة'));
});
test('paging/read filters keep total counters and deduplicate identities',()=>{
 const items=build(); const state=updateNotificationRead({},[items[0].id],true,new Set(items.map(i=>i.id)),now);
 const page=notificationPage([...items,items[0]],state,{...query(),pageSize:1,read:'unread'});
 assert.equal(page.activeTotal,items.length); assert.equal(page.unread,items.length-1); assert.equal(page.total,items.length-1); assert.equal(page.items.length,1);
 const read=notificationPage(items,state,{...query(),read:'read'}); assert.equal(read.total,1); assert.equal(read.items[0].id,items[0].id);
 const cleared=updateNotificationRead(state,[items[0].id],false,new Set(items.map(i=>i.id)),now); assert.equal(notificationPage(items,cleared,query()).unread,items.length);
});
test('read marks are validated, limited and scoped by account/tenant',()=>{
 const items=build(), allowed=new Set(items.map(i=>i.id));
 assert.throws(()=>updateNotificationRead({},[],true,allowed)); assert.throws(()=>updateNotificationRead({},[items[0].id],'true',allowed)); assert.throws(()=>updateNotificationRead({},['requests-'+'a'.repeat(64)],true,allowed)); assert.throws(()=>updateNotificationRead({},Array(101).fill(items[0].id),true,allowed));
 assert.notEqual(notificationStateKey('company',{role:'admin',id:1}),notificationStateKey('company',{role:'admin',id:2})); assert.notEqual(notificationStateKey('company',{role:'admin',id:1}),notificationStateKey('other',{role:'admin',id:1}));
 const large=Object.fromEntries(Array.from({length:2000},(_,i)=>['old-'+i,'2020-01-01T00:00:00.000Z']));
 assert.equal(Object.keys(updateNotificationRead({read:large},[items[0].id],true,allowed,now).read).length,2000);
});
test('query rejects invalid dates, unbounded ranges, forged types and invalid pagination',()=>{
 for(const q of [{from:'2026-02-30'},{from:'2026-01-01',to:'2026-02-15'},{category:'__proto__'},{read:'yes'},{dept:['a']},{page:'0'},{pageSize:'101'}]) assert.throws(()=>parseNotificationQuery(q,today));
 const defaults=parseNotificationQuery({},today); assert.equal(defaults.from,'2026-09-29'); assert.equal(defaults.to,'2026-10-11');
});
