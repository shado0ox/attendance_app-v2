import { NativeTabs } from "expo-router/native-tabs";
import { colors } from "../../components/ui";
export default function Tabs() {
  return (
    <NativeTabs tintColor={colors.accent} backgroundColor={colors.surface}
      iconColor={{ default: colors.muted, selected: colors.accent }}
      labelStyle={{ default: { color: colors.muted, fontSize: 12 }, selected: { color: colors.accent, fontSize: 12, fontWeight: '600' } }}
      backBehavior="history" labelVisibilityMode="labeled" minimizeBehavior="never"
      disableTransparentOnScrollEdge>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>الرئيسية</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="attendance">
        <NativeTabs.Trigger.Icon sf="clock.fill" md="schedule" />
        <NativeTabs.Trigger.Label>سجل الحضور</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>الجدول</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="requests">
        <NativeTabs.Trigger.Icon sf="doc.text.fill" md="description" />
        <NativeTabs.Trigger.Label>الطلبات</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
