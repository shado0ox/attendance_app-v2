import React, { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Text, View, useWindowDimensions } from "react-native";
import * as Location from "expo-location";
import { useIsFocused } from "expo-router/react-navigation";
import { router } from "expo-router";
import { syncArrivalReminders } from "../lib/backgroundLocation";
import { punchPosition } from "../lib/gps";
import { Action, Body, Card, ErrorNote, Page, QueryState, Title, colors, confirm, styles, useTask } from "../components/ui";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { OverviewMetrics, StateBadge } from "../components/AttendanceOverview";
import { PunchCircle } from "../components/PunchCircle";
import { PunchReceipt, type Receipt } from "../components/PunchReceipt";
import { Icon } from "../components/Icon";
import { useApiQuery, useSession } from "../lib/session";
import type { Attendance, Bootstrap, BreakStatus, History } from "../lib/types";
import { clock, displayDate } from "../lib/dates";
import { nextPunch, punchLabel } from "../lib/punch";
import { punchProof } from "../lib/passkey";
import { activePeriod, fixSite, periodMetrics } from "../lib/attendancePresentation";

export default function Home() {
  const query = useApiQuery<Bootstrap>("/api/mobile/employee"), breaks = useApiQuery<BreakStatus>("/api/attendance-breaks/status");
  const { api, refresh, session } = useSession(), task = useTask(), focused = useIsFocused();
  const { width } = useWindowDimensions();
  const [tick, setTick] = useState(Date.now), [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [receipt, setReceipt] = useState<Receipt | null>(null), [stage, setStage] = useState('');
  const announcement = receipt ? (receipt.field.startsWith('checkOut') ? 'تم تسجيل الانصراف' : 'تم تسجيل الحضور') : '';
  useEffect(() => { if (announcement) AccessibilityInfo.announceForAccessibility(announcement); }, [announcement]);
  const [gps, setGps] = useState<{ text: string; at: number } | null>(null);
  const refetchHome = query.refetch, refetchBreaks = breaks.refetch;
  useEffect(() => {
    const app = AppState.addEventListener('change', state => { setForeground(state === 'active'); setTick(Date.now()); });
    return () => app.remove();
  }, []);
  useEffect(() => {
    if (!focused || !foreground) return;
    const timer = setInterval(() => setTick(Date.now()), 15000);
    const sync = setInterval(() => { void refetchHome(); void refetchBreaks(); }, 60000);
    return () => { clearInterval(timer); clearInterval(sync); };
  }, [focused, foreground, refetchHome, refetchBreaks]);
  const data = query.data;
  const now = data ? data.serverNow + Math.max(0, tick - query.dataUpdatedAt) : tick;
  const todayAssignment = data?.schedule.find(entry => entry.date === data.today);
  const currentBreak = breaks.data?.entries.find(entry => !entry.endedAt);
  useEffect(() => {
    if (data && session) void syncArrivalReminders(data, `${session.companyId}:${session.id}`).catch(() => undefined);
  }, [data, session]);
  const punch = data ? nextPunch(data.records, data.today, todayAssignment?.shift?.type === 'double', now, data.punchPlans) : null;
  const record = punch?.record || data?.records.find(row => row.date === data.today);
  const period = data ? activePeriod(data, record, punch?.field || (record?.checkIn2 ? 'checkOut2' : undefined)) : null;
  const metrics = periodMetrics(record, period?.period || 1, period?.plan, now);
  const assignment = data?.schedule.find(entry => entry.date === period?.date) || todayAssignment;
  const breakUnknown = !breaks.data || !!breaks.error;
  const resting = !!currentBreak || data?.workState.workStatus === 'break';
  const working = data?.workState.workStatus === 'working';
  const breakNow = breaks.data ? breaks.data.serverNow + Math.max(0, tick - breaks.dataUpdatedAt) : now;
  const openHistory = (date?: string) => router.navigate({ pathname: '/attendance', params: date ? { date } : {} });
  const perform = async () => {
    if (!punch || task.busy || resting || breakUnknown || breaks.isFetching || query.error || query.isFetching) return;
    await task.run(async () => {
      setStage('تأكيد البصمة…');
      if (punch.field.startsWith('checkOut') && !(await confirm('تأكيد الانصراف', 'سيتم تسجيل وقت الانصراف الحالي على السيرفر. هل انتهى دوامك؟'))) return;
      setStage('جاري تحديد موقعك…'); setGps(null);
      if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') throw new Error('اسمح باستخدام الموقع أثناء تشغيل التطبيق لتسجيل البصمة');
      const fix = await punchPosition();
      if (fix.mocked) throw new Error('الموقع الوهمي غير مسموح');
      if (Date.now() - fix.timestamp > 60000 || fix.coords.accuracy == null || fix.coords.accuracy > 100) throw new Error('دقة الموقع غير كافية. اقترب من نافذة وأعد المحاولة.');
      setGps({ text: fixSite({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy }, data?.attendanceLocations || []), at: fix.timestamp });
      setStage('جاري التحقق من الباس كي…');
      const passkeyProof = await punchProof(api, punch.field, punch.record?.id);
      const suffix = punch.field.endsWith('2') ? '2' : '', base = punch.field.startsWith('checkOut') ? 'checkOut' : 'checkIn';
      setStage('جاري حفظ البصمة…');
      const saved = await api<Attendance>('/api/attendance', 'POST', {
        id: punch.record?.id, [punch.field]: true, [base + 'Lat' + suffix]: fix.coords.latitude, [base + 'Lng' + suffix]: fix.coords.longitude,
        gpsAccuracy: fix.coords.accuracy, gpsTimestamp: fix.timestamp, passkeyProof,
      });
      // The receipt uses the saved server row, never the phone clock or a requested value.
      const result: Receipt = { record: saved, field: punch.field, period: suffix ? 2 : 1, dayMinutes: null, reportPending: false };
      setReceipt({ ...result, reportLoading: punch.field.startsWith('checkOut') });
      if (punch.field.startsWith('checkOut')) {
        try {
          const history = await api<History>(`/api/employee-attendance?month=${saved.date.slice(0,7)}`);
          const day = history.items.find(item => item.date === saved.date);
          result.dayMinutes = day && Number.isFinite(day.minutes) ? day.minutes : null;
          result.reportPending = result.dayMinutes === null;
        } catch { result.reportPending = true; }
      }
      setReceipt(current => current?.record.id === saved.id && current.field === punch.field ? result : current);
      // A report/refresh failure must not turn a confirmed punch into a failed punch.
      await refresh().catch(() => undefined);
    });
    // Reconcile an ambiguous timeout before allowing another attempt.
    await query.refetch(); await breaks.refetch();
  };
  const breakPanel = <Card>
        <View style={styles.row}><Title>الاستراحة</Title><Icon name="coffee" color={colors.warning}/></View>
        <QueryState query={breaks}>
          {currentBreak ? <>
            <Body>{currentBreak.name || 'الاستراحة الحالية'} · العودة {clock(currentBreak.plannedEnd)}</Body>
            <Text accessibilityLiveRegion="polite" style={[styles.text, { color: breakNow > currentBreak.plannedEnd ? colors.error : colors.warning, fontWeight: '700' }]}>{breakNow > currentBreak.plannedEnd ? `تأخير العودة: ${Math.ceil((breakNow-currentBreak.plannedEnd)/60000)} دقيقة` : `متبقي ${Math.max(0,Math.ceil((currentBreak.plannedEnd-breakNow)/60000))} دقيقة`}</Text>
            <Action label="رجعت من الاستراحة" disabled={task.busy || breaks.isFetching || !!breaks.error} onPress={() => { void task.run(async () => {
              await api('/api/attendance-breaks/action', 'POST', { action: 'end', recordId: currentBreak.recordId, period: currentBreak.period, entryId: currentBreak.id }); await refresh();
            }); }}/>
            <Body muted>سجل الرجوع من الاستراحة قبل تسجيل الانصراف.</Body>
          </> : breaks.data?.plans.length ? breaks.data.plans.map(plan => <View key={`${plan.date}:${plan.period}`} style={{ gap: 10 }}>
            <Body>{plan.rule.name} · {plan.rule.durationMinutes} دقيقة · الفترة {plan.period}</Body>
            <Body muted>{plan.rule.mode === 'flexible' ? 'يمكنك أخذ الاستراحة أثناء الدوام حسب المدة المتاحة' : plan.window ? `${clock(plan.window.start)} — ${clock(plan.window.end)}` : plan.issue}</Body>
            {!!plan.issue && plan.rule.mode === 'flexible' && <Body muted>{plan.issue}</Body>}
            <Action secondary label="بدء الاستراحة" disabled={!plan.canStart || task.busy || breaks.isFetching || !!breaks.error} onPress={() => { void task.run(async () => {
              await api('/api/attendance-breaks/action', 'POST', { action: 'start', recordId: plan.recordId, period: plan.period }); await refresh();
            }); }}/>
          </View>) : <Body muted>لا توجد استراحة مستحقة حاليًا.</Body>}
        </QueryState>
      </Card>;
  return <Page topInset gap={16} scrollKey={receipt ? `${receipt.record.id}:${receipt.field}` : 'home'} header={<EmployeeHeader />} refresh={() => { void refresh(); }} refreshing={query.isRefetching}>
    {receipt ? <PunchReceipt receipt={receipt} onDone={() => setReceipt(null)} onHistory={() => { const date = receipt.record.date; setReceipt(null); openHistory(date); }} /> : <QueryState query={query}>{data && <>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text style={[styles.title, { fontSize: 36, lineHeight: 48, fontVariant: ['tabular-nums'], textAlign: 'center' }]}>{clock(now)}</Text>
          <StateBadge text={resting ? 'في الاستراحة' : data.workState.workStatusText} resting={resting} inactive={!working && !resting}/>
        </View>
        <Body muted>{displayDate(data.today)}</Body>
        <Text style={[styles.subtitle, { textAlign: 'center' }]}>{assignment?.shift?.name || (assignment?.shiftType === 'OFF' ? 'يوم راحة' : 'لا يوجد دوام منشور اليوم')}{assignment?.shift ? ` · ${assignment.shift.start} — ${assignment.shift.end}` : ''}</Text>
        {assignment?.shift?.type === 'double' && <Body muted>الفترة الثانية: {assignment.shift.start2} — {assignment.shift.end2}</Body>}
        {record && record.date !== data.today && <Body muted>هذه الفترة تتبع دوام {displayDate(record.date)}</Body>}
      </View>
      <PunchCircle size={Math.min(224, width - 64)} label={task.busy ? stage || 'جاري التحقق…' : resting ? 'في الاستراحة' : punch ? punchLabel[punch.field] : 'لا توجد بصمة متاحة'}
        busy={task.busy} disabled={!punch || task.busy || resting || breakUnknown || breaks.isFetching || !!query.error || query.isFetching}
        working={working} resting={resting} focused={focused && foreground} progress={metrics.progress} onPress={() => { void perform(); }}/>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="pin" size={18} color={colors.muted}/><Text style={[styles.subtitle, { flexShrink: 1, textAlign: 'center' }]}>{gps && Math.max(tick,gps.at)-gps.at <= 60000 ? gps.text : 'يتم فحص موقعك عند تسجيل البصمة'}</Text>
      </View>
      <ErrorNote error={task.error}/>
      {!!task.error && <Action secondary label="فحص إعدادات الموقع" onPress={() => router.navigate('/location')}/>}
      {breakUnknown && <Card><Body muted>يلزم تحميل حالة الاستراحة قبل تسجيل البصمة.</Body><QueryState query={breaks}/>{breaks.data && <Action secondary label="تحديث حالة الاستراحة" onPress={() => { void breaks.refetch(); }}/>}</Card>}
      {!punch && <Body muted>لا توجد بصمة جديدة متاحة. إذا كان هناك سجل مفتوح قديم، اطلب تصحيحًا من الإدارة.</Body>}
      {resting && breakPanel}
      <OverviewMetrics entry={metrics.start ? clock(metrics.start) : null} elapsed={metrics.elapsed} remaining={metrics.remaining}/>
      <Body muted>حلقة التقدم توضح الوقت المنقضي من الفترة المجدولة. المدة المعروضة منذ الدخول ليست صافي ساعات العمل.</Body>
      {!resting && breakPanel}
      <Action secondary label="عرض سجل الحضور" onPress={() => openHistory()}/>
    </>}</QueryState>}
  </Page>;
}
