import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAppStoreLinks, installPlatform, parseAppStoreLinks, storeForPlatform } from '../src/lib/appInstallation';
test('installation platform recognizes iPhone, Android and iPad desktop browser user agent', () => {
  assert.equal(installPlatform('iPhone'), 'ios'); assert.equal(installPlatform('Android'), 'android'); assert.equal(installPlatform('Macintosh', 5), 'ios'); assert.equal(installPlatform('Macintosh', 0), 'other');
});
test('store links default empty and accept only official application URLs', () => {
  assert.deepEqual(parseAppStoreLinks(emptyAppStoreLinks()), emptyAppStoreLinks());
  assert.equal(parseAppStoreLinks({ appStoreUrl: 'https://apps.apple.com/sa/app/wafr/id123456', playStoreUrl: 'https://play.google.com/store/apps/details?id=com.wafr.attendance' }).appStoreUrl, 'https://apps.apple.com/sa/app/wafr/id123456');
  for (const appStoreUrl of ['https://evil.example/id123', 'https://apps.apple.com.evil.test/id123', 'https://user:secret@apps.apple.com/id123', 'http://apps.apple.com/id123', 'https://apps.apple.com:8443/id123', 'javascript:alert(1)', 'https://apps.apple.com/sa/search']) assert.throws(() => parseAppStoreLinks({ appStoreUrl, playStoreUrl: '' }));
  assert.throws(() => parseAppStoreLinks({ appStoreUrl: '', playStoreUrl: 'https://play.google.com/store/apps/details?id=bad' }));
});
test('each device uses its own store, missing or unsafe store falls back to guidance', () => {
  const links = { appStoreUrl: 'https://apps.apple.com/sa/app/wafr/id123456', playStoreUrl: '' };
  assert.ok(storeForPlatform(links, 'ios')); assert.equal(storeForPlatform(links, 'android'), ''); assert.equal(storeForPlatform(links, 'other'), ''); assert.equal(storeForPlatform({ ...links, appStoreUrl: 'https://evil.test' }, 'ios'), '');
});
