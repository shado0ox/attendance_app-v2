// Explicit Node test preload only; this module is never imported by production code.
import { appendFileSync } from 'node:fs';
const originalFetch = globalThis.fetch;
if (!process.env.ATTENDANCE_TEST_EMAIL_CAPTURE) throw new Error('Missing test capture file');
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url || String(input);
  if (url !== 'https://api.resend.com/emails') return originalFetch(input, init);
  const payload = JSON.parse(init.body);
  appendFileSync(process.env.ATTENDANCE_TEST_EMAIL_CAPTURE, JSON.stringify({ payload, idempotencyKey: new Headers(init.headers).get('Idempotency-Key') }) + '\n');
  await new Promise(resolve => setTimeout(resolve, 80));
  return Response.json(payload.to[0].startsWith('fail@') ? { error: 'mock provider uncertainty' } : { id: 'mock-provider-id' }, { status: payload.to[0].startsWith('fail@') ? 503 : 200 });
};
