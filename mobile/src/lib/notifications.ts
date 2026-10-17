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
      "تذكيرات الدوام غير متاحة حاليًا. تواصل مع مسؤول الشركة.",
    );
  if (
    Platform.OS === "android" &&
    !Constants.expoConfig?.extra?.androidPushConfigured
  )
    throw new Error(
      "تذكيرات الدوام غير متاحة حاليًا. تواصل مع مسؤول الشركة.",
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
  try { return (await Notifications.getExpoPushTokenAsync({ projectId })).data; }
  catch { throw new Error("تعذر ربط تذكيرات هذا الهاتف. تأكد من اتصال الإنترنت وأعد المحاولة، أو تواصل مع مسؤول الشركة."); }
}
export const storedPushToken = () => SecureStore.getItemAsync(PUSH_KEY);
