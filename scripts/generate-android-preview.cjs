// Build-only dependency installation is isolated from the web application.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = createRequire(path.join(process.env.BUBBLEWRAP_ROOT, 'package.json'));
const { TwaManifest, TwaGenerator, ConsoleLog } = load('@bubblewrap/core');
const { ImageHelper } = load('@bubblewrap/core/dist/lib/ImageHelper');
const Jimp = load('jimp');
const projectRoot = path.resolve(__dirname, '..');
// Use the repository's reviewed icons without depending on the production server.
ImageHelper.prototype.fetchIcon = async function(url) {
  return { url, data: await Jimp.read(path.join(projectRoot, 'public/icons', url.includes('maskable') ? 'icon-maskable-512.png' : 'icon-512.png')) };
};
(async () => {
  const target = process.env.ANDROID_PREVIEW_OUTPUT;
  if (!target || !path.isAbsolute(target)) throw new Error('ANDROID_PREVIEW_OUTPUT must be an absolute output directory');
  fs.mkdirSync(target, { recursive: true });
  const manifest = TwaManifest.fromWebManifestJson(new URL('https://attendance.xshadox.com/manifest.webmanifest'), JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/manifest.json'), 'utf8')));
  manifest.packageId = 'com.xshadox.wafrdawam.preview';
  manifest.name = 'وفر دوام';
  manifest.launcherName = 'وفر دوام تجريبي';
  manifest.appVersionName = '0.1.0-preview';
  manifest.appVersionCode = 1;
  manifest.minSdkVersion = 23;
  manifest.enableNotifications = true;
  manifest.signingKey = { path: 'preview.keystore', alias: 'wafr-preview' };
  manifest.shortcuts = [];
  manifest.generatorApp = 'WAFR Dawam Preview';
  manifest.webManifestUrl = undefined;
  manifest.themeColorDark = manifest.themeColor;
  manifest.navigationColor = manifest.themeColor;
  manifest.navigationColorDark = manifest.themeColor;
  await manifest.saveToFile(path.join(target, 'twa-manifest.json'));
  await new TwaGenerator().createTwaProject(target, manifest, new ConsoleLog('WAFR'));
  const gradle = path.join(target, 'build.gradle');
  fs.writeFileSync(gradle, fs.readFileSync(gradle, 'utf8').replaceAll('jcenter()', 'mavenCentral()'));
  console.log('Generated isolated Android preview for attendance.xshadox.com');
})().catch(error => { console.error(error); process.exit(1); });
