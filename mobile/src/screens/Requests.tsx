import React from "react";
import { Share } from "react-native";
import { router } from "expo-router";
import {
  Action,
  Body,
  Card,
  ErrorNote,
  Page,
  QueryState,
  Title,
  useTask,
} from "../components/ui";
import { useApiQuery, useSession } from "../lib/session";
import type { EmployeeDocument, EmployeeRequest } from "../lib/types";
import { displayDate } from "../lib/dates";
export const requestNames: Record<string, string> = {
  leave: "إجازة",
  shift_change: "تغيير شيفت",
  swap: "تبديل دوام",
  attendance_adjustment: "تصحيح بصمة",
  temporary_exit: "خروج مؤقت",
  early_exit: "انصراف مبكر",
  late_arrival: "تأخر حضور",
  absence: "إذن غياب",
};
export const statuses: Record<string, string> = {
  pending: "قيد المراجعة",
  pending_manager: "بانتظار المدير",
  employee_signed: "تم توقيع الموظف",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};
export default function Requests() {
  const query = useApiQuery<EmployeeRequest[]>("/api/requests"),
    docs = useApiQuery<EmployeeDocument[]>("/api/electronic-documents"),
    { api, refresh } = useSession(),
    task = useTask();
  return (
    <Page
      refresh={() => {
        void refresh();
      }}
      refreshing={query.isRefetching || docs.isRefetching}
    >
      <Action label="طلب جديد" onPress={() => router.push("/new-request")} />
      <ErrorNote error={task.error} />
      <Title>طلباتك</Title>
      <QueryState query={query}>
        {query.data?.length ? (
          query.data.map((item) => (
            <Card key={item.id}>
              <Title>{requestNames[item.type] || item.type}</Title>
              <Body>
                {displayDate(item.date)} ·{" "}
                {statuses[item.status] || item.status}
              </Body>
              <Body muted>{item.notes}</Body>
              {item.reviewReason && <Body>{item.reviewReason}</Body>}
            </Card>
          ))
        ) : (
          <Card>
            <Body>لا توجد طلبات سابقة.</Body>
          </Card>
        )}
      </QueryState>
      <Title>الأذونات الموقّعة</Title>
      <QueryState query={docs}>
        {docs.data?.length ? (
          docs.data.map((item) => (
            <Card key={item.id}>
              <Title>{requestNames[item.requestType] || "إذن إلكتروني"}</Title>
              <Body>
                {displayDate(item.date)} ·{" "}
                {statuses[item.status] || item.status}
              </Body>
              {item.reviewReason && <Body>{item.reviewReason}</Body>}
              {item.status === "pending_manager" && (
                <Action
                  secondary
                  label="مشاركة رابط اعتماد المدير"
                  disabled={task.busy}
                  onPress={() => {
                    void task.run(async () => {
                      const result = await api<{ url: string }>(
                        `/api/electronic-documents/${item.id}/share`,
                        "POST",
                      );
                      await Share.share({ message: result.url });
                    });
                  }}
                />
              )}
            </Card>
          ))
        ) : (
          <Card>
            <Body>لا توجد أذونات موقّعة.</Body>
          </Card>
        )}
      </QueryState>
    </Page>
  );
}
