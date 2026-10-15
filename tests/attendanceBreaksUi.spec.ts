import { test, expect } from '@playwright/test';
test('break settings support employee and shift assignments with a start time and duration on mobile', async ({ page }) => {
  let submitted: any;
  await page.route('**/api/attendance-breaks/policy', route => {
    if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
    return route.fulfill({ json: { rules: [], employees: [{ id: 'e', name: 'موظف التجربة' }], shifts: [{ id: 'S', name: 'الصباح', start: '08:00', end: '17:00' }] } });
  });
  await page.goto('/tests/ui/attendanceBreaks.html?settings');
  await page.getByRole('button', { name: 'إضافة إعداد استراحة' }).click();
  await page.getByText('اختيار الموظفين (0)', { exact: true }).click(); await page.getByLabel('موظف التجربة').check();
  await page.getByLabel('بداية الاستراحة', { exact: true }).fill('12:30'); await page.getByLabel('مدة الاستراحة بالدقائق').fill('20');
  await page.getByRole('button', { name: 'حفظ إعدادات الاستراحة' }).click();
  await expect(page.getByRole('status')).toHaveText('تم حفظ إعدادات الاستراحة'); expect(submitted.rules[0].employeeIds).toEqual(['e']); expect(submitted.rules[0].time).toBe('12:30'); expect(submitted.rules[0].durationMinutes).toBe(20);
  await page.getByLabel('تطبيق على').selectOption('shifts'); await expect(page.getByText('اختيار الشيفتات (0)', { exact: true })).toBeVisible(); await page.getByLabel('الصباح').check();
  await page.getByLabel('تحديد الموعد').selectOption('offset'); await page.getByLabel('الدقائق من بداية الفترة').fill('120');
  await page.getByRole('button', { name: 'حفظ إعدادات الاستراحة' }).click(); await expect.poll(() => submitted.rules[0].scope).toBe('shifts'); expect(submitted.rules[0].shiftIds).toEqual(['S']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('employee records start and return and sees an overdue return using server time', async ({ page }) => {
  const start = Date.parse('2026-10-15T13:00:00+03:00'), deadline = start + 30 * 60000;
  await page.clock.install({ time: start });
  const entry = { id: 'b', name: 'استراحة الغداء', period: 1, recordId: 1, date: '2026-10-15', startedAt: start, endedAt: null, plannedStart: start, plannedEnd: deadline, allowedMinutes: 30 };
  let entries: any[] = [], now = start; const calls: any[] = [];
  const plan = { date: '2026-10-15', period: 1, rule: { id: 'r', name: 'استراحة الغداء', durationMinutes: 30 }, window: { start, end: deadline }, recordId: 1, eligible: true, shiftName: 'الصباح' };
  await page.route('**/api/attendance-breaks/status', route => route.fulfill({ json: { serverNow: now, entries, plans: [plan] } }));
  await page.route('**/api/attendance-breaks/action', route => { const body = route.request().postDataJSON(); calls.push(body); entries = [{ ...entry, ...(body.action === 'end' ? { endedAt: now } : {}) }]; return route.fulfill({ json: { entry: entries[0], serverNow: now } }); });
  await page.goto('/tests/ui/attendanceBreaks.html'); await page.getByRole('button', { name: 'تسجيل بداية الاستراحة' }).click();
  await expect(page.getByText('أنت في استراحة: استراحة الغداء')).toBeVisible(); expect(calls[0]).toEqual({ action: 'start', recordId: 1, period: 1 });
  now = deadline + 6 * 60000; await page.clock.setSystemTime(now); await page.getByRole('button', { name: 'تحديث حالة الاستراحة' }).click();
  await expect(page.getByText('تجاوز موعد الرجوع بـ 6 دقيقة')).toBeVisible(); await page.getByRole('button', { name: 'تسجيل الرجوع من الاستراحة' }).click();
  await expect(page.getByText(/تم الرجوع .*36 دقيقة/)).toBeVisible(); expect(calls[1]).toEqual({ action: 'end', recordId: 1, period: 1, entryId: 'b' }); await expect(page.getByRole('button', { name: 'تسجيل بداية الاستراحة' })).toHaveCount(0);
});
test('attendance report shows working, break and outside states plus late return and refreshes automatically', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T13:36:00+03:00') });
  let late = 6;
  await page.route('**/api/attendance-months?**', route => route.fulfill({ json: { status: 'open' } }));
  await page.route('**/api/attendance-report?**', route => route.fulfill({ json: { items: [
    { empId: 'e1', empName: 'أحمد', workStatus: 'working', workStatusText: 'في العمل', breakLateMinutes: 0 },
    { empId: 'e2', empName: 'سارة', workStatus: 'break', workStatusText: 'في الاستراحة', breakLateMinutes: late, activeBreakLateMinutes: late },
    { empId: 'e3', empName: 'منى', workStatus: 'outside', workStatusText: 'خارج العمل', breakLateMinutes: 0 },
  ].map((row, i) => ({ ...row, key: String(i), ids: [i + 1], date: '2026-10-15', minutes: null, reportStatus: 'قيد المراجعة' })), total: 3, page: 1, pageCount: 1, totalMinutes: 0 } }));
  await page.goto('/tests/ui/attendanceBreaks.html?report');
  await expect(page.getByRole('cell', { name: 'في العمل', exact: true })).toBeVisible(); await expect(page.getByRole('cell', { name: 'خارج العمل', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /في الاستراحة/ })).toContainText('6'); late = 7; await page.clock.fastForward(60000); await expect(page.getByRole('cell', { name: /في الاستراحة/ })).toContainText('7');
});
