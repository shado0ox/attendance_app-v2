export type InstallPlatform = 'ios' | 'android' | 'other';
export type AppStoreLinks = { appStoreUrl: string; playStoreUrl: string };
export const emptyAppStoreLinks = (): AppStoreLinks => ({ appStoreUrl: '', playStoreUrl: '' });
export function installPlatform(userAgent: string, touchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios';
  return /Android/i.test(userAgent) ? 'android' : 'other';
}
export function validStoreLink(value: unknown, platform: 'ios' | 'android') {
  if (typeof value !== 'string' || !value.trim()) return '';
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || value.length > 1000) throw new Error('استخدم رابط متجر رسمي يبدأ بـ HTTPS');
  if (platform === 'ios' ? url.hostname !== 'apps.apple.com' || !/\/id\d+\/?$/.test(url.pathname) : url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details' || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(url.searchParams.get('id') || '')) throw new Error(platform === 'ios' ? 'أدخل رابط التطبيق الرسمي على App Store' : 'أدخل رابط التطبيق الرسمي على Google Play');
  return url.href;
}
export function parseAppStoreLinks(value: any): AppStoreLinks {
  if (!value || typeof value.appStoreUrl !== 'string' || typeof value.playStoreUrl !== 'string') throw new Error('بيانات روابط المتاجر غير صحيحة');
  return { appStoreUrl: validStoreLink(value.appStoreUrl, 'ios'), playStoreUrl: validStoreLink(value.playStoreUrl, 'android') };
}
export function storeForPlatform(links: AppStoreLinks, platform: InstallPlatform) {
  try { return platform === 'ios' ? validStoreLink(links.appStoreUrl, 'ios') : platform === 'android' ? validStoreLink(links.playStoreUrl, 'android') : ''; } catch { return ''; }
}

// UI hint only; never use a user agent to authorize attendance or API access.
export const isNativeIOSApp = (userAgent: string) => /(?:^|\s)WafrDawam-iOS(?:\s|$)/.test(userAgent);
