#!/usr/bin/env python3
"""Inspect actual Android UI nodes and crash logs without optional runner tools."""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = 'com.xshadox.wafrdawam'
CRASH = re.compile(r'FATAL EXCEPTION|TypeError:|ReferenceError:|JavascriptException|Invariant Violation|Unable to load script')


def login_is_ready(path):
    try:
        nodes = list(ET.parse(path).iter('node'))
    except (OSError, ET.ParseError):
        return False
    app_nodes = [node for node in nodes if node.get('package') == PACKAGE]
    # A web wrapper or a title alone must not satisfy a native startup test.
    if any(node.get('class') == 'android.webkit.WebView' for node in app_nodes):
        return False
    fields = [node for node in app_nodes if node.get('class') == 'android.widget.EditText']
    return (
        any(node.get('password') == 'true' for node in fields)
        and any(node.get('password') == 'false' for node in fields)
        and any('وفر دوام' in node.get('text', '') for node in app_nodes)
    )


def launcher_dismiss_position(path):
    try:
        nodes = list(ET.parse(path).iter('node'))
    except (OSError, ET.ParseError):
        return None
    titles = [node.get('text', '') for node in nodes if node.get('resource-id') == 'android:id/alertTitle']
    # Recover only the emulator launcher ANR. Never dismiss our application's ANR.
    if not any(re.fullmatch(r"(?:Pixel Launcher|Launcher3|Launcher) (?:isn't responding|is not responding)", title) for title in titles):
        return None
    for node in nodes:
        if node.get('resource-id') == 'android:id/aerr_close' and node.get('package') == 'android':
            bounds = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
            if bounds:
                left, top, right, bottom = map(int, bounds.groups())
                if right > left and bottom > top:
                    return (left + right) // 2, (top + bottom) // 2
    return None


def main():
    mode, xml_path = sys.argv[1:3]
    if mode == 'launcher-dismiss':
        position = launcher_dismiss_position(xml_path)
        if position is None:
            return 1
        print(*position)
        return 0
    if mode == 'ready':
        return 0 if login_is_ready(xml_path) else 1
    if mode != 'verify' or len(sys.argv) != 4:
        raise SystemExit('Usage: check-native-login.py ready UI.xml | verify UI.xml runtime.log')
    try:
        log = Path(sys.argv[3]).read_text(encoding='utf-8')
    except OSError:
        raise SystemExit('Native runtime log was not captured')
    if CRASH.search(log):
        raise SystemExit('Native runtime crash detected; inspect runtime.log')
    if not login_is_ready(xml_path):
        raise SystemExit('Native employee login fields did not mount; inspect login.xml and screenshot')
    print('PASS: native employee login mounted with username and secure password fields; no runtime crash')
    return 0


if __name__ == '__main__':
    sys.exit(main())
