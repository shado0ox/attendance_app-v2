import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { isDevice } from 'expo-device';
import { Page, Card, Title, Body, Action, SettingToggle, ErrorNote, useTask, QueryState, confirm } from '../components/ui';
import { useApiQuery, useSession } from '../lib/session';
import type { Bootstrap } from '../lib/types';
import { arrivalEnabled, enableArrivalReminders, stopArrivalReminders } from '../lib/backgroundLocation';
export default function LocationSettings() {
  const { session, isCurrentAccount } = useSession();
  const query = useApiQuery<Bootstrap>('/api/mobile/employee');
  const task = useTask();
  const [foreground, setForeground] = useState('جارٍ الفحص'), [background, setBackground] = useState('جارٍ الفحص'), [enabled, setEnabled] = useState(false);
  const check = useCallback(async () => {
    const [fg, bg, running] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(), arrivalEnabled()]);
    setForeground(fg.granted ? 'مسموح أثناء الاستخدام' : 'غير مسموح');
    setBackground(bg.granted ? 'مسموح دائمًا' : 'غير مسموح في الخلفية');
    setEnabled(running && bg.granted);
  }, []);
  useEffect(() => { void Promise.resolve().then(check).catch(() => undefined); const sub = AppState.addEventListener('change', s => { if (s === 'active') void check().catch(() => undefined); }); return () => sub.remove(); }, [check]);
  return <Page><Card><Title>الموقع وتذكير الوصول</Title>
    <Body>الموقع: {foreground}</Body><Body muted>الخلفية: {background}</Body>
    {!isDevice && <Body muted>أنت على محاكي. من قائمة Simulator افتح Features ← Location وحدد موقعًا للتجربة. التحقق النهائي على هاتف حقيقي.</Body>}
    <Action secondary label="السماح بالموقع أثناء الاستخدام" disabled={task.busy} onPress={() => { void task.run(async () => { await Location.requestForegroundPermissionsAsync(); await check(); }); }} />
    <QueryState query={query}><SettingToggle label="تذكير الوصول في الخلفية" value={enabled} disabled={task.busy || !query.data || !session || !!query.error || query.isFetching}
      detail="عند دخول نطاق موقع عملك خلال أول ساعة من الدوام، يصلك تذكير محلي لفتح التطبيق وتسجيل الحضور."
      onChange={value => { void task.run(async () => {
        if (value) {
          if (!await confirm('استخدام الموقع في الخلفية', 'تسمح هذه الميزة لنظام الهاتف برصد دخول نطاق مواقع العمل لتذكيرك بالحضور حتى عند إخفاء التطبيق. لا نرسل مسار تحركاتك ولا نسجل حضورًا تلقائيًا. يمكنك إيقافها في أي وقت.')) return;
          const scope = `${session!.companyId}:${session!.id}`;
          await enableArrivalReminders(query.data!, scope, () => isCurrentAccount(scope));
        } else await stopArrivalReminders();
        await check();
      }); }} /></QueryState>
    <Body muted>التذكير اختياري ولا يحتاج مفاتيح إرسال السيرفر. يعتمد على نظام الهاتف وإذن «دائمًا» والإشعارات، وقد يتأخر أو يتوقف عند إغلاق التطبيق بالقوة. افتح التطبيق يوميًا لتجديد جدول التذكير؛ لا يستمر الجدول المخزن أكثر من 24 ساعة.</Body>
    <Action secondary label="فتح إعدادات الموقع في الهاتف" onPress={() => { void task.run(() => Linking.openSettings()); }} />
    <ErrorNote error={task.error} />
  </Card></Page>;
}
