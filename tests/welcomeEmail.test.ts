import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomePayload, validEmployeeEmail, deliverWelcome } from '../src/server/welcomeEmail';
const env = { RESEND_API_KEY: 'test-only', RESEND_FROM: 'Attendance <attendance@example.com>', APP_URL: 'https://attendance.example.com' };
test('welcome validates configuration, escapes employee content, includes installation and attendance guidance without password', () => {
  const payload = welcomePayload({ name: '<img src=x>', email: 'employee@example.com', username: 'ahmed', password: 'secret-pin' } as any, 'Company & Co', env);
  assert.match(payload.html, /&lt;img src=x&gt;/);
  assert.match(payload.html, /Company &amp; Co/);
  assert.match(payload.text, /Safari/);
  assert.match(payload.text, /Chrome/);
  assert.match(payload.text, /طلب تعديل دوام/);
  assert.match(payload.text, /التثبيت وحده لا يسجل بصمة/);
  assert.ok(!JSON.stringify(payload).includes('secret-pin'));
  assert.throws(() => welcomePayload({ name: 'A', email: 'bad' }, 'C', env));
  assert.throws(() => welcomePayload({ name: 'A', email: 'a@example.com' }, 'C', { ...env, APP_URL: 'http://example.com' }));
  assert.throws(() => welcomePayload({ name: 'A', email: 'a@example.com' }, 'C', { ...env, RESEND_API_KEY: '' }));
  assert.equal(validEmployeeEmail('a@example.com\nBcc: victim@example.com'), false);
});
test('provider receives stable idempotency key, rejects errors and requires acceptance id', async () => {
  const payload = welcomePayload({ name: 'A', email: 'a@example.com' }, 'C', env);
  const fetcher = (async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal((options?.headers as any)['Idempotency-Key'], 'stable-key');
    assert.deepEqual(JSON.parse(String(options?.body)), payload);
    return new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await deliverWelcome(payload, 'stable-key', fetcher), 'provider-id');
  await assert.rejects(deliverWelcome(payload, 'key', (async () => new Response('{}', { status: 429 })) as typeof fetch), /مشغولة/);
  await assert.rejects(deliverWelcome(payload, 'key', (async () => new Response('{}')) as typeof fetch), /لم تؤكد/);
});
