import { TabTransition } from "../../../components/TabTransition";
import { Stack } from "expo-router/stack";
import { colors } from "../../../components/ui";
export default function Layout() {
  return (
    <TabTransition><Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "الرئيسية" }} />
    </Stack></TabTransition>
  );
}
