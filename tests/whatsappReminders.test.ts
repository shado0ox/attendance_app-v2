import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { dueWhatsAppReminders, parseWhatsAppSettings, whatsappDefaults, whatsappPhone, whatsappReady, type WhatsAppSettings } from '../src/lib/whatsappReminders';
import { encryptWhatsAppSecret, decryptWhatsAppSecret, validWhatsAppSignature, whatsappTemplatePayload, sendWhatsAppTemplate } from '../src/server/whatsappSecurity';
import { allowedAdminRoute, fullAdminAccess } from '../src/lib/adminAccess';
const date = '2026-10-10', start = Date.parse(date + 'T08:00:00+03:00'), end = start + 8 * 3600000;
const data = { employees: [{ id: 'e' }], schedule: { [date]: { e: { shiftType: 'S' } } }, shiftTypes: [{ id: 'S', name: 'الصباح', start: '08:00', end: '16:00' }] };
const settings: WhatsAppSettings = { ...whatsappDefaults(), enabled: true, mode: 'all' as const, contacts: { e: { phone: '966500000000', consent: true } } };
test('WhatsApp defaults disabled and invalid contacts/company scope rejected', () => {
  assert.equal(whatsappDefaults().enabled, false); assert.equal(whatsappPhone('+966 50-000-0000'), '966500000000'); assert.equal(whatsappPhone('0500000000'), '');
  assert.throws(() => parseWhatsAppSettings({ ...settings, employeeIds: ['foreign'] }, data.employees));
  assert.throws(() => parseWhatsAppSettings({ ...settings, interval: 1 }, data.employees));
  assert.throws(() => parseWhatsAppSettings({ ...settings, portalUrl: 'http://example.com' }, data.employees));
  assert.throws(() => parseWhatsAppSettings({ ...settings, contacts: { e: { phone: 'bad', consent: true } } }, data.employees));
  assert.equal(whatsappReady(settings, true, true, true), false);
});
test('WhatsApp attendance respects pilot selection, consent, start delay and strict first hour', () => {
  const due = (s = settings, now = start + 10 * 60000, records: any[] = [], leaves: any[] = []) => dueWhatsAppReminders(data, 'e', records, leaves, s, now);
  assert.equal(due().length, 1); assert.equal(due(settings, start + 9 * 60000).length, 0); assert.equal(due(settings, start + 3600000).length, 0);
  assert.equal(due({ ...settings, mode: 'selected', employeeIds: [] }).length, 0);
  assert.equal(due({ ...settings, contacts: { e: { phone: '966500000000', consent: false } } }).length, 0);
  assert.equal(due(settings, start + 10 * 60000, [{ empId: 'e', date, checkIn: '08:00' }]).length, 0);
  assert.equal(due(settings, start + 10 * 60000, [], [{ empId: 'e', date, status: 'approved' }]).length, 0);
  assert.equal(dueWhatsAppReminders({ ...data, _schedulePublication: { schedule: {}, shiftTypes: data.shiftTypes } }, 'e', [], [], settings, start + 10 * 60000).length, 0);
});
test('departure requires saved check-in, stops on check-out or one hour after scheduled end', () => {
  const records = [{ empId: 'e', date, checkIn: '08:00' }];
  assert.equal(dueWhatsAppReminders(data, 'e', [], [], settings, end).length, 0);
  const result = dueWhatsAppReminders(data, 'e', records, [], settings, end); assert.equal(result[0].kind, 'departure');
  assert.equal(dueWhatsAppReminders(data, 'e', [{ ...records[0], checkOut: '16:00' }], [], settings, end).length, 0);
  assert.equal(dueWhatsAppReminders(data, 'e', records, [], settings, end + 3600000).length, 0);
});
test('overnight second period uses original schedule day and its own punches', () => {
  const double = { ...data, shiftTypes: [{ id: 'S', type: 'double', start: '20:00', end: '23:00', start2: '00:30', end2: '04:00' }] };
  const records = [{ empId: 'e', date, checkIn: '20:00', checkOut: '23:00', checkIn2: '00:30' }];
  const result = dueWhatsAppReminders(double, 'e', records, [], settings, Date.parse('2026-10-11T04:10:00+03:00'));
  assert.equal(result.length, 1); assert.equal(result[0].date, date); assert.equal(result[0].period, 2); assert.equal(result[0].kind, 'departure');
});
test('secrets encrypted with tenant binding and signed raw webhook bodies', () => {
  const cipher = encryptWhatsAppSecret('token-sensitive', 'test-key', 'a:accessToken');
  assert.ok(!cipher.includes('token-sensitive')); assert.equal(decryptWhatsAppSecret(cipher, 'test-key', 'a:accessToken'), 'token-sensitive');
  assert.throws(() => decryptWhatsAppSecret(cipher, 'test-key', 'b:accessToken'));
  const raw = Buffer.from('{ "object": "whatsapp_business_account" }');
  const signature = 'sha256=' + crypto.createHmac('sha256', 'app-secret').update(raw).digest('hex');
  assert.equal(validWhatsAppSignature(raw, signature, 'app-secret'), true);
  assert.equal(validWhatsAppSignature(Buffer.from('{}'), signature, 'app-secret'), false);
  assert.equal(validWhatsAppSignature(raw, 'sha256=bad', 'app-secret'), false);
});
test('only unrestricted company settings administrator can access WhatsApp routes', () => {
  const full = fullAdminAccess(); assert.equal(allowedAdminRoute(full, 'POST', '/api/whatsapp/settings'), true);
  assert.equal(allowedAdminRoute({ ...full, departmentIds: ['d'] }, 'GET', '/api/whatsapp/logs'), false);
  assert.equal(allowedAdminRoute({ ...full, permissions: { ...full.permissions, canManageSettings: false } }, 'POST', '/api/whatsapp/test'), false);
});
test('Cloud API uses approved templates with three body parameters and sanitized errors', async () => {
  const config = { ...settings, apiVersion: 'v26.0', phoneNumberId: '123456', attendanceTemplate: 'check_in', departureTemplate: 'check_out', language: 'ar', portalUrl: 'https://example.com/employee' };
  const payload = whatsappTemplatePayload(config, '966500000000', 'departure', 'Name', 'Shift');
  assert.equal(payload.template.name, 'check_out'); assert.equal(payload.template.components[0].parameters.length, 3);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => { assert.equal(String(url), 'https://graph.facebook.com/v26.0/123456/messages'); assert.equal((options?.headers as any).Authorization, 'Bearer secret'); return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 }); };
    assert.equal(await sendWhatsAppTemplate(config, 'secret', payload), 'wamid.test');
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 190, message: 'sensitive token' } }), { status: 401 });
    await assert.rejects(sendWhatsAppTemplate(config, 'secret', payload), /^Error: META_190$/);
  } finally { globalThis.fetch = originalFetch; }
});
