import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Bootstrap } from './types';
import { arrivalReminder, type ArrivalState } from './arrivalPolicy';
const TASK = 'wafr-arrival-reminder-v1';
const KEY = 'wafr.native.arrival.v1';
const PREFERENCE = 'wafr.native.arrival.enabled.v1';
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
let queue = Promise.resolve();
const serial = <T,>(run: () => Promise<T>): Promise<T> => {
  const next = queue.then(run); queue = next.then(() => undefined, () => undefined); return next;
};
async function read(): Promise<ArrivalState | null> {
  const text = await SecureStore.getItemAsync(KEY);
  return text ? JSON.parse(text) : null;
}
TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(TASK, async ({ data, error }) => {
  if (error || !data || data.eventType !== Location.GeofencingEventType.Enter) return;
  await serial(async () => {
    const state = await read();
    if (state && Date.now() >= state.validUntil) {
      await SecureStore.deleteItemAsync(KEY);
      if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
      return;
    }
    const key = arrivalReminder(state, data.region.identifier || '', Date.now());
    if (!key || !state) return;
    // Record before delivery: multiple callbacks cannot produce duplicate reminders.
    state.delivered.push(key);
    await SecureStore.setItemAsync(KEY, JSON.stringify(state), options);
    await Notifications.scheduleNotificationAsync({ content: { title: 'تذكير بتسجيل الحضور', body: 'أنت بالقرب من موقع العمل. افتح وفر دوام لتأكيد تسجيل الحضور.', sound: 'default' }, trigger: null });
  });
});
export async function stopArrivalReminders() {
  return serial(async () => {
    await SecureStore.deleteItemAsync(PREFERENCE);
    await SecureStore.deleteItemAsync(KEY);
    if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
  });
}
export async function arrivalEnabled() {
  return !!await SecureStore.getItemAsync(PREFERENCE);
}
export async function syncArrivalReminders(data: Bootstrap, scope: string, enable = false, isCurrent?: () => boolean) {
  return serial(async () => {
    if (isCurrent && !isCurrent()) throw new Error("تغير الحساب؛ افتح إعدادات الموقع من حسابك الحالي");
    const previous = await read();
    if (!enable && await SecureStore.getItemAsync(PREFERENCE) !== scope) return;
    if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') {
      await SecureStore.deleteItemAsync(KEY);
      if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
      await SecureStore.deleteItemAsync(PREFERENCE);
      if (enable) throw new Error('اسمح باستخدام الموقع دائمًا من إعدادات الهاتف');
      return;
    }
    const sites = (data.attendanceLocations || []).slice(0, 20);
    if (!sites.length) {
      await SecureStore.deleteItemAsync(KEY);
      if (await Location.hasStartedGeofencingAsync(TASK)) await Location.stopGeofencingAsync(TASK);
      await SecureStore.deleteItemAsync(PREFERENCE);
      if (enable) throw new Error('لا توجد مواقع حضور معتمدة لحسابك. اطلب من الإدارة تحديد موقع العمل.');
      return;
    }
    const plans = (data.punchPlans || []).filter(p => p.start + 3600000 > Date.now() && p.start < Date.now() + 86400000).map(p => ({
      ...p, key: `${p.date}:${p.period}`, checkedIn: !!data.records.find(r => r.date === p.date)?.[p.period === 2 ? 'checkIn2' : 'checkIn'],
    }));
    const regions = sites.map(s => ({ identifier: String(s.id), latitude: s.lat, longitude: s.lng, radius: Math.max(100, s.radius), notifyOnEnter: true, notifyOnExit: false }));
    const regionSignature = JSON.stringify(regions);
    const state: ArrivalState = { scope, regionSignature, regionIds: sites.map(s => String(s.id)), plans,
      validUntil: Math.min(Date.now() + 86400000, Math.max(Date.now() + 60000, ...plans.map(p => p.start + 3600000))),
      delivered: previous?.scope === scope ? previous.delivered.filter(key => plans.some(p => p.key === key)) : [] };
    await SecureStore.setItemAsync(KEY, JSON.stringify(state), options);
    try {
      if (previous?.regionSignature !== regionSignature || !await Location.hasStartedGeofencingAsync(TASK)) await Location.startGeofencingAsync(TASK, regions);
      await SecureStore.setItemAsync(PREFERENCE, scope, options);
    } catch (error) {
      await SecureStore.deleteItemAsync(KEY);
      throw error;
    }
  });
}
export async function enableArrivalReminders(data: Bootstrap, scope: string, isCurrent: () => boolean) {
  if (!(await TaskManager.isAvailableAsync())) throw new Error('تذكير الوصول يحتاج نسخة التطبيق الأصلية على جهاز مدعوم');
  if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') throw new Error('اسمح بالموقع أثناء الاستخدام أولًا');
  if ((await Notifications.requestPermissionsAsync()).status !== 'granted') throw new Error('اسمح بالإشعارات لإظهار تذكير الوصول');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('attendance', { name: 'تذكيرات الدوام', importance: 4 });
  if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') throw new Error('لم يُمنح إذن الخلفية. افتح إعدادات الهاتف واختر الموقع: دائمًا. إذا اخترت السماح مرة واحدة، غيّر الإذن من إعدادات الهاتف.');
  await syncArrivalReminders(data, scope, true, isCurrent);
}
