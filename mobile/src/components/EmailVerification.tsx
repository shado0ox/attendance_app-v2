import React, { useState } from "react";
import {
  Action,
  Body,
  Card,
  ErrorNote,
  Field,
  QueryState,
  Title,
  useTask,
} from "./ui";
import { useApiQuery, useSession } from "../lib/session";
type Verification = {
  email: string;
  verified: boolean;
  available: boolean;
  retryAfter: number;
};
export default function EmailVerification({
  emailDirty,
  saving,
}: {
  emailDirty: boolean;
  saving: boolean;
}) {
  const query = useApiQuery<Verification>(
      "/api/employee-profile/email-verification",
    ),
    { api } = useSession(),
    task = useTask();
  const [code, setCode] = useState(""),
    [message, setMessage] = useState("");
  const busy = saving || task.busy;
  return (
    <Card>
      <Title>تأكيد البريد</Title>
      <QueryState query={query}>
        {query.data && (
          <>
            <Body>
              {query.data.verified ? "بريدك مؤكد" : "البريد لم يتأكد بعد"}
            </Body>
            <Body muted>
              {query.data.email || "احفظ بريدك الإلكتروني أولًا"}
            </Body>
            {emailDirty && (
              <Body muted>احفظ تعديل البريد أولًا قبل طلب أو تأكيد الرمز.</Body>
            )}
            {!query.data.available && (
              <Body muted>
                خدمة إرسال رموز البريد غير مفعّلة على السيرفر حاليًا.
              </Body>
            )}
            {!query.data.verified && (
              <>
                <Action
                  secondary
                  label={
                    query.data.retryAfter > 0
                      ? "انتظر قبل طلب رمز جديد"
                      : "طلب رمز التأكيد"
                  }
                  disabled={
                    busy ||
                    emailDirty ||
                    !query.data.available ||
                    !query.data.email ||
                    query.data.retryAfter > 0
                  }
                  onPress={() => {
                    void (async () => {
                      await task.run(async () => {
                        const result = await api<{
                          message?: string;
                          verified: boolean;
                        }>(
                          "/api/employee-profile/email-verification/send",
                          "POST",
                        );
                        setMessage(
                          result.message ||
                            (result.verified
                              ? "بريدك مؤكد بالفعل"
                              : "قُبل طلب إرسال الرمز؛ راجع بريدك والرسائل غير المرغوب فيها"),
                        );
                      });
                      await query.refetch();
                    })();
                  }}
                />
                <Field
                  label="الرمز من 6 أرقام"
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  keyboardType="number-pad"
                  editable={!busy}
                />
                <Action
                  label="تأكيد البريد"
                  disabled={busy || emailDirty || code.length !== 6}
                  onPress={() => {
                    void task.run(async () => {
                      await api(
                        "/api/employee-profile/email-verification/confirm",
                        "POST",
                        { code },
                      );
                      setCode("");
                      setMessage("تم تأكيد البريد");
                      await query.refetch();
                    });
                  }}
                />
              </>
            )}
            <Action
              secondary
              label="تحديث حالة البريد"
              disabled={busy}
              onPress={() => {
                void query.refetch();
              }}
            />
          </>
        )}
      </QueryState>
      {message ? <Body>{message}</Body> : null}
      <ErrorNote error={task.error} />
    </Card>
  );
}
