const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const plist = require('@expo/plist').default;
const { execFileSync } = require('node:child_process');
const xcode = require('xcode');
const { IOSConfig } = require('expo/config-plugins');

const readPlist = file => {
  const bytes = fs.readFileSync(file);
  const xml = bytes.subarray(0, 6).toString() === 'bplist'
    ? execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], { encoding: 'utf8' })
    : bytes.toString('utf8');
  return plist.parse(xml);
};
const unquote = value => String(value ?? '').replace(/^"|"$/g, '');
const arabic = value => typeof value === 'string' && /[\u0600-\u06ff]/.test(value);
function expectedConfig(root) {
  const { exp } = require('expo/config').getConfig(root, { skipSDKVersionRequirement: true });
  return { version: exp.version, build: exp.ios.buildNumber, bundleId: exp.ios.bundleIdentifier,
    domains: exp.ios.associatedDomains, privacy: exp.ios.privacyManifests,
    minimum: exp.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')[1].ios.deploymentTarget };
}
function checkPrivacy(manifest, expected) {
  assert.equal(manifest.NSPrivacyTracking, false, 'Tracking must be disabled');
  assert.deepEqual(manifest.NSPrivacyTrackingDomains || [], [], 'Tracking domains must be empty');
  assert.ok(expected?.NSPrivacyCollectedDataTypes?.length, 'App data collection must be declared');
  for (const entry of expected.NSPrivacyCollectedDataTypes) {
    const actual = manifest.NSPrivacyCollectedDataTypes?.find(item => item.NSPrivacyCollectedDataType === entry.NSPrivacyCollectedDataType);
    assert.deepEqual({ ...actual }, entry, `Privacy declaration missing or incorrect: ${entry.NSPrivacyCollectedDataType}`);
  }
}
function checkInfo(info, expected) {
  assert.equal(info.CFBundleShortVersionString, expected.version, 'Info.plist version mismatch');
  assert.equal(info.CFBundleVersion, expected.build, 'Info.plist build mismatch');
  for (const key of ['NSLocationAlwaysUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSMotionUsageDescription', 'LSMinimumSystemVersion']) assert.equal(info[key], undefined, `Unused/misleading Info.plist key: ${key}`);
  assert.ok(!(info.UIBackgroundModes || []).includes('location'), 'Background location must be disabled');
  for (const key of ['NSLocationWhenInUseUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSFaceIDUsageDescription']) assert.ok(arabic(info[key]), `${key} must explain the purpose in Arabic`);
  if (info.NSLocalNetworkUsageDescription) assert.ok(arabic(info.NSLocalNetworkUsageDescription), 'Development network permission must be Arabic');
  assert.ok(arabic(info.NSLocationTemporaryUsageDescriptionDictionary?.ExpoLocationFullAccuracy), 'Precise location permission must be Arabic');
}
function verifyProject(root, expected) {
  const ios = path.join(root, 'ios');
  const projects = fs.readdirSync(ios).filter(name => name.endsWith('.xcodeproj'));
  assert.equal(projects.length, 1, 'Expected one generated iOS application project');
  const projectName = projects[0].replace(/\.xcodeproj$/, '');
  const project = xcode.project(path.join(ios, projects[0], 'project.pbxproj'));
  project.parseSync();
  const [, target] = IOSConfig.Target.findFirstNativeTarget(project);
  const configs = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList);
  assert.ok(configs.length >= 2, 'Debug and Release configurations must exist');
  for (const [, config] of configs) {
    const settings = config.buildSettings;
    assert.equal(unquote(settings.MARKETING_VERSION), expected.version, `${config.name} version mismatch`);
    assert.equal(unquote(settings.CURRENT_PROJECT_VERSION), expected.build, `${config.name} build mismatch`);
    assert.equal(unquote(settings.PRODUCT_BUNDLE_IDENTIFIER), expected.bundleId, 'Bundle identifier mismatch');
    assert.equal(unquote(settings.IPHONEOS_DEPLOYMENT_TARGET), expected.minimum, 'Deployment target mismatch');
    assert.equal(unquote(settings.ENABLE_USER_SCRIPT_SANDBOXING), 'NO', 'Native build scripts require the configured file access');
    const relative = unquote(settings.CODE_SIGN_ENTITLEMENTS);
    assert.ok(relative && !path.isAbsolute(relative), 'Entitlements path must be portable');
    const file = path.resolve(ios, relative);
    assert.ok(file.startsWith(ios + path.sep), 'Entitlements must be inside the generated project');
    assert.ok(fs.existsSync(file), `Entitlements file is missing: ${relative}`);
    const entitlements = readPlist(file);
    assert.deepEqual(entitlements['com.apple.developer.associated-domains'], expected.domains, 'Passkey associated domains mismatch');
    assert.ok(['development', 'production'].includes(entitlements['aps-environment']), 'Push entitlement is missing');
  }
  checkInfo(readPlist(path.join(ios, projectName, 'Info.plist')), expected);
  checkPrivacy(readPlist(path.join(ios, projectName, 'PrivacyInfo.xcprivacy')), expected.privacy);
  assert.ok(JSON.stringify(project.hash.project.objects.PBXResourcesBuildPhase).includes('PrivacyInfo.xcprivacy'), 'Privacy manifest must be included in bundle resources');
  const properties = JSON.parse(fs.readFileSync(path.join(ios, 'Podfile.properties.json'), 'utf8'));
  assert.equal(properties['ios.deploymentTarget'], expected.minimum);
  assert.equal(properties['expo.location.motionActivityEnabled'], 'false');
  assert.equal(properties['apple.privacyManifestAggregationEnabled'], 'true');
  const updates = readPlist(path.join(ios, projectName, 'Supporting', 'Expo.plist'));
  assert.equal(updates.EXUpdatesEnabled, false, 'This release uses store-distributed updates');
  return { projectName, configurations: configs.map(([, config]) => config.name), minimum: expected.minimum, version: expected.version, build: expected.build };
}
function verifyBundle(bundle, expected) {
  const info = readPlist(path.join(bundle, 'Info.plist'));
  checkInfo(info, expected);
  assert.equal(info.CFBundleIdentifier, expected.bundleId);
  assert.equal(info.MinimumOSVersion, expected.minimum, 'Built minimum iOS version mismatch');
  assert.equal(info.NSLocalNetworkUsageDescription, undefined, 'Release must not request development network access');
  assert.equal(info.NSBonjourServices, undefined, 'Release must not advertise development discovery');
  assert.equal(info.NSAppTransportSecurity?.NSAllowsLocalNetworking, undefined, 'Release must not need a local-network exception');
  checkPrivacy(readPlist(path.join(bundle, 'PrivacyInfo.xcprivacy')), expected.privacy);
  return { bundle: path.basename(bundle), version: info.CFBundleShortVersionString, build: info.CFBundleVersion, minimum: info.MinimumOSVersion };
}
module.exports = { verifyProject, verifyBundle, checkInfo, checkPrivacy };
if (require.main === module) {
  const expected = expectedConfig(process.cwd());
  console.log(JSON.stringify(process.argv[2] === '--bundle' ? verifyBundle(process.argv[3], expected) : verifyProject(process.cwd(), expected), null, 2));
}
