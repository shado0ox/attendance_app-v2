import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { colors } from './ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);
export const LAUNCH_DURATION = 850;
const arc = 'M720 274 A320 320 0 1 0 830 540';
const hands = 'M492 344 V516 L612 580';
const check = 'M658 370 L730 440 L868 300';

/** Vector tracing of the existing app icon: clock arc, hands and approval tick. */
function MotionLogo({ animate }: { animate: boolean }) {
  const progress = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(progress);
    if (animate) { progress.value = 0; progress.value = withTiming(1, { duration: LAUNCH_DURATION }); }
    else progress.value = 1;
    return () => cancelAnimation(progress);
  }, [animate, progress]);
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: 2000 * (1 - Math.min(1, progress.value / 0.55)) }));
  const handsProps = useAnimatedProps(() => ({ strokeDashoffset: 350 * (1 - Math.max(0, Math.min(1, (progress.value - 0.2) / 0.45))) }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: 300 * (1 - Math.max(0, Math.min(1, (progress.value - 0.6) / 0.4))) }));
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.96 + 0.04 * progress.value }] }));
  return <Animated.View style={style} accessible={false} importantForAccessibility="no-hide-descendants">
    <Svg width={160} height={160} viewBox="0 0 1024 1024" fill="none" stroke={colors.brandMark} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      <Path d={arc} strokeWidth={84} opacity={0.12}/><Path d={hands} strokeWidth={68} opacity={0.12}/><Path d={check} strokeWidth={72} opacity={0.12}/>
      <AnimatedPath d={arc} strokeWidth={84} strokeDasharray="2000 2000" animatedProps={arcProps}/>
      <AnimatedPath d={hands} strokeWidth={68} strokeDasharray="350 350" animatedProps={handsProps}/>
      <AnimatedPath d={check} strokeWidth={72} strokeDasharray="300 300" animatedProps={checkProps}/>
    </Svg>
  </Animated.View>;
}

/** One short cold-launch sequence; no server request or artificial wait after it. */
export function AppLaunch({ children }: React.PropsWithChildren) {
  const motion = useMotionPreferences();
  const [laidOut, setLaidOut] = useState(false), [finished, setFinished] = useState(false);
  const revealed = useRef(false);
  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    // Hide the native static launch frame only after its matching native view exists.
    setLaidOut(true);
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!laidOut || !motion.ready || finished) return;
    const timer = setTimeout(() => setFinished(true), motion.reduced ? 0 : LAUNCH_DURATION);
    return () => clearTimeout(timer);
  }, [laidOut, motion.ready, motion.reduced, finished]);
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style={finished ? 'dark' : 'light'}/>
    <View style={{ flex: 1 }} aria-hidden={!finished} accessibilityElementsHidden={!finished} importantForAccessibility={finished ? 'auto' : 'no-hide-descendants'} pointerEvents={finished ? 'auto' : 'none'}>{children}</View>
    {!finished && <View onLayout={reveal} style={[StyleSheet.absoluteFill, { backgroundColor: colors.brandBackground, alignItems: 'center', justifyContent: 'center' }]} accessibilityViewIsModal accessibilityLabel="وفر دوام، جارٍ فتح التطبيق" accessibilityRole="progressbar">
      <MotionLogo animate={laidOut && motion.ready && !motion.reduced && motion.foreground}/>
    </View>}
  </View>;
}
