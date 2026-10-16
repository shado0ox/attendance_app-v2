import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('../scripts/check-native-login.py', import.meta.url));
const pkg = 'com.xshadox.wafrdawam';
const form = (title: string, password = true, packageName = pkg) => `<hierarchy>
  <node class="android.widget.TextView" package="${packageName}" text="أهلًا بك في وفر دوام" />
  <node class="android.widget.TextView" package="${packageName}" text="${title}" />
  <node class="android.widget.EditText" package="${packageName}" password="false" />
  <node class="android.widget.EditText" package="${packageName}" password="${password}" />
</hierarchy>`;
function check(xml: string | null, log: string | null = '', mode = 'verify') {
  const directory = mkdtempSync(join(tmpdir(), 'wafr-smoke-'));
  const uiPath = join(directory, 'login.xml'), logPath = join(directory, 'runtime.log');
  try {
    if (xml !== null) writeFileSync(uiPath, xml);
    if (log !== null) writeFileSync(logPath, log);
    const result = spawnSync('python3', [checker, mode, uiPath, logPath], { encoding: 'utf8' });
    assert.ifError(result.error);
    return result;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('native startup accepts both employee headings without optional ripgrep', () => {
  for (const title of ['تسجيل الدخول', 'دخول الموظف']) assert.equal(check(form(title)).status, 0);
});
test('a heading alone, missing secure input, another app or web wrapper cannot pass', () => {
  const cases = [
    '<hierarchy><node text="تسجيل الدخول كلمة المرور" /></hierarchy>',
    form('دخول الموظف', false),
    form('دخول الموظف', true, 'another.app'),
    form('دخول الموظف').replace('</hierarchy>', `<node class="android.webkit.WebView" package="${pkg}" /></hierarchy>`),
    null, '<broken',
  ];
  for (const xml of cases) assert.notEqual(check(xml).status, 0);
});
test('a mounted form cannot hide runtime crashes or missing crash diagnostics', () => {
  for (const log of ['FATAL EXCEPTION: main', 'TypeError: broken', 'ReferenceError: missing', 'JavascriptException: broken', null]) assert.notEqual(check(form('دخول الموظف'), log).status, 0);
});

test('emulator recovery targets only the launcher ANR, never the employee app', () => {
  const dialog = (name: string) => `<hierarchy><node resource-id="android:id/alertTitle" package="android" text="${name} isn't responding" /><node resource-id="android:id/aerr_close" package="android" bounds="[16,307][304,355]" /></hierarchy>`;
  const launcher = check(dialog('Pixel Launcher'), '', 'launcher-dismiss');
  assert.equal(launcher.status, 0);
  assert.equal(launcher.stdout.trim(), '160 331');
  for (const name of ['وفر دوام', 'Wafr Dawam', 'Settings']) assert.notEqual(check(dialog(name), '', 'launcher-dismiss').status, 0);
  assert.notEqual(check(form('دخول الموظف'), '', 'launcher-dismiss').status, 0);
});
