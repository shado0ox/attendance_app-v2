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

test('administrator can pilot Passkey for one employee and approve or revoke a credential', async ({ page }) => {
  let mode = 'off', employeeIds: string[] = [], approved = false;
  await page.route('**/api/attendance-passkey/**', async route => {
    const request = route.request(), url = request.url();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      if (url.endsWith('/credential')) approved = body.approved;
      else { mode = body.mode; employeeIds = body.employeeIds; }
      await route.fulfill({ json: { saved: true } });
    } else await route.fulfill({ json: { mode, employeeIds, employees: [{ id: 'one', name: 'موظف التجربة', credentials: [{ id: 'credential', approved }] }, { id: 'two', name: 'موظف آخر', credentials: [] }] } });
  });
  await page.goto('/tests/ui/passkeySettings.html');
  await page.getByLabel('تطبيق خدمة Passkey').selectOption('selected');
  await page.getByRole('checkbox', { name: 'موظف التجربة', exact: true }).check();
  await page.getByRole('button', { name: 'حفظ نطاق التفعيل' }).click();
  await expect(page.getByRole('status')).toHaveText('تم الحفظ');
  expect(employeeIds).toEqual(['one']);
  await page.getByText('اعتماد مفاتيح الموظفين وإلغاء اعتمادها', { exact: true }).click();
  await page.getByRole('button', { name: 'اعتماد بعد التحقق من الموظف' }).click();
  await expect(page.getByRole('button', { name: 'إلغاء الاعتماد' })).toBeVisible();
  await page.getByRole('button', { name: 'إلغاء الاعتماد' }).click();
  await expect(page.getByRole('button', { name: 'اعتماد بعد التحقق من الموظف' })).toBeVisible();
  await page.getByLabel('تطبيق خدمة Passkey').selectOption('off');
  await page.getByRole('button', { name: 'حفظ نطاق التفعيل' }).click();
  await expect(page.getByRole('status')).toHaveText('تم الحفظ');
  expect(mode).toBe('off');
});


test('required first-use Passkey gate stays until registration and administrator approval', async ({ page }) => {
  await page.goto('/tests/ui/passkeySettings.html?gate');
  await expect(page.getByRole('heading', { name: 'إنشاء Passkey مطلوب للمتابعة' })).toBeVisible();
  await expect(page.getByText('بوابة الموظف متاحة')).toHaveCount(0);
  await page.getByRole('button', { name: 'إنشاء Passkey الآن' }).click();
  await expect(page.getByRole('heading', { name: 'بانتظار اعتماد مفتاحك' })).toBeVisible();
  await expect(page.getByText('بوابة الموظف متاحة')).toHaveCount(0);
  await page.getByRole('button', { name: 'إعادة التحقق من الاعتماد' }).click();
  await expect(page.getByText('بوابة الموظف متاحة')).toBeVisible();
});
test('settings sections start collapsed, open with keyboard and preserve draft values across collapse', async ({ page }) => {
  await page.route('**/api/attendance-breaks/policy', route => route.fulfill({ json: { rules: [], employees: [], shifts: [] } }));
  await page.route('**/api/whatsapp/settings', route => route.fulfill({ json: { enabled: false, mode: 'selected', employeeIds: [], phoneNumberId: '', sender: '', apiVersion: 'v26.0', language: 'ar', attendanceTemplate: '', departureTemplate: '', portalUrl: '', attendanceEnabled: true, departureEnabled: true, attendanceDelay: 10, departureDelay: 0, interval: 10, contacts: {}, ready: false, webhookPath: '/api/whatsapp-webhook/test', employees: [] } }));
  await page.route('**/api/whatsapp/logs', route => route.fulfill({ json: [] }));
  await page.route('**/api/attendance-passkey/policy', route => route.fulfill({ json: { mode: 'off', employeeIds: [], employees: [] } }));
  await page.route('**/api/audit-log?*', route => route.fulfill({ json: [] }));
  await page.goto('/tests/ui/companyTools.html');
  await expect(page.locator('.settings-section[open]')).toHaveCount(0);
  const company = page.locator('.settings-section').filter({ has: page.locator('summary', { hasText: 'بيانات الشركة والشعار' }) });
  await company.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(company).toHaveAttribute('open', '');
  await company.getByPlaceholder('مثال: شركة النجوم للاستقدام').fill('اسم جديد');
  await page.getByRole('button', { name: 'طي الكل', exact: true }).click();
  await expect(page.locator('.settings-section[open]')).toHaveCount(0);
  await company.locator('summary').click(); await expect(company.getByPlaceholder('مثال: شركة النجوم للاستقدام')).toHaveValue('اسم جديد');
  await page.getByRole('button', { name: 'توسيع الكل', exact: true }).click();
  await expect(page.locator('.settings-section[open]')).toHaveCount(9);
});
test('company backup requires preview and explicit confirmation before replacement', async ({ page }) => {
  let restored = false;
  await page.route('**/api/company-backup/status?*', route => route.fulfill({ json: restored ? { lastRestore: { at: '2026-10-11T12:00:00+03:00', rollback: { id: 'rollback-id' } } } : {} }));
  await page.route('**/api/company-backup/preview?*', route => route.fulfill({ json: { token: 'preview-token', companyName: 'شركة التجربة', createdAt: '2026-10-10T12:00:00+03:00', current: { employees: 2, attendance: 5 }, incoming: { employees: 2, attendance: 3 } } }));
  await page.route('**/api/company-backup/restore?*', route => { expect(route.request().postDataJSON()).toEqual({ file: 'encrypted-file', token: 'preview-token', confirm: 'استرجاع' }); restored = true; return route.fulfill({ json: { success: true, rollback: { id: 'rollback-id' }, message: 'تم استرجاع بيانات الشركة.' } }); });
  await page.goto('/tests/ui/companyTools.html?backup');
  await page.getByText('استرجاع نسخة سابقة للشركة', { exact: true }).click();
  await page.getByLabel('ملف نسخة الشركة', { exact: true }).setInputFiles({ name: 'company.wafr-backup', mimeType: 'application/octet-stream', buffer: Buffer.from('encrypted-file') });
  await page.getByRole('button', { name: 'فحص النسخة ومعاينة المحتوى' }).click();
  const restore = page.getByRole('button', { name: 'استبدال بيانات شركتي بهذه النسخة' }); await expect(restore).toBeDisabled();
  await page.getByLabel('تأكيد استرجاع الشركة').fill('استرجاع'); await expect(restore).toBeEnabled(); await restore.click();
  await expect(page.getByRole('button', { name: 'إعادة تحميل البيانات المسترجعة' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تنزيل نسخة ما قبل آخر استرجاع' })).toBeVisible();
  await expect(page.getByText('تم استرجاع بيانات الشركة.', { exact: true })).toBeVisible();
});
test('Get banner stays above content, closes independently and opens illustrated install steps', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'iPhone Safari' }));
  await page.route('**/api/app-installation', route => route.fulfill({ json: { appStoreUrl: '', playStoreUrl: '' } }));
  await page.goto('/tests/ui/installGuide.html');
  const banner = page.getByRole('complementary', { name: 'تنزيل تطبيق وفر دوام' });
  const bannerBox = await banner.boundingBox(), contentBox = await page.getByTestId('page-content').boundingBox();
  expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(contentBox!.y);
  expect(await banner.evaluate(element => getComputedStyle(element).position)).toBe('static');
  await page.getByRole('button', { name: 'تنزيل التطبيق', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'تنزيل وفر دوام' }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveCount(3); await expect(dialog.getByText('اضغط مشاركة', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'إخفاء رسالة تنزيل التطبيق' }).click(); await expect(banner).not.toBeVisible();
  const fixed = page.getByRole('button', { name: 'تنزيل التطبيق — الزر الثابت', exact: true }); await fixed.click(); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Android', exact: true }).click(); await expect(dialog.getByText('اختر تثبيت التطبيق', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'إغلاق شرح التنزيل' }).click();
  const fixedBox = await fixed.boundingBox(), navBox = await page.getByTestId('employee-nav').boundingBox(); expect(fixedBox!.y + fixedBox!.height).toBeLessThan(navBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('Get opens the configured device store and installed app hides both prompts', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Android Chrome' }));
  const url = 'https://play.google.com/store/apps/details?id=com.wafr.attendance';
  await page.route('**/api/app-installation', route => route.fulfill({ json: { appStoreUrl: '', playStoreUrl: url } }));
  await page.route('https://play.google.com/**', route => route.fulfill({ body: '<p>Store</p>', contentType: 'text/html' }));
  await page.goto('/tests/ui/installGuide.html'); await page.getByRole('button', { name: 'تنزيل التطبيق', exact: true }).click(); await expect(page).toHaveURL(url);
  await page.goto('/tests/ui/installGuide.html'); await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name: 'تنزيل التطبيق — الزر الثابت', exact: true })).not.toBeVisible();
  await expect(page.getByRole('complementary', { name: 'تنزيل تطبيق وفر دوام' })).not.toBeVisible();
});
test('Android native install prompt is consumed once and dismissal leaves manual guidance available', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Android Chrome' }));
  await page.route('**/api/app-installation', route => route.fulfill({ json: { appStoreUrl: '', playStoreUrl: '' } }));
  await page.goto('/tests/ui/installGuide.html');
  await page.evaluate(() => { (window as any).promptCount = 0; const event = new Event('beforeinstallprompt', { cancelable: true }); Object.assign(event, { prompt: async () => { (window as any).promptCount++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) }); window.dispatchEvent(event); });
  await page.getByRole('button', { name: 'تنزيل التطبيق', exact: true }).click(); await page.getByRole('button', { name: 'تثبيت الآن من المتصفح' }).click();
  await expect(page.getByRole('status')).toContainText('يمكنك التثبيت لاحقًا'); expect(await page.evaluate(() => (window as any).promptCount)).toBe(1);
  await expect(page.getByRole('button', { name: 'تثبيت الآن من المتصفح' })).not.toBeVisible();
});
