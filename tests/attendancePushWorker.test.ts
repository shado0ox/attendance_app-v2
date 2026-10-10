import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('push worker drops expired reminders, uses a fixed employee URL and replaces the notification per shift', async () => {
  const handlers: any = {}, shown: any[] = [], opened: string[] = [];
  const context = { self: { addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, registration: { showNotification: async (...args: any[]) => { shown.push(args); } }, clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } }, location: { origin: 'https://attendance.example' } }, Date };
  vm.runInNewContext(fs.readFileSync('public/attendance-push-worker.js', 'utf8'), context);
  let pending: Promise<any>;
  const push = async (payload: any) => { handlers.push({ data: { json: () => payload }, waitUntil: (p: Promise<any>) => { pending = p; } }); await pending; };
  await push({ expiresAt: Date.now() - 1, body: 'expired' }); assert.equal(shown.length, 0);
  await push({ expiresAt: Date.now() + 60000, body: 'حضور', tag: 'company:employee:date:1', url: 'https://evil.test' });
  assert.equal(shown.length, 1); assert.equal(shown[0][1].data.url, '/employee'); assert.equal(shown[0][1].renotify, true);
  handlers.notificationclick({ notification: { data: shown[0][1].data, close: () => {} }, waitUntil: (p: Promise<any>) => { pending = p; } }); await pending;
  assert.deepEqual(opened, ['/employee']);
});
