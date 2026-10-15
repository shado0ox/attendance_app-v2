import React, { useState } from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  Action,
  Body,
  Card,
  ErrorNote,
  Field,
  Page,
  QueryState,
  Title,
  confirm,
  useTask,
} from "../components/ui";
import { useApiQuery, useSession } from "../lib/session";
import type { Profile as ProfileData } from "../lib/types";
export default function Profile() {
  const query = useApiQuery<ProfileData>("/api/employee-profile");
  return (
    <Page
      refresh={() => {
        void query.refetch();
      }}
      refreshing={query.isRefetching}
    >
      <QueryState query={query}>
        {query.data && (
          <ProfileEditor key={query.data.id} profile={query.data} />
        )}
      </QueryState>
    </Page>
  );
}
function ProfileEditor({ profile }: { profile: ProfileData }) {
  const { api, refresh, logout } = useSession(),
    task = useTask();
  const [displayName, setDisplayName] = useState(profile.displayName || ""),
    [phone, setPhone] = useState(profile.phone || ""),
    [email, setEmail] = useState(profile.email || ""),
    [photo, setPhoto] = useState(profile.photoDataUrl || ""),
    [code, setCode] = useState(""),
    [message, setMessage] = useState("");
  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const ctx = ImageManipulator.manipulate(result.assets[0].uri);
    ctx.resize({ width: 512 });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.65,
      base64: true,
    });
    if (!saved.base64 || saved.base64.length > 400000)
      throw new Error("حجم الصورة كبير، اختر صورة أصغر");
    setPhoto("data:image/jpeg;base64," + saved.base64);
  };
  return (
    <>
      <Card>
        <Title>{profile.name}</Title>
        <Body muted>{profile.departmentName}</Body>
        {photo ? (
          <Image
            source={{ uri: photo }}
            accessibilityLabel="صورة الملف"
            style={{
              width: 90,
              height: 90,
              borderRadius: 45,
              alignSelf: "flex-end",
            }}
          />
        ) : null}
        <Action
          secondary
          label="تغيير صورة الملف"
          disabled={task.busy}
          onPress={() => {
            void task.run(choosePhoto);
          }}
        />
        <Field
          label="الاسم المعروض"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={100}
          editable={!task.busy}
        />
        <Field
          label="رقم الهاتف"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={30}
          editable={!task.busy}
        />
        <Field
          label="البريد الإلكتروني"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!task.busy}
        />
        <Action
          label="حفظ بياناتي"
          disabled={task.busy}
          onPress={() => {
            void task.run(async () => {
              await api("/api/employee-profile", "PATCH", {
                displayName,
                phone,
                email,
                ...(photo !== profile.photoDataUrl
                  ? { photoDataUrl: photo }
                  : {}),
              });
              setMessage("تم حفظ بياناتك");
              await refresh();
            });
          }}
        />
        <Body>{message}</Body>
        <ErrorNote error={task.error} />
      </Card>
      <Card>
        <Title>تأكيد البريد</Title>
        <Body muted>احفظ البريد أولًا، ثم اطلب رمز التأكيد.</Body>
        <Action
          secondary
          label="إرسال رمز التأكيد"
          disabled={task.busy}
          onPress={() => {
            void task.run(async () => {
              await api(
                "/api/employee-profile/email-verification/send",
                "POST",
              );
              setMessage("تم إرسال رمز التأكيد إلى بريدك");
            });
          }}
        />
        <Field
          label="الرمز من 6 أرقام"
          value={code}
          onChangeText={setCode}
          maxLength={6}
          keyboardType="number-pad"
        />
        <Action
          label="تأكيد البريد"
          disabled={task.busy || code.length !== 6}
          onPress={() => {
            void task.run(async () => {
              await api(
                "/api/employee-profile/email-verification/confirm",
                "POST",
                { code },
              );
              setCode("");
              setMessage("تم تأكيد البريد");
            });
          }}
        />
      </Card>
      <Card>
        <Action
          secondary
          label="أمان البصمة والباس كي"
          onPress={() => router.push("/security")}
        />
        <Action
          secondary
          label="إعدادات الإشعارات"
          onPress={() => router.push("/notifications")}
        />
        <Action
          secondary
          label="سياسة الخصوصية"
          onPress={() => {
            void task.run(async () => {
              const { openURL } = await import("expo-linking");
              const { API_ORIGIN } = await import("../lib/api");
              await openURL(API_ORIGIN + "/privacy.html");
            });
          }}
        />
        <View style={{ height: 6 }} />
        <Action
          secondary
          label="تسجيل الخروج"
          disabled={task.busy}
          onPress={() => {
            void task.run(async () => {
              if (
                await confirm(
                  "تسجيل الخروج",
                  "هل تريد الخروج من حساب الموظف على هذا الجهاز؟",
                )
              )
                await logout();
            });
          }}
        />
      </Card>
    </>
  );
}
