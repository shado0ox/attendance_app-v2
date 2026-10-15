import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Button, Host } from "@expo/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export const colors = {
  ink: "#142E36",
  muted: "#526970",
  accent: "#087D71",
  background: "#F3F7F6",
  surface: "#FFFFFF",
  line: "#DFE9E6",
  error: "#B33342",
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
    fontSize: 26,
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
    borderRadius: 22,
    padding: 20,
    gap: 14,
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
    <Host
      matchContents={{ vertical: true }}
      seedColor={colors.accent}
      layoutDirection="rightToLeft"
    >
      <Button
        label={label}
        onPress={onPress}
        disabled={disabled}
        variant={secondary ? "outlined" : "filled"}
        style={{ paddingVertical: 10 }}
      />
    </Host>
  );
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
}: React.PropsWithChildren<{ refresh?: () => void; refreshing?: boolean }>) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 24,
          gap: 20,
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
