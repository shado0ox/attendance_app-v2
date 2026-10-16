import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const plist = require('@expo/plist').default;
const { verifyProject, verifyBundle } = require('../scripts/verify-ios-config.cjs');
const privacy = JSON.parse(readFileSync(new URL('../config/privacy-manifest.json', import.meta.url), 'utf8'));
const expected = { version: '1.0.0', build: '2', bundleId: 'com.xshadox.wafrdawam', minimum: '16.4', domains: ['webcredentials:attendance.xshadox.com'], privacy };
const put = (path: string, value: unknown) => writeFileSync(path, plist.build(value));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wafr-ios-config-'));
  const app = join(root, 'ios/App');
  mkdirSync(join(app, 'Supporting'), { recursive: true });
  mkdirSync(join(root, 'ios/App.xcodeproj'));
  const info = { CFBundleShortVersionString: '1.0.0', CFBundleVersion: '2', NSLocationWhenInUseUsageDescription: 'التحقق من موقع العمل عند تسجيل البصمة', NSPhotoLibraryUsageDescription: 'اختيار صورة الملف الشخصي', NSFaceIDUsageDescription: 'تأكيد هوية الموظف', NSLocationTemporaryUsageDescriptionDictionary: { ExpoLocationFullAccuracy: 'التحقق من الموقع الدقيق' } };
  put(join(app, 'Info.plist'), info);
  put(join(app, 'App.entitlements'), { 'com.apple.developer.associated-domains': expected.domains, 'aps-environment': 'development' });
  put(join(app, 'PrivacyInfo.xcprivacy'), privacy);
  put(join(app, 'Supporting/Expo.plist'), { EXUpdatesEnabled: false });
  writeFileSync(join(root, 'ios/Podfile.properties.json'), JSON.stringify({ 'ios.deploymentTarget': '16.4', 'expo.location.motionActivityEnabled': 'false', 'apple.privacyManifestAggregationEnabled': 'true' }));
  const settings = 'MARKETING_VERSION = 1.0.0; CURRENT_PROJECT_VERSION = 2; PRODUCT_BUNDLE_IDENTIFIER = com.xshadox.wafrdawam; IPHONEOS_DEPLOYMENT_TARGET = 16.4; ENABLE_USER_SCRIPT_SANDBOXING = NO; CODE_SIGN_ENTITLEMENTS = App/App.entitlements;';
  const project = `// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 54; objects = {
/* Begin PBXNativeTarget section */
  AAAAAAAAAAAAAAAAAAAAAAAA /* App */ = { isa = PBXNativeTarget; name = App; productType = "com.apple.product-type.application"; buildConfigurationList = CCCCCCCCCCCCCCCCCCCCCCCC; buildPhases = (BBBBBBBBBBBBBBBBBBBBBBBB,); };
/* End PBXNativeTarget section */
/* Begin PBXResourcesBuildPhase section */
  BBBBBBBBBBBBBBBBBBBBBBBB = { isa = PBXResourcesBuildPhase; files = (111111111111111111111111 /* PrivacyInfo.xcprivacy in Resources */,); };
/* End PBXResourcesBuildPhase section */
/* Begin XCConfigurationList section */
  CCCCCCCCCCCCCCCCCCCCCCCC = { isa = XCConfigurationList; buildConfigurations = (DDDDDDDDDDDDDDDDDDDDDDDD /* Debug */, EEEEEEEEEEEEEEEEEEEEEEEE /* Release */,); defaultConfigurationName = Release; };
/* End XCConfigurationList section */
/* Begin XCBuildConfiguration section */
  DDDDDDDDDDDDDDDDDDDDDDDD = { isa = XCBuildConfiguration; name = Debug; buildSettings = { ${settings} }; };
  EEEEEEEEEEEEEEEEEEEEEEEE = { isa = XCBuildConfiguration; name = Release; buildSettings = { ${settings} }; };
/* End XCBuildConfiguration section */
/* Begin PBXProject section */
  FFFFFFFFFFFFFFFFFFFFFFFF = { isa = PBXProject; targets = (AAAAAAAAAAAAAAAAAAAAAAAA,); };
/* End PBXProject section */
}; rootObject = FFFFFFFFFFFFFFFFFFFFFFFF; }
`;
  const projectPath = join(root, 'ios/App.xcodeproj/project.pbxproj');
  writeFileSync(projectPath, project);
  return { root, app, info, project, projectPath, clean: () => rmSync(root, { recursive: true, force: true }) };
}
test('generated iOS project must have portable entitlements for both configurations', () => {
  const f = fixture();
  try {
    assert.deepEqual(verifyProject(f.root, expected).configurations, ['Debug', 'Release']);
    rmSync(join(f.app, 'App.entitlements'));
    assert.throws(() => verifyProject(f.root, expected), /Entitlements file is missing/);
  } finally { f.clean(); }
});
test('version drift in either Xcode build configuration blocks release verification', () => {
  const f = fixture();
  try {
    writeFileSync(f.projectPath, f.project.replace('CURRENT_PROJECT_VERSION = 2', 'CURRENT_PROJECT_VERSION = 1'));
    assert.throws(() => verifyProject(f.root, expected), /build mismatch/);
    writeFileSync(f.projectPath, f.project.replaceAll('MARKETING_VERSION = 1.0.0', 'MARKETING_VERSION = 1.0'));
    assert.throws(() => verifyProject(f.root, expected), /version mismatch/);
  } finally { f.clean(); }
});
test('unused background location and an empty data declaration cannot pass', () => {
  const f = fixture();
  try {
    put(join(f.app, 'Info.plist'), { ...f.info, NSLocationAlwaysUsageDescription: 'Unexpected background permission' });
    assert.throws(() => verifyProject(f.root, expected), /Unused\/misleading/);
    put(join(f.app, 'Info.plist'), f.info);
    put(join(f.app, 'PrivacyInfo.xcprivacy'), { NSPrivacyTracking: false, NSPrivacyCollectedDataTypes: [] });
    assert.throws(() => verifyProject(f.root, expected), /Privacy declaration missing/);
  } finally { f.clean(); }
});
test('built Release bundle must strip development discovery while preserving version/privacy', () => {
  const f = fixture();
  try {
    const built = { ...f.info, CFBundleIdentifier: expected.bundleId, MinimumOSVersion: '16.4' };
    put(join(f.app, 'Info.plist'), built);
    assert.equal(verifyBundle(f.app, expected).build, '2');
    put(join(f.app, 'Info.plist'), { ...built, NSLocalNetworkUsageDescription: 'شبكة التطوير' });
    assert.throws(() => verifyBundle(f.app, expected), /Release must not request/);
  } finally { f.clean(); }
});
