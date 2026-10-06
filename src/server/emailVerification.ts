import crypto from 'node:crypto';
import { employeeEmailVerified, normalizedEmail } from '../lib/emailVerification';
import { validEmployeeEmail } from '../lib/employeeDirectory';
export const verificationLifetime = 10 * 60000;
export const verificationCooldown = 60000;
export const verificationHour = 3600000;
export const verificationAttempts = 5;
export const emailVerificationKey = (companyId: string, id: string) => 'emailVerification_' + crypto.createHash('sha256').update(JSON.stringify([companyId, id])).digest('hex');
export const emailVerificationQuotaKey = (companyId: string) => 'emailVerificationQuota_' + crypto.createHash('sha256').update(companyId).digest('hex');
export function verificationCodeHash(secret: string, companyId: string, id: string, email: string, nonce: string, code: string) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify([companyId, id, normalizedEmail(email), nonce, code])).digest('hex');
}
export function matchesVerificationCode(hash: string, expected: string) {
  return /^[a-f0-9]{64}$/.test(hash || '') && /^[a-f0-9]{64}$/.test(expected || '') && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}
export function verificationRateLimit(previous: any, quota: any, now: number) {
  if (previous?.requestedAt && now - previous.requestedAt < verificationCooldown) return Math.ceil((previous.requestedAt + verificationCooldown - now) / 1000);
  if (previous?.hourStartedAt && now - previous.hourStartedAt < verificationHour && previous.sendCount >= 6) return Math.ceil((previous.hourStartedAt + verificationHour - now) / 1000);
  if (quota?.hourStartedAt && now - quota.hourStartedAt < verificationHour && quota.count >= 100) return Math.ceil((quota.hourStartedAt + verificationHour - now) / 1000);
  return 0;
}
export function newVerificationState(previous: any, quota: any, email: string, codeHash: string, nonce: string, now: number) {
  const sameHour = previous?.hourStartedAt && now - previous.hourStartedAt < verificationHour;
  const quotaHour = quota?.hourStartedAt && now - quota.hourStartedAt < verificationHour;
  return {
    challenge: { email: normalizedEmail(email), nonce, codeHash, requestedAt: now, expiresAt: now + verificationLifetime, attempts: 0, delivery: 'sending', hourStartedAt: sameHour ? previous.hourStartedAt : now, sendCount: sameHour ? previous.sendCount + 1 : 1 },
    quota: { hourStartedAt: quotaHour ? quota.hourStartedAt : now, count: quotaHour ? quota.count + 1 : 1 },
  };
}
export function verificationStatus(employee: any, challenge: any, quota: any, available: boolean, now = Date.now()) {
  const verified = employeeEmailVerified(employee);
  const matches = challenge?.email === normalizedEmail(employee?.email);
  return { email: employee?.email || '', verified, verifiedAt: verified ? employee.emailVerifiedAt : null, available,
    codePending: !!(!verified && matches && !challenge.consumedAt && challenge.expiresAt > now && challenge.attempts < verificationAttempts),
    expiresAt: matches && !challenge.consumedAt ? challenge.expiresAt || null : null,
    attemptsRemaining: matches && !challenge.consumedAt ? Math.max(0, verificationAttempts - (challenge.attempts || 0)) : verificationAttempts,
    retryAfter: verified ? 0 : verificationRateLimit(challenge, quota, now), serverTime: now };
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function verificationPayload(employee: { name: string; email: string }, company: string, code: string, env: NodeJS.ProcessEnv = process.env) {
  if (!validEmployeeEmail(employee.email)) throw new Error('بريد الموظف غير صحيح');
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) throw new Error('خدمة تأكيد البريد غير مفعّلة؛ راجع إعدادات Resend');
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid verification code');
  const text = `مرحبًا ${employee.name}،\nرمز تأكيد بريدك في برنامج الحضور — ${company}: ${code}\nالرمز صالح لمدة 10 دقائق. استخدم أحدث رمز طلبته. لا تشارك الرمز مع أي شخص.\nإذا لم تطلب تأكيد بريدك، تجاهل هذه الرسالة. هذا الرمز لتأكيد البريد فقط، ولا يغيّر كلمة المرور.`;
  return { from: env.RESEND_FROM, to: [employee.email], subject: 'رمز تأكيد البريد — وفر دوام', text,
    html: `<div lang="ar" dir="rtl" style="font-family:Arial,sans-serif;line-height:1.9;padding:24px;max-width:600px;margin:auto"><h2>تأكيد البريد الإلكتروني</h2><p>مرحبًا ${escape(employee.name)} — ${escape(company)}</p><p>رمز التأكيد:</p><p dir="ltr" style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>صالح لمدة 10 دقائق. استخدم أحدث رمز طلبته، ولا تشاركه مع أي شخص.</p><p>إذا لم تطلب تأكيد بريدك، تجاهل هذه الرسالة. الرمز لتأكيد البريد فقط.</p></div>` };
}
