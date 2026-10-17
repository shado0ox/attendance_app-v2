import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApiQuery } from '../lib/session';
import type { Bootstrap, Profile } from '../lib/types';
import { identityImage } from '../lib/attendancePresentation';
import { colors, styles } from './ui';
import { Icon } from './Icon';
function IdentityImage({ uri, company, fallback }: { uri?: string; company?: boolean; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const source = identityImage(uri);
  return source && !failed ? <Image source={{ uri: source }} accessibilityLabel={company ? 'شعار الشركة' : 'صورة الموظف'} onError={() => setFailed(true)} resizeMode={company ? 'contain' : 'cover'} style={{ width: company ? 48 : 38, height: company ? 48 : 38, borderRadius: company ? 8 : 19 }} /> :
    <View accessibilityElementsHidden style={{ width: company ? 48 : 38, height: company ? 48 : 38, borderRadius: company ? 12 : 19, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '700', fontSize: 18, color: colors.accent }}>{fallback.trim().slice(0,1)}</Text></View>;
}
export function EmployeeIdentity({ data, profile }: { data: Bootstrap; profile?: Profile }) {
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
        <IdentityImage key={data.companyLogo || 'company'} uri={data.companyLogo} company fallback={data.companyName} />
        <Text style={[styles.text, { flex: 1, fontWeight: '700', fontSize: 15 }]}>{data.companyName}</Text>
      </View>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
        <HeaderButton name="settings" label="الإعدادات" onPress={() => router.push('/settings')} />
        <HeaderButton name="person" label="الملف الشخصي" onPress={() => router.push('/profile')} />
      </View>
    </View>
    <View style={{ flexDirection: 'row-reverse', gap: 10, alignItems: 'center' }}>
      <IdentityImage key={(profile ? profile.photoDataUrl : data.employee.photoDataUrl) || 'employee'} uri={(profile ? profile.photoDataUrl : data.employee.photoDataUrl)} fallback={profile?.displayName || data.employee.displayName} />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.subtitle, { fontSize: 12 }]}>أهلًا بك</Text><Text style={[styles.text, { fontWeight: '700', fontSize: 18 }]}>{profile?.displayName || data.employee.displayName}</Text></View>
    </View>
  </View>;
}
function HeaderButton({ name, label, onPress }: { name: 'settings' | 'person'; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: pressed ? colors.accentSoft : colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' })}><Icon name={name} size={21} /></Pressable>;
}
export function EmployeeHeader() {
  const query = useApiQuery<Bootstrap>('/api/mobile/employee');
  const profile = useApiQuery<Profile>('/api/employee-profile');
  return query.data ? <EmployeeIdentity data={query.data} profile={profile.data} /> : null;
}
