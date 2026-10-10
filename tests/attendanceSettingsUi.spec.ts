import { test, expect } from '@playwright/test';
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
