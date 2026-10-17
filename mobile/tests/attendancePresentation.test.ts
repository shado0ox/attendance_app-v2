import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePeriod, duration, fixSite, identityImage, periodMetrics } from '../src/lib/attendancePresentation.ts';
import type { Attendance, Bootstrap, BreakEntry } from '../src/lib/types.ts';
const start = Date.parse('2026-10-15T22:00:00+03:00');
const record = { id: 1, date: '2026-10-15', checkIn: '22:00', checkInTs: String(start), checkOutTs: String(start+8*3600000), breaks: [] } as unknown as Attendance;
test('receipt durations use saved overnight timestamps, never formatted time guesses', () => {
  assert.equal(periodMetrics(record,1,undefined,start+9*3600000).elapsed,480);
  assert.equal(periodMetrics({...record,checkInTs:null},1,undefined,start+9*3600000).elapsed,null);
  assert.equal(periodMetrics({...record,checkOutTs:String(start-1)},1,undefined,start+9*3600000).elapsed,null);
  assert.equal(periodMetrics({...record,checkOutTs:null},1,undefined,start+25*3600000).elapsed,null);
  assert.equal(duration(125),'02:05'); assert.equal(duration(null),'—');
});
test('second-period receipt and progress use its original published day', () => {
  const second = {...record, checkIn2:'07:00',checkInTs2:String(start+9*3600000),checkOutTs2:String(start+12*3600000)};
  const plan = {date:record.date,period:2,start:start+9*3600000,end:start+12*3600000};
  const data = {today:'2026-10-16',punchPlans:[plan]} as Bootstrap;
  assert.deepEqual(activePeriod(data,second,'checkOut2'),{date:record.date,period:2,plan});
  const metrics = periodMetrics(second,2,plan,start+12*3600000);
  assert.equal(metrics.elapsed,180); assert.equal(metrics.remaining,0); assert.equal(metrics.progress,1);
  assert.equal(periodMetrics(undefined,2,plan,start).progress,0);
});
test('break receipt clips and merges completed intervals without subtracting company report totals', () => {
  const entry = (a:number,b:number,period=1) => ({period,startedAt:start+a*60000,endedAt:start+b*60000}) as BreakEntry;
  const metrics = periodMetrics({...record,breaks:[entry(-10,10),entry(5,30),entry(20,40),entry(470,500),entry(60,90,2),{...entry(100,150),endedAt:null}]},1,undefined,start+9*3600000);
  assert.equal(metrics.breakMinutes,50); assert.equal(metrics.elapsed,480);
});
test('location label only confirms a site when the complete accuracy circle is inside', () => {
  const sites = [{id:'a',name:'المكتب',lat:26,lng:50,radius:100}];
  assert.equal(fixSite({latitude:26,longitude:50,accuracy:20},sites),'داخل نطاق المكتب');
  assert.ok(!fixSite({latitude:26,longitude:50,accuracy:101},sites).startsWith('داخل'));
  assert.ok(!fixSite({latitude:26.01,longitude:50,accuracy:5},sites).startsWith('داخل'));
  assert.ok(!fixSite({latitude:26,longitude:50,accuracy:5},[]).startsWith('داخل'));
});
test('identity pictures reject external URLs, executable content and excessive payloads', () => {
  assert.equal(identityImage('data:image/png;base64,AAAA'),'data:image/png;base64,AAAA');
  for(const value of ['https://tracker.test/a.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,'+'A'.repeat(1500000),null]) assert.equal(identityImage(value),'');
});
