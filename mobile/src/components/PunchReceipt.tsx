import React from 'react';
import { Text, View } from 'react-native';
import { Action, Body, Card, colors, styles, Title } from './ui';
import { Icon } from './Icon';
import { clock, displayDate } from '../lib/dates';
import { duration, periodMetrics, timestamp } from '../lib/attendancePresentation';
import type { Attendance } from '../lib/types';
export type Receipt = { record: Attendance; period: number; field: string; dayMinutes: number | null; reportPending: boolean; reportLoading?: boolean };
export function PunchReceipt({ receipt, onDone, onHistory }: { receipt: Receipt; onDone: () => void; onHistory: () => void }) {
  const savedTime = timestamp(receipt.period === 2 ? receipt.record.checkOutTs2 || receipt.record.checkInTs2 : receipt.record.checkOutTs || receipt.record.checkInTs) || 0;
  const metrics = periodMetrics(receipt.record, receipt.period, undefined, savedTime);
  const out = receipt.field.startsWith('checkOut');
  const location = receipt.period === 2 ? (out ? receipt.record.checkOutLocation2 : receipt.record.checkInLocation2) : (out ? receipt.record.checkOutLocation : receipt.record.checkInLocation);
  const rows = [['وقت الدخول', metrics.start ? clock(metrics.start) : (receipt.period === 2 ? receipt.record.checkIn2 : receipt.record.checkIn) || '—'],
    ...(out ? [['وقت الانصراف', metrics.end ? clock(metrics.end) : (receipt.period === 2 ? receipt.record.checkOut2 : receipt.record.checkOut) || '—'], ['مدة الفترة المسجلة', duration(metrics.elapsed)], ['الاستراحة المنتهية', duration(metrics.breakMinutes)], ['إجمالي اليوم في السجل', duration(receipt.dayMinutes)]] : []),
    ['موقع البصمة المحفوظ', location || 'غير متاح']];
  return <View style={{ gap: 24, paddingTop: 20 }}>
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={{ width: 88, height: 88, backgroundColor: colors.accentSoft, borderRadius: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={40} color={colors.accent}/></View>
      <Title>{out ? 'تم تسجيل الانصراف' : 'تم تسجيل الحضور'}</Title>
      <Body muted>{displayDate(receipt.record.date)} · الفترة {receipt.period}</Body>
    </View>
    <Card>{rows.map(([label,value]) => <View key={label} style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 8 }}>
      <Text style={[styles.subtitle, { flex: 1 }]}>{label}</Text><Text style={[styles.text, { flex: 1, fontWeight: '600', textAlign: 'left' }]}>{value}</Text>
    </View>)}</Card>
    {out && <Body muted>مدة الاستراحة معروضة منفصلة. إجمالي اليوم يتبع طريقة احتساب كشف الحضور بالشركة.</Body>}
    {receipt.reportLoading && <Body muted>جاري تحميل إجمالي اليوم من كشف الحضور…</Body>}
    {!receipt.reportLoading && receipt.reportPending && <Body muted>تم حفظ البصمة. تعذر تحميل إجمالي اليوم الآن؛ يمكنك تحديث سجل الحضور للاطلاع عليه.</Body>}
    <Action label="تم" onPress={onDone}/><Action secondary label="عرض سجل اليوم" onPress={onHistory}/>
  </View>;
}
