import React, { useState } from "react";
import { View } from "react-native";
import {
  Action,
  Body,
  Card,
  Page,
  QueryState,
  Title,
  styles,
} from "../components/ui";
import { useApiQuery } from "../lib/session";
import type { History } from "../lib/types";
import { clock, displayDate, shiftMonth, today } from "../lib/dates";
export default function Attendance() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const query = useApiQuery<History>(`/api/employee-attendance?month=${month}`);
  return (
    <Page
      refresh={() => {
        void query.refetch();
      }}
      refreshing={query.isRefetching}
    >
      <View style={styles.row}>
        <Action
          label="السابق"
          secondary
          onPress={() => setMonth(shiftMonth(month, -1))}
        />
        <Title>{month}</Title>
        <Action
          label="التالي"
          secondary
          disabled={month >= today().slice(0, 7)}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>
      <QueryState query={query}>
        {query.data && (
          <>
            <Card>
              <Title>
                {Math.floor(query.data.totalMinutes / 60)} ساعة و
                {query.data.totalMinutes % 60} دقيقة
              </Title>
              <Body muted>
                إجمالي العمل المسجل · تأخير {query.data.lateDays} يوم · غياب{" "}
                {query.data.absentDays} يوم
              </Body>
            </Card>
            {query.data.items.length ? (
              query.data.items.map((item) => (
                <Card key={item.date}>
                  <Body>{displayDate(item.date)}</Body>
                  <View style={styles.row}>
                    <Body>
                      دخول {item.first ? clock(item.first.time) : "—"}
                    </Body>
                    <Body>خروج {item.last ? clock(item.last.time) : "—"}</Body>
                  </View>
                  <Body muted>
                    {item.absent
                      ? "غياب"
                      : item.needsReview
                        ? "يحتاج مراجعة"
                        : item.status}{" "}
                    · {item.minutes ?? "—"} دقيقة
                  </Body>
                  {item.lateMinutes > 0 && (
                    <Body>تأخير الحضور: {item.lateMinutes} دقيقة</Body>
                  )}
                  <Body muted>{item.first?.location || ""}</Body>
                </Card>
              ))
            ) : (
              <Card>
                <Body>لا توجد سجلات لهذا الشهر.</Body>
              </Card>
            )}
          </>
        )}
      </QueryState>
    </Page>
  );
}
