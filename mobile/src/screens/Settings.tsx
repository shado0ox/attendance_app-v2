import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Action, Body, Card, colors, confirm, ErrorNote, Page, styles, Title, useTask } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { useSession } from '../lib/session';
export default function Settings() {
  const { logout } = useSession(), task = useTask();
  const links: { label: string; detail: string; icon: IconName; route: '/security' | '/location' | '/notifications' }[] = [
    { label: 'أمان الدخول والباس كي', detail: 'Face ID وبصمة الجهاز وتأكيد الحضور', icon: 'shield', route: '/security' },
    { label: 'الموقع وتذكير الوصول', detail: 'الأذونات والتذكير الاختياري في الخلفية', icon: 'pin', route: '/location' },
    { label: 'الإشعارات', detail: 'تذكيرات الحضور والانصراف على هاتفك', icon: 'bell', route: '/notifications' },
  ];
  return <Page><Body muted>تفضيلات هذا الجهاز وأمان حساب الموظف</Body><Card>
    {links.map(item => <Pressable key={item.route} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.navigate(item.route)} style={({ pressed }) => ({ flexDirection: 'row-reverse', gap: 12, alignItems: 'center', minHeight: 72, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accentSoft }}><Icon name={item.icon} color={colors.accent}/></View>
      <View style={{ flex: 1 }}><Text style={[styles.text, { fontWeight: '600' }]}>{item.label}</Text><Body muted>{item.detail}</Body></View><Icon name="arrow" size={18} color={colors.muted}/>
    </Pressable>)}
  </Card><Card><Title>الخصوصية والحساب</Title>
    <Action secondary label="سياسة الخصوصية" onPress={() => { void task.run(async () => { const { openURL } = await import('expo-linking'); const { API_ORIGIN } = await import('../lib/api'); await openURL(API_ORIGIN + '/privacy.html'); }); }}/>
    <Action secondary label="تسجيل الخروج من الحساب" disabled={task.busy} onPress={() => { void task.run(async () => { if (await confirm('تسجيل الخروج من الحساب', 'سيتم حذف جلسة الدخول من الهاتف. هذا لا يسجل انصرافًا من الدوام. هل تريد المتابعة؟')) await logout(); }); }}/>
    <ErrorNote error={task.error}/>
  </Card></Page>;
}
