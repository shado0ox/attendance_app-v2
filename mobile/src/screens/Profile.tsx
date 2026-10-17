import EmailVerification from "../components/EmailVerification";
import React, { useState } from "react";
import { Image } from "react-native";
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
  const { api, refresh } = useSession(),
    task = useTask();
  const [displayName, setDisplayName] = useState(profile.displayName || ""),
    [phone, setPhone] = useState(profile.phone || ""),
    [email, setEmail] = useState(profile.email || ""),
    [photo, setPhoto] = useState(profile.photoDataUrl || ""),
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
      <EmailVerification
        emailDirty={
          email.trim().toLowerCase() !==
          (profile.email || "").trim().toLowerCase()
        }
        saving={task.busy}
      />

    </>
  );
}
