import * as Location from 'expo-location';
import { isDevice } from 'expo-device';
import { usableFix, locationMessage } from './locationFix';
/** A bounded retry for transient CoreLocation locationUnknown. Never submit cached/stale GPS. */
export async function punchPosition(): Promise<Location.LocationObject> {
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('شغّل خدمة الموقع من إعدادات الهاتف ثم أعد المحاولة');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const locate = async () => {
      let fix: Location.LocationObject;
      try { fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); }
      catch { fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); }
      if (!usableFix(fix)) throw new Error('INVALID_FIX');
      return fix;
    };
    return await Promise.race([locate(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'WAFR_GPS_TIMEOUT' })), 30000);
    })]);
  } catch (error) { throw new Error(locationMessage(error, !isDevice)); }
  finally { clearTimeout(timer); }
}
