async function pushRequest(url: string, options: RequestInit = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function workerSupportsPush(worker: ServiceWorker) {
  return new Promise<boolean>(resolve => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ready); };
    const timer = setTimeout(() => finish(false), 2000);
    channel.port1.onmessage = event => finish(event.data?.type === 'ATTENDANCE_PUSH_CAPABLE');
    worker.postMessage({ type: 'ATTENDANCE_PUSH_PROBE' }, [channel.port2]);
  });
}
let pendingSync: Promise<unknown> = Promise.resolve();
export function syncAttendancePush(enabled: boolean) {
  const pending = pendingSync.catch(() => {}).then(() => performSync(enabled));
  pendingSync = pending.catch(() => {}); return pending;
}
async function performSync(enabled: boolean) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('هذا الجهاز لا يدعم إشعارات الحضور خارج التطبيق. على iPhone افتح التطبيق المثبت على الشاشة الرئيسية.');
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) throw new Error('افتح التطبيق بعد تثبيته وتحديثه ثم فعّل الإشعارات.');
  let subscription = await registration.pushManager.getSubscription();
  if (!enabled) {
    if (subscription) {
      const response = await pushRequest('/api/attendance-push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      if (!response.ok) throw new Error('تعذر إيقاف تذكيرات الجهاز؛ أعد المحاولة.');
      await subscription.unsubscribe();
    }
    return false;
  }
  if (!await workerSupportsPush(registration.active)) throw new Error('حدّث التطبيق من تنبيه النسخة الجديدة ثم أعد تفعيل الإشعارات.');
  if (Notification.permission !== 'granted') throw new Error('اسمح بالإشعارات أولًا.');
  const keyResponse = await pushRequest('/api/attendance-push/key');
  const config = await keyResponse.json();
  if (!keyResponse.ok) throw new Error(config.error || 'تعذر تفعيل الإشعارات');
  const padded = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), char => char.charCodeAt(0));
  if (subscription && subscription.options.applicationServerKey) {
    const old = new Uint8Array(subscription.options.applicationServerKey);
    if (old.length !== bytes.length || old.some((byte, i) => byte !== bytes[i])) { await subscription.unsubscribe(); subscription = null; }
  }
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  const response = await pushRequest('/api/attendance-push/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر حفظ الإشعارات');
  return true;
}

export async function clearAttendanceNotifications(scope: string) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const notifications = await registration?.getNotifications();
    notifications?.filter(notification => notification.tag.startsWith(scope + ':')).forEach(notification => notification.close());
  } catch { /* notification support is optional */ }
}
