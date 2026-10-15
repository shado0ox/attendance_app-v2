import React, { useState } from "react";
import { Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Action,
  Body,
  Card,
  ErrorNote,
  Field,
  Page,
  Title,
  useTask,
} from "../components/ui";
import { useSession } from "../lib/session";
export default function Login() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const { login, storageError } = useSession();
  const task = useTask();
  const insets = useSafeAreaInsets();
  return (
    <Page>
      <View style={{ paddingTop: insets.top + 24, gap: 24 }}>
        <Image
          source={require("../../assets/icon.png")}
          style={{
            width: 84,
            height: 84,
            alignSelf: "flex-end",
            borderRadius: 22,
          }}
        />
        <Title>أهلًا بك في وفر دوام</Title>
        <Body muted>بوابتك للعمل، من بداية الدوام إلى نهايته.</Body>
        <Card>
          <Title>تسجيل الدخول</Title>
          <Field
            label="اسم المستخدم أو البريد الإلكتروني"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            editable={!task.busy}
          />
          <Field
            label="كلمة المرور"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            editable={!task.busy}
          />
          <ErrorNote error={task.error || storageError} />
          <Action
            label={task.busy ? "جاري الدخول…" : "دخول"}
            disabled={task.busy || !username.trim() || !password}
            onPress={() => {
              void task.run(() => login(username, password));
            }}
          />
          <Body muted>
            استخدم حساب الموظف المسجل لدى شركتك. لو نسيت كلمة المرور، تواصل مع
            مسؤول الشركة لإعادة تعيينها.
          </Body>
        </Card>
      </View>
    </Page>
  );
}
