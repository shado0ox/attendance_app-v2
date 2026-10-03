/* Bridge legacy auto-update clients to the prompt-enabled client, without deleting
   browser storage or forcing navigation. Modern clients retain user-controlled updates. */
(function () {
  const canMigrate = (clients) => clients.some(c => !c.modern) && clients.every(c => c.modern || new URL(c.url).pathname === '/employee');
  const inspect = (client) => new Promise(resolve => {
    const channel = new MessageChannel();
    let done = false;
    const finish = modern => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      channel.port1.close(); channel.port2.close();
      resolve({ url: client.url, modern });
    };
    const timer = setTimeout(() => finish(false), 2500);
    channel.port1.onmessage = event => finish(event.data?.type === 'ATTENDANCE_UPDATE_CAPABLE');
    try { client.postMessage({ type: 'ATTENDANCE_UPDATE_PROBE' }, [channel.port2]); }
    catch { finish(false); }
  });
  self.addEventListener('install', event => {
    event.waitUntil((async () => {
      // First install has no previous worker and needs no migration.
      if (!self.registration.active) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const scoped = windows.filter(c => c.url.startsWith(self.registration.scope));
      const capabilities = await Promise.all(scoped.map(inspect));
      if (canMigrate(capabilities)) await self.skipWaiting();
    })());
  });
})();
