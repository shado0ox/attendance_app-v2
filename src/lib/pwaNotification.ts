export async function showPwaNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) await registration.showNotification(title, { body, dir: 'rtl', icon: '/icons/icon-192.png', tag: title });
    else new Notification(title, { body, dir: 'rtl', tag: title });
    return true;
  } catch { return false; }
}
