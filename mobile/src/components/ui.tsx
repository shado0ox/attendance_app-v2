import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Switch,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
export const colors = {
  ink: "#142E36",
  brandBackground: "#102C3A",
  brandMark: "#16B8A6",
  muted: "#526970",
  accent: "#087D71",
  background: "#F6F8FA",
  surface: "#FFFFFF",
  line: "#DFE9E6",
  error: "#B33342",
  accentSoft: "#E7F3F0",
  warning: "#875309",
  warningSoft: "#FFF4DD",
  faint: "#EDF1F4",
};
export const styles = StyleSheet.create({
  text: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 26,
    textAlign: "right",
    writingDirection: "rtl",
  },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 23,
    lineHeight: 32,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "right",
    writingDirection: "rtl",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  input: {
    backgroundColor: "#F4F8F7",
    borderColor: "#CDDDDA",
    borderWidth: 1,
    borderRadius: 13,
    minHeight: 52,
    padding: 14,
    fontSize: 17,
    color: colors.ink,
    textAlign: "right",
  },
});
export const Body = ({
  children,
  muted = false,
}: React.PropsWithChildren<{ muted?: boolean }>) => (
  <Text selectable style={muted ? styles.subtitle : styles.text}>
    {children}
  </Text>
);
export const Title = ({ children }: React.PropsWithChildren) => (
  <Text style={styles.title}>{children}</Text>
);
export const Card = ({ children }: React.PropsWithChildren) => (
  <View style={styles.card}>{children}</View>
);
export function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => ({ minHeight: 52, paddingVertical: 13, paddingHorizontal: 18,
        borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
        borderColor: secondary ? colors.line : colors.accent,
        backgroundColor: secondary ? colors.surface : colors.accent, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
      <Text style={[styles.text, { fontWeight: '600', textAlign: 'center', color: secondary ? colors.ink : '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}
export function SettingToggle({ label, detail, value, disabled = false, onChange }: {
  label: string; detail?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void;
}) {
  return <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 16, paddingVertical: 12 }}>
    <View style={{ flex: 1, minWidth: 0 }}><Body>{label}</Body>{detail ? <Body muted>{detail}</Body> : null}</View>
    <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange}
      trackColor={{ true: colors.accent, false: '#CCD7D6' }} />
  </View>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Body>{label}</Body>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function ErrorNote({ error }: { error: unknown }) {
  return error ? (
    <Text
      accessibilityRole="alert"
      selectable
      style={[styles.text, { color: colors.error }]}
    >
      {error instanceof Error ? error.message : String(error)}
    </Text>
  ) : null;
}
export function Page({
  children,
  refresh,
  refreshing = false,
  topInset = false,
  header,
  scrollKey,
  gap = 20,
}: React.PropsWithChildren<{
  refresh?: () => void;
  refreshing?: boolean;
  topInset?: boolean;
  header?: React.ReactNode;
  scrollKey?: string;
  gap?: number;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView key={scrollKey}
        contentInsetAdjustmentBehavior={topInset ? "never" : "automatic"}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingTop: 20 + (topInset ? insets.top : 0),
          paddingBottom: Math.max(insets.bottom, 20) + 100,
          width: "100%",
          maxWidth: 700,
          alignSelf: "center",
          gap,
        }}
        refreshControl={
          refresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accent}
            />
          ) : undefined
        }
      >
        {header}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function QueryState({
  query,
  children,
}: React.PropsWithChildren<{
  query: {
    isPending: boolean;
    error: Error | null;
    data: unknown;
    refetch: () => unknown;
  };
}>) {
  if (query.isPending)
    return (
      <View style={{ padding: 40, gap: 12 }}>
        <ActivityIndicator color={colors.accent} />
        <Body muted>جاري تحميل بياناتك…</Body>
      </View>
    );
  if (!query.data)
    return (
      <Card>
        <ErrorNote error={query.error} />
        <Action
          label="إعادة المحاولة"
          onPress={() => {
            void query.refetch();
          }}
        />
      </Card>
    );
  return (
    <>
      {query.error && <ErrorNote error={query.error} />}
      {children}
    </>
  );
}
export function useTask() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const locked = React.useRef(false);
  return {
    busy,
    error,
    run: async (task: () => Promise<void>) => {
      if (locked.current) return;
      locked.current = true;
      setBusy(true);
      setError(null);
      try {
        await task();
      } catch (e) {
        setError(e);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
  };
}
export const confirm = (title: string, message: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "إلغاء", style: "cancel", onPress: () => resolve(false) },
        { text: "تأكيد", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
