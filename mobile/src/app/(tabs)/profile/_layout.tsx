import { Stack } from "expo-router/stack";
import { colors } from "../../../components/ui";
export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "حسابي" }} />
    </Stack>
  );
}
