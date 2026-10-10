export function validPushSubscription(value: any) {
  try {
    const url = new URL(value?.endpoint);
    const host = url.hostname;
    // Push endpoints are supplied by the browser; do not allow arbitrary server requests.
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || value.endpoint.length > 2048) return false;
    if (!(host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com'))) return false;
    const keys = value.keys;
    return typeof keys?.p256dh === 'string' && keys.p256dh.length <= 88 && /^[A-Za-z0-9_-]+={0,2}$/.test(keys.p256dh) && Buffer.from(keys.p256dh, 'base64url').length === 65 && Buffer.from(keys.p256dh, 'base64url')[0] === 4 &&
      typeof keys?.auth === 'string' && keys.auth.length <= 24 && /^[A-Za-z0-9_-]+={0,2}$/.test(keys.auth) && Buffer.from(keys.auth, 'base64url').length === 16;
  } catch { return false; }
}

export function pushSubject(env: Record<string, string | undefined> = process.env) {
  const value = (env.ATTENDANCE_PUSH_SUBJECT || env.APP_URL || '').trim();
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname)) return url.origin;
    if (url.protocol === 'mailto:' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url.pathname) && !url.search && !url.hash) return value;
  } catch { /* invalid public contact URI */ }
  throw new Error('اضبط APP_URL على عنوان HTTPS العام للتطبيق أو ATTENDANCE_PUSH_SUBJECT على بريد mailto: صالح');
}
