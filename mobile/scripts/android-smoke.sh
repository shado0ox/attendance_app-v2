#!/usr/bin/env bash
set -euo pipefail
APP_PACKAGE=com.xshadox.wafrdawam
adb install -r native-artifacts/app-release.apk
adb logcat -c
adb shell am start -W -n "$APP_PACKAGE/.MainActivity"
# Allow native modules and the bundled release JavaScript to mount.
for attempt in $(seq 1 20); do
  adb shell uiautomator dump /sdcard/wafr-ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/wafr-ui.xml native-artifacts/login.xml >/dev/null 2>&1 || true
  if python3 -c 'from pathlib import Path; import sys; p=Path("native-artifacts/login.xml"); sys.exit(0 if p.exists() and "تسجيل الدخول" in p.read_text() else 1)'; then
    break
  fi
  sleep 2
done
adb logcat -d -s AndroidRuntime:E ReactNativeJS:E > native-artifacts/runtime.log
if rg 'FATAL EXCEPTION|TypeError:|ReferenceError:' native-artifacts/runtime.log; then
  exit 1
fi
python3 -c 'from pathlib import Path; text=Path("native-artifacts/login.xml").read_text(); assert "تسجيل الدخول" in text and "كلمة المرور" in text, "Native login did not mount"'
adb shell screencap -p /sdcard/wafr-login.png
adb pull /sdcard/wafr-login.png native-artifacts/WafrDawam-Native-Login.png
