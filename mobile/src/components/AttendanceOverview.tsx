import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { colors, styles } from './ui';
import { duration } from '../lib/attendancePresentation';
export function OverviewMetrics({ entry, elapsed, remaining }: { entry: string | null; elapsed: number | null; remaining: number | null }) {
  const { fontScale } = useWindowDimensions();
  const cellWidth = Math.min(220, 90 * Math.max(1, fontScale));
  return <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: colors.surface, paddingVertical: 16, paddingHorizontal: 8, rowGap: 20 }}>
    {[['دخول', entry || '—'], ['المتبقي', duration(remaining)], ['منذ الدخول', duration(elapsed)]].map(([label,value]) =>
      <View key={label} style={{ flex: 1, flexBasis: cellWidth, minWidth: Math.min(cellWidth, 160), gap: 6, alignItems: 'center', paddingHorizontal: 8 }}>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>{label}</Text>
        <Text style={[styles.text, { fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 20, textAlign: 'center', writingDirection: 'ltr' }]}>{value}</Text>
      </View>)}
  </View>;
}
export function StateBadge({ text, resting = false, inactive = false }: { text: string; resting?: boolean; inactive?: boolean }) {
  return <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', borderRadius: 20, backgroundColor: resting ? colors.warningSoft : inactive ? colors.faint : colors.accentSoft, paddingHorizontal: 16, paddingVertical: 7 }}>
    <View accessible={false} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: resting ? colors.warning : inactive ? colors.muted : colors.accent }}/>
    <Text style={[styles.subtitle, { color: resting ? colors.warning : inactive ? colors.muted : colors.accent, fontWeight: '600' }]}>{text}</Text>
  </View>;
}
