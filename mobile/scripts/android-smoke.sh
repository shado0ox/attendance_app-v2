#!/usr/bin/env bash
set -euo pipefail
APP_PACKAGE=com.xshadox.wafrdawam
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p native-artifacts
adb install -r native-artifacts/app-release.apk
adb logcat -c
adb shell am start -W -n "$APP_PACKAGE/.MainActivity"
launcher_recovered=false
# Wait for native input fields, independently of translated screen headings.
for ((attempt=1; attempt<=20; attempt++)); do
  rm -f native-artifacts/login.xml
  adb shell rm -f /sdcard/wafr-ui.xml || true
  adb shell uiautomator dump /sdcard/wafr-ui.xml >/dev/null 2>&1 || true
  adb pull /sdcard/wafr-ui.xml native-artifacts/login.xml >/dev/null 2>&1 || true
  if python3 "$SCRIPT_DIR/check-native-login.py" ready native-artifacts/login.xml; then
    break
  fi
  if [ "$launcher_recovered" = false ] && dismiss_position=$(python3 "$SCRIPT_DIR/check-native-login.py" launcher-dismiss native-artifacts/login.xml); then
    cp native-artifacts/login.xml native-artifacts/launcher-anr.xml
    read -r tap_x tap_y <<< "$dismiss_position"
    echo "Closing the emulator launcher ANR dialog and reopening the employee app (one recovery only)."
    adb shell input tap "$tap_x" "$tap_y"
    adb shell am start -W -n "$APP_PACKAGE/.MainActivity"
    launcher_recovered=true
  fi
  sleep 2
done
adb logcat -d -s AndroidRuntime:E ReactNativeJS:E > native-artifacts/runtime.log
# Preserve diagnostics before checking, including when startup fails.
adb shell screencap -p /sdcard/wafr-login.png || true
adb pull /sdcard/wafr-login.png native-artifacts/WafrDawam-Native-Login.png || true
python3 "$SCRIPT_DIR/check-native-login.py" verify native-artifacts/login.xml native-artifacts/runtime.log
