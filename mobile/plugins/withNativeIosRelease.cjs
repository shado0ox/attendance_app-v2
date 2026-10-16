const { IOSConfig, withInfoPlist, withEntitlementsPlist, withXcodeProject } = require('expo/config-plugins');

const PHASE = '[Wafr] Remove development network permissions';
const stripDevelopmentPermissions = `# Keep local discovery only in builds compiled with DEBUG.
case " $SWIFT_ACTIVE_COMPILATION_CONDITIONS " in
  *" DEBUG "*) exit 0 ;;
esac
PLIST_PATH="\${TARGET_BUILD_DIR}/\${INFOPLIST_PATH}"
if [ -f "$PLIST_PATH" ]; then
  /usr/libexec/PlistBuddy -c "Delete :NSBonjourServices" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :NSLocalNetworkUsageDescription" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :NSAppTransportSecurity:NSAllowsLocalNetworking" "$PLIST_PATH" 2>/dev/null || true
fi
`;

module.exports = function withNativeIosRelease(config) {
  config = withInfoPlist(config, (mod) => {
    // The app only reads GPS on a deliberate punch. No motion/background location APIs.
    for (const key of ['NSLocationAlwaysUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSMotionUsageDescription', 'LSMinimumSystemVersion']) delete mod.modResults[key];
    if (Array.isArray(mod.modResults.UIBackgroundModes)) mod.modResults.UIBackgroundModes = mod.modResults.UIBackgroundModes.filter(mode => mode !== 'location');
    return mod;
  });
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.associated-domains'] = mod.ios.associatedDomains;
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const [targetId, target] = IOSConfig.Target.findFirstNativeTarget(project);
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const entitlementsPath = `${projectName}/${projectName}.entitlements`;
    for (const [, entry] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList)) {
      entry.buildSettings.MARKETING_VERSION = mod.version;
      entry.buildSettings.CURRENT_PROJECT_VERSION = mod.ios.buildNumber;
      entry.buildSettings.CODE_SIGN_ENTITLEMENTS = entitlementsPath;
      entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      // SDK dependencies currently use Swift 5 mode; do not opt them into Swift 6 implicitly.
      entry.buildSettings.SWIFT_VERSION = '5.0';
    }
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const existing = Object.entries(phases).find(([key, phase]) => !key.endsWith('_comment') && phase.name === `"${PHASE}"`);
    if (!existing) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE, targetId, {
        shellPath: '/bin/sh', shellScript: stripDevelopmentPermissions,
      });
    }
    for (const [key, phase] of Object.entries(project.hash.project.objects.PBXShellScriptBuildPhase || {})) {
      if (!key.endsWith('_comment') && phase.name === `"${PHASE}"`) phase.alwaysOutOfDate = 1;
    }
    return mod;
  });
};
