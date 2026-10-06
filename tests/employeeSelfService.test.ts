import test from 'node:test';
import assert from 'node:assert/strict';
import { selfProfile, selfProfileUpdate, privateAttendanceDay } from '../src/server/employeeSelfService';
import { analyzeAttendance } from '../src/lib/attendanceAnalysis';
test('employee edits cannot change official identity, department, access or employment',()=>{
 for(const key of ['id','empId','name','username','dept','status','password','companyId','permissions','emailVerifiedAt','webauthnCredentials']) assert.throws(()=>selfProfileUpdate({[key]:'forged'}),{status:400});
 assert.deepEqual(selfProfileUpdate({displayName:' Name ',phone:' 0500000000 ',email:' USER@EXAMPLE.COM '}),{displayName:'Name',phone:'0500000000',email:'user@example.com'});
 const profile=selfProfile({id:'e',name:'Official',password:'private',allowedAttendanceLocationIds:['secret'],webauthnCredentials:['secret'],dept:'d'},[{id:'d',name:'Department'}]);assert.equal(profile.departmentName,'Department');assert.ok(!JSON.stringify(profile).includes('secret'));assert.ok(!JSON.stringify(profile).includes('private'));
});
test('profile photos reject external URLs, SVG, forged raster and oversized payloads',()=>{
 for(const photoDataUrl of ['https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,c2NyaXB0', 'data:image/png;base64,'+'A'.repeat(420001)])assert.throws(()=>selfProfileUpdate({photoDataUrl}),{status:400});
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH0kAAAAASUVORK5CYII=';assert.equal(selfProfileUpdate({photoDataUrl:png}).photoDataUrl,png);assert.equal(selfProfileUpdate({photoDataUrl:''}).photoDataUrl,'');
});
test('personal attendance distinguishes finished absences from leave, rest and future shifts without raw GPS',()=>{
 const data={employees:[{id:'e',name:'Employee',dept:'d'}],shiftTypes:[{id:'M',start:'08:00',end:'16:00'}],schedule:{'2026-10-01':{e:{shiftType:'M'}},'2026-10-02':{e:{shiftType:'M'}},'2026-10-03':{e:{shiftType:'OFF'}},'2026-10-04':{e:{shiftType:'M'}}}};
 const days=analyzeAttendance([] ,data,{from:'2026-10-01',to:'2026-10-04',empId:'e',dept:''},[{empId:'e',date:'2026-10-02'}],Date.parse('2026-10-03T18:00:00+03:00'));
 assert.deepEqual(days.filter(d=>d.analysis.absent).map(d=>d.date),['2026-10-01']);
 const own=privateAttendanceDay({...days[0],checkInLat:24,password:'secret',records:[{private:true}],first:{time:123,location:'Branch',lat:24}});assert.equal(own.first?.location,'Branch');assert.ok(!JSON.stringify(own).includes('secret'));assert.equal('lat' in own.first!,false);assert.equal('checkInLat' in own,false);assert.equal('records' in own,false);
});
