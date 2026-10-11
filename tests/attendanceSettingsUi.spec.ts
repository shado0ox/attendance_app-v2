import { test, expect } from '@playwright/test';
test('WhatsApp settings save a disabled pilot, clear secrets from inputs and distinguish acceptance from delivery', async ({ page }) => {
  let settings: any = { enabled: false, mode: 'selected', employeeIds: [], phoneNumberId: '', sender: '', apiVersion: 'v26.0', language: 'ar', attendanceTemplate: '', departureTemplate: '', portalUrl: '', attendanceEnabled: true, departureEnabled: true, attendanceDelay: 10, departureDelay: 0, interval: 10, contacts: {}, hasAccessToken: false, hasAppSecret: false, hasVerifyToken: false, ready: false, webhookPath: '/api/whatsapp-webhook/test', employees: [{ id: 'e', name: 'موظف التجربة' }] };
  let submitted: any;
  await page.route('**/api/whatsapp/settings', async route => {
    if (route.request().method() === 'POST') { submitted = route.request().postDataJSON(); settings = { ...submitted, accessToken: undefined, appSecret: undefined, verifyToken: undefined, hasAccessToken: true }; }
    await route.fulfill({ json: settings });
  });
  await page.route('**/api/whatsapp/logs', route => route.fulfill({ json: [{ employeeName: 'موظف التجربة', kind: 'attendance', test: true, status: 'accepted', createdAt: '2026-10-10T08:00:00+03:00' }] }));
  await page.route('**/api/whatsapp/test', route => route.fulfill({ json: { accepted: true, message: 'قبل واتساب الطلب؛ التسليم غير مؤكد حتى وصول تحديث الحالة.' } }));
  await page.goto('/tests/ui/whatsappSettings.html');
  await expect(page.getByText('الخدمة معطلة — إعداد الربط غير مكتمل')).toBeVisible();
  await page.getByText('بيانات حساب واتساب والقوالب', { exact: true }).click();
  await page.getByLabel('Access Token', { exact: true }).fill('secret-token');
  await page.getByLabel('رقم واتساب موظف التجربة').fill('966500000000');
  await page.getByLabel('أؤكد الحصول على موافقة الموظف لاستقبال تذكيرات واتساب').check();
  await page.getByRole('button', { name: 'حفظ إعدادات واتساب', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ الإعدادات');
  expect(submitted.enabled).toBe(false); expect(submitted.contacts.e.consent).toBe(true); expect(submitted.accessToken).toBe('secret-token');
  await expect(page.getByLabel('Access Token', { exact: true })).toHaveValue('');
  await page.getByText('اختبار الإرسال وسجل الرسائل', { exact: true }).click();
  await page.getByLabel('موظف اختبار واتساب').selectOption('e');
  await page.getByRole('button', { name: 'إرسال رسالة اختبار فعلية', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('التسليم غير مؤكد');
  await expect(page.getByRole('cell', { name: 'قبل واتساب الطلب — التسليم غير مؤكد' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('map click and marker drag select branch coordinates; saving retains the point and radius', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // Map interaction does not depend on tile provider availability.
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7X8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/tests/ui/attendanceSettings.html');
  const map = page.getByRole('region', { name: 'خريطة اختيار موقع البصمة' });
  await map.click({ position: { x: 160, y: 130 } });
  await expect(page.locator('.attendance-map-pin')).toBeVisible();
  await page.getByText('الإحداثيات — إعدادات متقدمة').click();
  const lat = page.getByLabel('خط العرض', { exact: true }), lng = page.getByLabel('خط الطول', { exact: true });
  await expect(lat).not.toHaveValue(''); await expect(lng).not.toHaveValue('');
  const before = await lng.inputValue(), marker = await page.locator('.attendance-map-pin').boundingBox();
  await page.mouse.move(marker!.x + 21, marker!.y + 20); await page.mouse.down(); await page.mouse.move(marker!.x + 61, marker!.y + 20, { steps: 8 }); await page.mouse.up();
  await expect(lng).not.toHaveValue(before);
  await page.getByLabel('النطاق بالمتر').fill('250');
  await page.getByRole('button', { name: 'حفظ مواقع الفروع' }).click();
  await expect(page.getByText('تم حفظ مواقع الفروع بنجاح.', { exact: true })).toBeVisible();
  const saved = JSON.parse(await page.getByTestId('saved').innerText()).attendanceLocations[0];
  expect(saved.radius).toBe(250); expect(saved.lat).toBeCloseTo(Number(await lat.inputValue()), 6); expect(saved.lng).toBeCloseTo(Number(await lng.inputValue()), 6);
  expect(errors).toEqual([]);
});
test('foreground reminders repeat ten-minute slots, stop at one hour and do not replay on reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T08:00:00+03:00') });
  await page.route('**/test-attendance-status', route => route.fulfill({ json: { status: 'not-checked-in' } }));
  await page.goto('/tests/ui/attendanceSettings.html?reminders');
  await expect(page.getByTestId('reminder-count')).toHaveText('1');
  await page.clock.fastForward(10 * 60000); await expect(page.getByTestId('reminder-count')).toHaveText('2');
  await page.reload(); await expect(page.getByTestId('reminder-count')).toHaveText('0');
  for (let i = 1; i <= 4; i++) { await page.clock.fastForward(10 * 60000); await expect(page.getByTestId('reminder-count')).toHaveText(String(i)); }
  await page.clock.fastForward(20 * 60000); await expect(page.getByTestId('reminder-count')).toHaveText('4');
});
test('a saved check-in stops foreground reminders on the next status refresh', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T08:00:00+03:00') });
  let status = 'not-checked-in';
  await page.route('**/test-attendance-status', route => route.fulfill({ json: { status } }));
  await page.goto('/tests/ui/attendanceSettings.html?reminders'); await expect(page.getByTestId('reminder-count')).toHaveText('1');
  status = 'checked-in'; await page.clock.fastForward(5 * 60000); await page.waitForTimeout(100);
  await page.clock.fastForward(15 * 60000); await expect(page.getByTestId('reminder-count')).toHaveText('1');
});
