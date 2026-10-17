import React, { useEffect } from 'react';
import { useIsFocused } from 'expo-router/react-navigation';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { colors } from './ui';
/** Keep each tab mounted; animate only its content, never reset its filters/scroll. */
export function TabTransition({ children }: React.PropsWithChildren) {
  const focused = useIsFocused(), motion = useMotionPreferences(), progress = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(progress);
    if (focused && motion.foreground && motion.ready && !motion.reduced) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: 160 });
    } else progress.value = 1;
    return () => cancelAnimation(progress);
  }, [focused, motion.foreground, motion.ready, motion.reduced, progress]);
  const style = useAnimatedStyle(() => ({ opacity: 0.85 + progress.value * 0.15, transform: [{ translateY: 5 * (1 - progress.value) }] }));
  return <Animated.View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</Animated.View>;
}
