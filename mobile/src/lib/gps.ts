import * as Location from "expo-location";
/** A GPS provider may never return indoors. Timing out never schedules a later punch. */
export async function punchPosition(): Promise<Location.LocationObject> {
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("شغّل خدمة الموقع من إعدادات الهاتف ثم أعد المحاولة");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "لم يصل موقع دقيق خلال 30 ثانية. تأكد من GPS واقترب من نافذة ثم أعد المحاولة.",
              ),
            ),
          30000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
