self.addEventListener('message', event => {
  if (event.data?.type === 'ATTENDANCE_PUSH_PROBE') event.ports?.[0]?.postMessage({ type: 'ATTENDANCE_PUSH_CAPABLE' });
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || !Number.isFinite(payload.expiresAt) || Date.now() >= payload.expiresAt) return;
    await self.registration.showNotification('لم تسجل حضورك', {
      body: String(payload.body || '').slice(0, 300), dir: 'rtl', icon: '/icons/icon-192.png',
      tag: String(payload.tag || 'attendance-reminder'), renotify: true,
      data: { url: '/employee', expiresAt: payload.expiresAt },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data?.url !== '/employee') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === '/employee');
    if (existing) await existing.focus(); else await self.clients.openWindow('/employee');
  })());
});
