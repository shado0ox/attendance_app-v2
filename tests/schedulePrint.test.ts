import test from 'node:test';
import assert from 'node:assert/strict';
import { schedulePrintHtml, shiftPrintInfo } from '../src/lib/schedulePrint';
const department = {id:'d1',name:'المالية',needsMorning:true,needsEvening:true,friday:'normal'};
const options = {
  companyName:'شركة الاختبار',departments:[department],employees:[{id:'e1',name:'أحمد',dept:'d1'},{id:'e2',name:'خارج القسم',dept:'d2'}],month:'2026-10',
  shiftTypes:[{id:'CUSTOM',name:'صباحي جديد',type:'morning',start:'08:00',end:'16:00'}],
  schedule:{'2026-10-01':{e1:{shiftType:'CUSTOM',note:'مراجعة الإدارة'}},'2026-10-02':{e1:{shiftType:'A',note:'إجازة معتمدة'}}},
  exportedAt:new Date('2026-10-01T10:00:00Z')
};
test('department report retains full month, exact notes, times and planned totals without other staff',()=>{
  const html=schedulePrintHtml(options);
  assert.ok(html.includes('2026-10-31'));
  assert.ok(html.includes('مراجعة الإدارة'));
  assert.ok(html.includes('إجازة معتمدة'));
  assert.ok(html.includes('08:00 - 16:00'));
  assert.ok(html.includes('8:00'));
  assert.ok(html.includes('غير مجدول'));
  assert.ok(html.includes('نقص مسائي'));
  assert.ok(!html.includes('خارج القسم'));
  assert.ok(html.includes('A4 landscape'));
  assert.ok(html.includes('table-header-group'));
  assert.ok(html.includes('counter(pages)'));
});
test('multi-department report chunks staff and dates instead of compressing all columns',()=>{
  const employees=Array.from({length:13},(_,i)=>({id:'emp'+i,name:'موظف '+i,dept:'d1'}));
  const html=schedulePrintHtml({...options,employees,departments:[department,{...department,id:'d2',name:'التشغيل'}]});
  for(const e of employees) assert.ok(html.includes(e.name));
  const grids=[...html.matchAll(/<table class="matrix">([\s\S]*?)<\/table>/g)];
  assert.ok(grids.length>=12);
  for(const grid of grids) {
    assert.ok((grid[1].match(/<th>/g)||[]).length<=7);
    assert.ok((grid[1].match(/<tr class=/g)||[]).length<=4);
  }
  assert.ok(html.includes('التشغيل'));
  assert.ok(html.includes('لا يوجد موظفون بالقسم'));
});
test('overnight and double durations use actual periods and flag incomplete times',()=>{
  assert.equal(shiftPrintInfo({type:'evening',start:'22:00',end:'06:00'}).minutes,480);
  assert.ok(shiftPrintInfo({type:'evening',start:'22:00',end:'06:00'}).times.includes('اليوم التالي'));
  assert.equal(shiftPrintInfo({type:'double',start:'08:00',end:'12:00',start2:'16:00',end2:'20:00'}).minutes,480);
  assert.equal(shiftPrintInfo({type:'double',start:'08:00',end:'12:00'}).minutes,null);
  assert.equal(shiftPrintInfo({start:'25:00',end:'08:00'}).minutes,null);
  assert.equal(shiftPrintInfo({start:'08:00',end:'08:00'}).minutes,null);
});
test('unknown assignments and incomplete shifts remain explicit and are not guessed as rest',()=>{
  const html=schedulePrintHtml({...options,schedule:{'2026-10-01':{e1:{shiftType:'DELETED'}}}});
  assert.ok(html.includes('شيفت غير معروف (DELETED)'));
  assert.ok(html.includes('تعيينات تحتاج مراجعة: 1'));
});
test('all user content is escaped, logos are restricted and invalid months rejected',()=>{
  const html=schedulePrintHtml({...options,companyName:'<script>evil()</script>',logoDataUrl:'https://example.com/a.svg',schedule:{'2026-10-01':{e1:{shiftType:'CUSTOM',note:'<img onerror="attack()">'}}}});
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror='));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('https://example.com'));
  assert.throws(()=>schedulePrintHtml({...options,month:'2026-13'}));
  assert.throws(()=>schedulePrintHtml({...options,month:''}));
  assert.throws(()=>schedulePrintHtml({...options,departments:[]}));
});
