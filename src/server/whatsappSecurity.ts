import crypto from 'node:crypto';
export function encryptWhatsAppSecret(value: string, secret: string, context: string) {
  if (!secret) throw new Error('مفتاح حماية إعدادات واتساب غير متاح');
  const key = crypto.createHash('sha256').update('wafr-whatsapp-v1:' + secret).digest();
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(b => b.toString('base64url')).join('.');
}
export function decryptWhatsAppSecret(value: string, secret: string, context: string) {
  if (!value) return '';
  const [iv, tag, body] = value.split('.').map(v => Buffer.from(v, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update('wafr-whatsapp-v1:' + secret).digest(), iv);
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
export function validWhatsAppSignature(body: Buffer, signature: unknown, secret: string) {
  if (!Buffer.isBuffer(body) || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature) || !secret) return false;
  return crypto.timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), crypto.createHmac('sha256', secret).update(body).digest());
}
export function whatsappTemplatePayload(settings: any, to: string, kind: string, name: string, shift: string) {
  return { messaging_product: 'whatsapp', to, type: 'template', template: { name: kind === 'departure' ? settings.departureTemplate : settings.attendanceTemplate, language: { code: settings.language }, components: [{ type: 'body', parameters: [name, shift, settings.portalUrl].map(text => ({ type: 'text', text })) }] } };
}
export async function sendWhatsAppTemplate(settings: any, token: string, payload: any) {
  const response = await fetch(`https://graph.facebook.com/${settings.apiVersion}/${settings.phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), redirect: 'error' });
  const body = await response.json();
  if (!response.ok || !body.messages?.[0]?.id) throw new Error(`META_${Number(body.error?.code) || response.status}`);
  return String(body.messages[0].id);
}
