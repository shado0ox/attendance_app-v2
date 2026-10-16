import React from "react";
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
import { registerPasskey } from "../lib/passkey";
import type { PasskeyStatus } from "../lib/types";
export default function Security({ enforced = false }: { enforced?: boolean }) {
  const query = useApiQuery<PasskeyStatus>("/api/attendance-passkey/status"),
    { session, api, refresh, logout } = useSession(),
    task = useTask();
  return (
    <Page
      topInset={enforced}
      refresh={() => {
        void query.refetch();
      }}
      refreshing={query.isRefetching}
    >
      <Card>
        <Title>مفتاح البصمة</Title>
        <Body>
          تأكيد آمن بقفل جهازك. يتم التحقق من المفتاح على السيرفر، ثم يعتمد
          مسؤول الشركة المفتاح قبل استخدامه في الحضور.
        </Body>
        {enforced && (
          <Body>
            شركتك فعّلت الباس كي لحسابك. أكمل تسجيله واعتماده أول مرة للدخول إلى
            بوابتك.
          </Body>
        )}
        <QueryState query={query}>
          {query.data && (
            <>
              <Body>
                مفاتيح معتمدة: {query.data.approvedCount} · بانتظار الاعتماد:{" "}
                {query.data.pendingCount}
              </Body>
              {query.data.pendingCount > 0 && (
                <Body muted>
                  تم تسجيل مفتاحك. اطلب من الإدارة اعتماده، ثم حدّث الحالة.
                </Body>
              )}
              <Action
                label={
                  task.busy ? "جاري التسجيل…" : "تسجيل مفتاح على هذا الجهاز"
                }
                disabled={task.busy}
                onPress={() => {
                  void task.run(async () => {
                    await registerPasskey(api, session!.id);
                    await refresh();
                  });
                }}
              />
              <Action
                secondary
                label="تحديث حالة الاعتماد"
                onPress={() => {
                  void query.refetch();
                }}
              />
            </>
          )}
        </QueryState>
        <ErrorNote error={task.error} />
        {!enforced && (
          <Action secondary label="رجوع" onPress={() => router.back()} />
        )}
        <Action
          secondary
          label="تسجيل الخروج"
          disabled={task.busy}
          onPress={() => {
            void task.run(logout);
          }}
        />
      </Card>
      {enforced && (
        <Body muted>
          يحتاج الجهاز إلى قفل شاشة. المفاتيح قد تتزامن مع حساب Apple أو Google؛
          اعتماد الإدارة وسياسة الجهاز يظلان ضروريين.
        </Body>
      )}
      {enforced && <Body muted>وفر دوام</Body>}
    </Page>
  );
}
