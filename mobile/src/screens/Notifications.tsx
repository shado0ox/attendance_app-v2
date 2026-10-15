import React, { useEffect, useState } from "react";
import { Host, Switch } from "@expo/ui";
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
import {
  devicePushToken,
  storedPushToken,
  PUSH_KEY,
} from "../lib/notifications";
import * as SecureStore from "expo-secure-store";
type PushStatus = {
  configured: boolean;
  registered: boolean;
  attendance: boolean;
  departure: boolean;
};
export default function Notifications() {
  const { api } = useSession(),
    task = useTask(),
    [token, setToken] = useState("");
  const status = useApiQuery<PushStatus>(
    `/api/mobile/push/status${token ? "?token=" + encodeURIComponent(token) : ""}`,
  );
  useEffect(() => {
    void storedPushToken()
      .then((value) => setToken(value || ""))
      .catch(() => undefined);
  }, []);
  const save = async (attendance: boolean, departure: boolean) =>
    task.run(async () => {
      const value = token || (await devicePushToken());
      await SecureStore.setItemAsync(PUSH_KEY, value);
      await api("/api/mobile/push/subscription", "POST", {
        token: value,
        attendance,
        departure,
      });
      setToken(value);
      await status.refetch();
    });
  return (
    <Page>
      <Card>
        <Title>تذكيرات الدوام</Title>
        <QueryState query={status}>
          {status.data && (
            <>
              <Body>
                {status.data.registered
                  ? "الجهاز مسجل لدى السيرفر"
                  : "الجهاز غير مسجل للإشعارات"}
              </Body>
              {!status.data.configured && (
                <Body muted>
                  إرسال إشعارات الجوال غير مفعّل على السيرفر بعد. يلزم إكمال
                  إعداد مفاتيح الإرسال.
                </Body>
              )}
              <Host
                matchContents={{ vertical: true }}
                layoutDirection="rightToLeft"
              >
                <Switch
                  label="تذكير الحضور"
                  value={status.data.registered && status.data.attendance}
                  disabled={task.busy || !status.data.configured}
                  onValueChange={(value) => {
                    void save(value, status.data!.departure);
                  }}
                />
                <Switch
                  label="تذكير الانصراف"
                  value={status.data.registered && status.data.departure}
                  disabled={task.busy || !status.data.configured}
                  onValueChange={(value) => {
                    void save(status.data!.attendance, value);
                  }}
                />
              </Host>
              <Body muted>
                يتكرر تذكير الحضور كل 10 دقائق خلال أول ساعة من بداية الفترة،
                ويتوقف عند تسجيل الحضور. تذكير الانصراف يتكرر خلال أول ساعة من
                نهاية الفترة ويقف بعد تسجيل الانصراف.
              </Body>
              <Action
                label="ربط أو تجديد إشعارات هذا الهاتف"
                disabled={task.busy || !status.data.configured}
                onPress={() => {
                  void save(true, true);
                }}
              />
              {status.data.registered && (
                <Action
                  secondary
                  label="إيقاف إشعارات هذا الهاتف"
                  disabled={task.busy}
                  onPress={() => {
                    void task.run(async () => {
                      await api("/api/mobile/push/subscription", "DELETE", {
                        token,
                      });
                      await SecureStore.deleteItemAsync(PUSH_KEY);
                      setToken("");
                      await status.refetch();
                    });
                  }}
                />
              )}
            </>
          )}
        </QueryState>
        <ErrorNote error={task.error} />
        <Body muted>
          وصول الإشعار يعتمد على إذن النظام واتصال الهاتف وإعدادات Apple
          وFirebase. تسجيل الجهاز لا يؤكد وصول الإشعارات.
        </Body>
      </Card>
    </Page>
  );
}
