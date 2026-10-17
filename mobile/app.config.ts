import type { ExpoConfig } from "expo/config";
import privacyManifest from "./config/privacy-manifest.json";
const apiUrl =
  process.env.EXPO_PUBLIC_API_URL || "https://attendance.xshadox.com";
const host = new URL(apiUrl).hostname;
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
const config: ExpoConfig = {
  name: "وفر دوام",
  slug: "wafr-dawam",
  scheme: "wafrdawam",
  version: "1.0.0",
  updates: { enabled: false },
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "com.xshadox.wafrdawam",
    buildNumber: "5",
    supportsTablet: true,
    privacyManifests: privacyManifest,
    associatedDomains: [`webcredentials:${host}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocalNetworkUsageDescription: "تستخدم نسخة التطوير الشبكة المحلية للاتصال بخادم التطوير على جهازك.",
      NSFaceIDUsageDescription: "افتح حسابك ببصمة الجهاز وأكّد هويتك عند تسجيل الحضور.",
    },
  },
  android: {
    package: "com.xshadox.wafrdawam",
    versionCode: 6,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#087D71",
    },
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
    ],
  },
  plugins: [
    "expo-router",
    "expo-font",
    ["expo-localization", { supportsRTL: true }],
    ["expo-secure-store", { faceIDPermission: "افتح حساب الموظف ببصمة جهازك لتأمين بياناتك عند العودة إلى التطبيق." }],
    "expo-notifications",
    [
      "expo-location",
      {
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: "اسمح بالموقع دائمًا لتذكيرك محليًا بتسجيل الحضور عند الوصول إلى نطاق موقع العمل، حتى عند إخفاء التطبيق. لا يتم تسجيل حضورك تلقائيًا.",
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidMotionActivityEnabled: false,
        isAndroidForegroundServiceEnabled: false,
        locationFullAccuracyPermission: "يحتاج تسجيل الحضور والانصراف موقعًا دقيقًا للتحقق من وجودك في موقع العمل.",
        locationWhenInUsePermission:
          "يستخدم وفر دوام موقعك عند طلب تسجيل الحضور والانصراف للتحقق من موقع العمل.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "اختر صورة لملفك الشخصي.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/icon.png",
        imageWidth: 160,
        backgroundColor: "#102C3A",
      },
    ],
    ["expo-build-properties", { android: { minSdkVersion: 28 }, ios: { deploymentTarget: "16.4", privacyManifestAggregationEnabled: true } }],
    "./plugins/withNativeIosRelease.cjs",
  ],
  extra: {
    apiUrl,
    ...(googleServicesFile ? { androidPushConfigured: true } : {}),
    ...(projectId ? { eas: { projectId } } : {}),
  },
};
export default config;
