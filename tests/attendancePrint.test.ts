import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendancePrintHtml } from '../src/lib/attendancePrint';
const day = { empId: 'e1', empName: '<script>alert(1)</script>', date: '2026-09-30', dept: 'المالية', first: { time: Date.parse('2026-09-30T08:00:00+03:00'), location: 'المقر' }, last: { time: Date.parse('2026-09-30T17:00:00+03:00'), location: 'فرع الدمام' }, minutes: 540, reportStatus: 'مكتمل', note: '<img src=x onerror=alert(1)>' };
test('print escapes stored text and distinguishes an unapproved report', () => {
  const html = attendancePrintHtml({ companyName: 'شركة <اختبار>', days: [day, { ...day, minutes: null }], period: 'سبتمبر' });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('غير معتمد'));
  assert.ok(html.includes('أيام تحتاج مراجعة: 1'));
  assert.ok(html.includes('إجمالي مدة العمل: 9 س 0 د'));
  assert.ok(html.includes('08:00') && html.includes('17:00'));
  assert.ok(html.includes('فرع الدمام'));
});
test('printing preserves all supplied rows beyond a display page and frozen approval identity', () => {
  const days = Array.from({ length: 75 }, (_, i) => ({ ...day, empId: String(i), empName: 'موظف ' + i }));
  const html = attendancePrintHtml({ companyName: 'الاسم المعتمد', days, period: '2026-09', approvedAt: '2026-10-01T00:00:00Z', approvedBy: 'المدير' });
  assert.equal((html.match(/<tr>/g) || []).length, 76);
  assert.ok(html.includes('موظف 74'));
  assert.ok(html.includes('نسخة معتمدة'));
  assert.ok(!html.includes('غير معتمد'));
  assert.ok(html.includes('توقيع الموظف'));
  assert.ok(html.includes('table-header-group'));
});
