import "../lib/backgroundLocation";
import React from "react";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SessionProvider, useApiQuery, useSession } from "../lib/session";
import type { PasskeyStatus } from "../lib/types";
import { colors, Page, QueryState, Action, ErrorNote, useTask } from "../components/ui";
import Login from "../screens/Login";
import Security from "../screens/Security";
function Navigator() {
  const { session, ready, logout } = useSession();
  const logoutTask = useTask();
  const passkey = useApiQuery<PasskeyStatus>("/api/attendance-passkey/status");
  if (!ready)
    return (
      <Page>
        <QueryState
          query={{
            isPending: true,
            error: null,
            data: null,
            refetch: () => undefined,
          }}
        />
      </Page>
    );
  if (!session) return <Login />;
  if (!passkey.data)
    return (
      <Page topInset>
        <QueryState query={passkey} />
        <Action secondary label="تسجيل الخروج أو تبديل الحساب" disabled={logoutTask.busy}
          onPress={() => { void logoutTask.run(logout); }} />
        <ErrorNote error={logoutTask.error} />
      </Page>
    );
  if (passkey.data.required && passkey.data.approvedCount === 0)
    return <Security enforced />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "الإعدادات" }} />
      <Stack.Screen name="profile" options={{ title: "الملف الشخصي" }} />
      <Stack.Screen name="security" options={{ title: "أمان البصمة" }} />
      <Stack.Screen name="location" options={{ title: "إعدادات الموقع" }} />
      <Stack.Screen name="notifications" options={{ title: "الإشعارات" }} />
      <Stack.Screen
        name="new-request"
        options={{ title: "طلب جديد", presentation: "modal" }}
      />
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Navigator />
    </SessionProvider>
  );
}
