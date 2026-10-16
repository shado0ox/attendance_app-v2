import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, styles } from './ui';
import { Icon } from './Icon';
/** One subtle work indicator; no loop while hidden, unfocused, or reduced-motion is enabled. */
function WorkPulse({ active, size, color }: { active: boolean; size: number; color: string }) {
  const [reduced, setReduced] = useState(true), [foreground, setForeground] = useState(AppState.currentState === 'active');
  const pulse = useSharedValue(0);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduced(value); }).catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { live = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    cancelAnimation(pulse);
    if (active && foreground && !reduced) pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    else pulse.value = 0;
    return () => cancelAnimation(pulse);
  }, [active, foreground, reduced, pulse]);
  const animation = useAnimatedStyle(() => ({ opacity: 0.06 + pulse.value * 0.09, transform: [{ scale: 0.94 + pulse.value * 0.06 }] }));
  return <Animated.View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[{ width: size, height: size, borderRadius: size/2, position: 'absolute', backgroundColor: color }, animation]} />;
}
export function PunchCircle({ label, busy, disabled, progress, working, resting, focused, onPress, size = 248 }: {
  label: string; busy: boolean; disabled: boolean; progress: number; working: boolean; resting: boolean; focused: boolean; onPress: () => void; size?: number;
}) {
  const { fontScale } = useWindowDimensions();
  const expanded = fontScale > 1.3;
  const radius = (size-10)/2, circumference = 2*Math.PI*radius;
  const tone = resting ? colors.warning : colors.accent;
  const inner = size-42;
  return <View style={{ alignItems: 'center', justifyContent: 'center', width: size, minHeight: size, paddingBottom: expanded ? 12 : 0, alignSelf: 'center', marginVertical: 8 }}>
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <WorkPulse active={working && focused && !busy && !resting} size={size-12} color={tone} />
    <Svg pointerEvents="none" width={size} height={size} style={{ position: 'absolute', top: 0 }} accessible={false}>
      <Circle cx={size/2} cy={size/2} r={radius} stroke={colors.line} strokeWidth={4} fill="none"/>
      <Circle cx={size/2} cy={size/2} r={radius} stroke={tone} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference*(1-Math.max(0,Math.min(1,progress)))} rotation={-90} origin={`${size/2}, ${size/2}`} />
    </Svg>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={resting ? 'سجل الرجوع من الاستراحة أولًا' : 'يتحقق التطبيق من موقعك والباس كي قبل حفظ البصمة'} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ width: inner, minHeight: inner, borderRadius: inner/2, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 14,
        backgroundColor: resting ? colors.warningSoft : tone, opacity: pressed ? 0.8 : disabled && !busy && !resting ? 0.55 : 1 })}>
      {busy ? <ActivityIndicator size="large" color={colors.surface}/> : <Icon name={resting ? 'coffee' : 'fingerprint'} size={44} color={resting ? tone : colors.surface}/>}
      {!expanded && <Text style={[styles.text, { fontSize: 18, fontWeight: '700', textAlign: 'center', color: resting ? tone : colors.surface }]}>{label}</Text>}
    </Pressable>
    </View>
    {expanded && <Text style={[styles.text, { textAlign: 'center', fontWeight: '700', marginTop: 24 }]}>{label}</Text>}
  </View>;
}
