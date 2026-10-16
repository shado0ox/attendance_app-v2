import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from './ui';
export type IconName = 'person' | 'settings' | 'fingerprint' | 'clock' | 'check' | 'coffee' | 'arrow' | 'shield' | 'pin' | 'bell' | 'logout';
export function Icon({ name, size = 24, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    person: <><Circle cx="12" cy="8" r="4"/><Path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    settings: <><Path d="M10 2h4l1 3 3 1 2 4-2 2 2 2-2 4-3 1-1 3h-4l-1-3-3-1-2-4 2-2-2-2 2-4 3-1Z"/><Circle cx="12" cy="12" r="3"/></>,
    fingerprint: <><Path d="M5 9a7 7 0 0 1 14 0M3 13v-2m18 2v-2M8 19c1-3 0-5 0-8a4 4 0 0 1 8 0c0 5 1 7 2 9M12 10v5c0 3-1 5-2 7M15 22c-1-2-1-3-1-5M5 13c0 4-1 6-2 7"/></>,
    clock: <><Circle cx="12" cy="12" r="9"/><Path d="M12 7v5l3 2"/></>,
    check: <Path d="m5 12 4 4L19 6"/>,
    coffee: <><Path d="M5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5ZM17 9h2a3 3 0 1 1 0 6h-2M8 3v2m5-2v2M3 22h16"/></>,
    arrow: <Path d="m9 5 7 7-7 7"/>,
    shield: <Path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Zm-4 9 3 3 5-6"/>,
    pin: <><Path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><Circle cx="12" cy="10" r="2.5"/></>,
    bell: <><Path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3Zm4 12h4"/></>,
    logout: <><Rect x="3" y="3" width="9" height="18" rx="2"/><Path d="M9 12h12m-4-4 4 4-4 4"/></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false}>{paths[name]}</Svg>;
}
