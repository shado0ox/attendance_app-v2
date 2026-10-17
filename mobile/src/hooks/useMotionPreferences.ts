import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
/** Fail closed to still graphics until the OS accessibility preference is known. */
export function useMotionPreferences() {
  const [motion, setMotion] = useState({ ready: false, reduced: true });
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let live = true;
    const fallback = setTimeout(() => { if (live) setMotion(value => ({ ...value, ready: true })); }, 150);
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (live) setMotion({ ready: true, reduced });
    }).catch(() => { if (live) setMotion({ ready: true, reduced: true }); });
    const accessibility = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => setMotion({ ready: true, reduced }));
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { live = false; clearTimeout(fallback); accessibility.remove(); app.remove(); };
  }, []);
  return { ...motion, foreground };
}
