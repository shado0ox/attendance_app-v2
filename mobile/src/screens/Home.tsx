import { syncArrivalReminders } from "../lib/backgroundLocation";
import { punchPosition } from "../lib/gps";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import * as Location from "expo-location";
import { useIsFocused } from "expo-router/react-navigation";
import {
  Action,
  Body,
  Card,
  ErrorNote,
  Page,
  QueryState,
  Title,
  confirm,
  styles,
  useTask,
} from "../components/ui";
import { useApiQuery, useSession } from "../lib/session";
import type { Bootstrap, BreakStatus } from "../lib/types";
import { clock, displayDate } from "../lib/dates";
import { nextPunch, punchLabel } from "../lib/punch";
import { router } from "expo-router";
import { punchProof } from "../lib/passkey";
export default function Home() {
  const query = useApiQuery<Bootstrap>("/api/mobile/employee"),
    breaks = useApiQuery<BreakStatus>("/api/attendance-breaks/status");
  const { api, refresh, session } = useSession(),
    task = useTask(),
    focused = useIsFocused();
  const [tick, setTick] = useState(() => Date.now()),
    [success, setSuccess] = useState("");
  const refetchHome = query.refetch,
    refetchBreaks = breaks.refetch;
  useEffect(() => {
    if (!focused) return;
    const timer = setInterval(() => setTick(Date.now()), 15000);
    const sync = setInterval(() => {
      void refetchHome();
      void refetchBreaks();
    }, 60000);
    return () => {
      clearInterval(timer);
      clearInterval(sync);
    };
  }, [focused, refetchHome, refetchBreaks]);
  const data = query.data,
    now = (data?.serverNow || tick) + Math.max(0, tick - query.dataUpdatedAt),
    todayAssignment = data?.schedule.find((entry) => entry.date === data.today),
    currentBreak = breaks.data?.entries.find((entry) => !entry.endedAt);
  useEffect(() => {
    if (data && session) void syncArrivalReminders(data, `${session.companyId}:${session.id}`).catch(() => undefined);
  }, [data, session]);
  const punch = data
    ? nextPunch(
        data.records,
        data.today,
        todayAssignment?.shift?.type === "double",
        now,
        data.punchPlans,
      )
    : null;
  const assignment = data?.schedule.find(entry => entry.date === (punch?.record?.date || data.today)) || todayAssignment;
  const perform = async () => {
    if (!punch || task.busy) return;
    if (
      punch.field.startsWith("checkOut") &&
      !(await confirm(
        "تأكيد الانصراف",
        "سيتم تسجيل وقت الانصراف الحالي على السيرفر. هل انتهى دوامك؟",
      ))
    )
      return;
    await task.run(async () => {
      setSuccess("");
      if (
        (await Location.requestForegroundPermissionsAsync()).status !==
        "granted"
      )
        throw new Error(
          "اسمح باستخدام الموقع أثناء تشغيل التطبيق لتسجيل البصمة",
        );
      const fix = await punchPosition();
      if (fix.mocked) throw new Error("الموقع الوهمي غير مسموح");
      if (
        Date.now() - fix.timestamp > 60000 ||
        fix.coords.accuracy == null ||
        fix.coords.accuracy > 100
      )
        throw new Error("دقة الموقع غير كافية. اقترب من نافذة وأعد المحاولة.");
      const passkeyProof = await punchProof(api, punch.field, punch.record?.id);
      const suffix = punch.field.endsWith("2") ? "2" : "",
        base = punch.field.startsWith("checkOut") ? "checkOut" : "checkIn";
      await api("/api/attendance", "POST", {
        id: punch.record?.id,
        [punch.field]: true,
        [base + "Lat" + suffix]: fix.coords.latitude,
        [base + "Lng" + suffix]: fix.coords.longitude,
        gpsAccuracy: fix.coords.accuracy,
        gpsTimestamp: fix.timestamp,
        passkeyProof,
      });
      setSuccess("تم حفظ البصمة على السيرفر");
      await refresh();
    });
    // Refresh even on timeout: never assume a failed response means the server did not save.
    await query.refetch();
  };
  return (
    <Page
      refresh={() => {
        void refresh();
      }}
      refreshing={query.isRefetching}
    >
      <QueryState query={query}>
        {data && (
          <>
            <View style={{ gap: 6 }}>
              <Body muted>{data.companyName}</Body>
              <Body muted>أهلًا بك</Body>
              <Title>{data.employee.displayName}</Title>
              <Body muted>{displayDate(data.today)}</Body>
            </View>
            <Card>
              <View style={styles.row}>
                <Title>{data.workState.workStatusText}</Title>
                <Body>{clock(now)}</Body>
              </View>
              <Body muted>
                {assignment?.shift?.name ||
                  (assignment?.shiftType === "OFF"
                    ? "يوم راحة"
                    : "لا يوجد دوام منشور اليوم")}
              </Body>
              {assignment?.shift && (
                <Body>
                  {assignment.shift.start} — {assignment.shift.end}
                  {assignment.shift.type === "double"
                    ? ` · ${assignment.shift.start2} — ${assignment.shift.end2}`
                    : ""}
                </Body>
              )}
              {punch?.record && punch.record.date !== data.today && (
                <Body muted>هذه الفترة تتبع دوام {displayDate(punch.record.date)}</Body>
              )}
              {currentBreak && (
                <>
                  <Body>
                    العودة من الاستراحة: {clock(currentBreak.plannedEnd)}
                  </Body>
                  <Body>
                    {now > currentBreak.plannedEnd
                      ? `تأخير العودة: ${Math.ceil((now - currentBreak.plannedEnd) / 60000)} دقيقة`
                      : `متبقي ${Math.max(0, Math.ceil((currentBreak.plannedEnd - now) / 60000))} دقيقة`}
                  </Body>
                </>
              )}
              {punch && (
                <Action
                  label={
                    task.busy ? "جاري التحقق والحفظ…" : punchLabel[punch.field]
                  }
                  disabled={
                    task.busy ||
                    !!currentBreak ||
                    !!query.error ||
                    query.isFetching
                  }
                  onPress={() => {
                    void perform();
                  }}
                />
              )}
              {!punch && (
                <Body muted>
                  لا توجد بصمة جديدة متاحة. إذا كان هناك سجل مفتوح قديم، اطلب
                  تصحيحًا من الإدارة.
                </Body>
              )}
              <ErrorNote error={task.error} />
              {!!task.error && <Action secondary label="فحص إعدادات الموقع" onPress={() => router.push('/location')} /> }
              {success ? <Body>{success}</Body> : null}
              <Body muted>
                الموقع الدقيق يُطلب لتسجيل البصمة. تذكير الوصول في الخلفية اختياري من الإعدادات. وقت البصمة ومكانها واعتماد الباس
                كي يتحقق منهم السيرفر.
              </Body>
            </Card>
            <Card>
              <Title>الاستراحة</Title>
              <QueryState query={breaks}>
                {currentBreak ? (
                  <Action
                    label="رجعت من الاستراحة"
                    disabled={task.busy}
                    onPress={() => {
                      void task.run(async () => {
                        await api("/api/attendance-breaks/action", "POST", {
                          action: "end",
                          recordId: currentBreak.recordId,
                          period: currentBreak.period,
                          entryId: currentBreak.id,
                        });
                        await refresh();
                      });
                    }}
                  />
                ) : breaks.data?.plans.length ? (
                  breaks.data.plans.map((plan) => (
                    <View
                      key={`${plan.date}:${plan.period}`}
                      style={{ gap: 10 }}
                    >
                      <Body>
                        {plan.rule.name} · {plan.rule.durationMinutes} دقيقة ·
                        الفترة {plan.period}
                      </Body>
                      <Body muted>
                        {plan.rule.mode === "flexible"
                          ? "يمكنك أخذ الاستراحة أثناء الدوام حسب المدة المتاحة"
                          : plan.window
                            ? `${clock(plan.window.start)} — ${clock(plan.window.end)}`
                            : plan.issue}
                      </Body>
                      <Action
                        label="بدء الاستراحة"
                        disabled={
                          !plan.canStart ||
                          task.busy ||
                          breaks.isFetching ||
                          !!breaks.error
                        }
                        onPress={() => {
                          void task.run(async () => {
                            await api("/api/attendance-breaks/action", "POST", {
                              action: "start",
                              recordId: plan.recordId,
                              period: plan.period,
                            });
                            await refresh();
                          });
                        }}
                      />
                    </View>
                  ))
                ) : (
                  <Body muted>لا توجد استراحة مستحقة حاليًا.</Body>
                )}
              </QueryState>
            </Card>
            <Card>
              <Title>بصماتك الأخيرة</Title>
              {data.records.length ? (
                data.records.map((record) => (
                  <View key={record.id} style={{ gap: 7 }}>
                    <Body>{displayDate(record.date)}</Body>
                    <Body muted>
                      الحضور {record.checkIn || "—"} · الانصراف{" "}
                      {record.checkOut || "—"}
                    </Body>
                    {(record.checkIn2 || record.checkOut2) && (
                      <Body muted>
                        الفترة الثانية: {record.checkIn2 || "—"} —{" "}
                        {record.checkOut2 || "—"}
                      </Body>
                    )}
                  </View>
                ))
              ) : (
                <Body muted>لم تسجل بصمة حتى الآن.</Body>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </Page>
  );
}
