import { EmployeeHeader } from "../components/EmployeeHeader";
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
import type { Bootstrap } from "../lib/types";
import { displayDate, shiftMonth, today } from "../lib/dates";
export default function Schedule() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const query = useApiQuery<Bootstrap>(
    `/api/mobile/employee?from=${month}-01&to=${shiftMonth(month, 1)}-01`,
  );
  const schedule = query.data?.schedule.filter((item) =>
    item.date.startsWith(month),
  );
  return (
    <Page topInset header={<EmployeeHeader />}
      refresh={() => {
        void query.refetch();
      }}
      refreshing={query.isRefetching}
    >
      <View style={styles.row}>
        <Action
          secondary
          label="السابق"
          onPress={() => setMonth(shiftMonth(month, -1))}
        />
        <Title>{month}</Title>
        <Action
          secondary
          label="التالي"
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>
      <Body muted>الجدول المنشور والمعتمد من شركتك، بتوقيت الرياض.</Body>
      <QueryState query={query}>
        {schedule?.length ? (
          schedule.map((item) => (
            <Card key={item.date}>
              <Body>{displayDate(item.date)}</Body>
              <Title>
                {item.shift?.name ||
                  { OFF: "راحة", A: "غياب" }[item.shiftType] ||
                  item.shiftType}
              </Title>
              {item.shift && (
                <Body>
                  {item.shift.start} — {item.shift.end}
                </Body>
              )}
              {item.shift?.type === "double" && (
                <Body>
                  الفترة الثانية: {item.shift.start2} — {item.shift.end2}
                </Body>
              )}
              {item.note ? <Body muted>{item.note}</Body> : null}
            </Card>
          ))
        ) : (
          <Card>
            <Body>لم يُنشر جدول لك في هذا الشهر.</Body>
          </Card>
        )}
      </QueryState>
    </Page>
  );
}
