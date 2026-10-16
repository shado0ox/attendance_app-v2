import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { isDevice } from "expo-device";
import { Platform } from "react-native";
export const PUSH_KEY = "wafr.native.push.v1";
export async function devicePushToken() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw new Error(
      "خدمة الإشعارات تنتظر إعداد مشروع Expo ومفاتيح Apple وFirebase من مسؤول النظام",
    );
  if (
    Platform.OS === "android" &&
    !Constants.expoConfig?.extra?.androidPushConfigured
  )
    throw new Error(
      "ملف Firebase غير مضاف إلى هذا البناء. جهّز GOOGLE_SERVICES_JSON وأعد بناء التطبيق لتفعيل إشعارات أندرويد",
    );
  if (!isDevice) throw new Error("جرّب الإشعارات على هاتف حقيقي");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("attendance", {
      name: "تذكيرات الدوام",
      importance: 4,
      sound: "default",
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("اسمح بإشعارات وفر دوام من إعدادات الهاتف");
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
export const storedPushToken = () => SecureStore.getItemAsync(PUSH_KEY);
