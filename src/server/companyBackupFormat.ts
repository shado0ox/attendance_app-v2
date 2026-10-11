import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { canonicalData } from '../lib/mainDataVersion';
export const MAX_BACKUP_FILE = 50 * 1024 * 1024;
export const MAX_BACKUP_DATA = 100 * 1024 * 1024;
export function sealCompanyBackup(payload: any, secret: string) {
  const plain = Buffer.from(JSON.stringify(payload));
  if (plain.length > MAX_BACKUP_DATA) throw new Error('بيانات الشركة تتجاوز حد النسخة 100 MB');
  const header = { format: 'wafr-company-backup', version: 1, companyId: payload.companyId, createdAt: new Date().toISOString(), backupId: crypto.randomUUID() };
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), iv);
  cipher.setAAD(Buffer.from(canonicalData(header)));
  const data = Buffer.concat([cipher.update(gzipSync(plain)), cipher.final()]);
  const file = JSON.stringify({ ...header, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url') });
  if (Buffer.byteLength(file) > MAX_BACKUP_FILE) throw new Error('حجم ملف النسخة يتجاوز 50 MB');
  return { file, header };
}
export function openCompanyBackup(file: unknown, companyId: string, secret: string) {
  if (typeof file !== 'string' || Buffer.byteLength(file) > MAX_BACKUP_FILE) throw new Error('ملف النسخة غير صالح أو أكبر من 50 MB');
  try {
    const value = JSON.parse(file), { format, version, createdAt, backupId, iv, tag, data } = value;
    if (format !== 'wafr-company-backup' || version !== 1 || value.companyId !== companyId || typeof backupId !== 'string') throw new Error('format');
    const header = { format, version, companyId, createdAt, backupId };
    const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(canonicalData(header))); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const zipped = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
    const payload = JSON.parse(gunzipSync(zipped, { maxOutputLength: MAX_BACKUP_DATA }).toString('utf8'));
    if (payload.companyId !== companyId || payload.schemaVersion !== 1 || !payload.mainData || !Array.isArray(payload.mainData.employees) || !Array.isArray(payload.mainData.departments) || !Array.isArray(payload.mainData.shiftTypes) || !payload.mainData.schedule || typeof payload.mainData.schedule !== 'object' || !payload.tables || !Array.isArray(payload.photos)) throw new Error('payload');
    return { payload, header };
  } catch { throw new Error('النسخة تالفة أو تخص شركة أخرى أو أُنشئت على سيرفر بمفتاح مختلف'); }
}
export function preserveCompanyLogin(restored: any, current: any) {
  const data = structuredClone(restored);
  data.settings = { ...data.settings, password: current?.settings?.password };
  data.employees = data.employees.map((employee: any) => {
    const existing = current?.employees?.find((e: any) => String(e.id) === String(employee.id));
    const { webauthnCredentials: ignored, ...safe } = employee;
    return { ...safe, ...(existing ? { password: existing.password, username: existing.username, email: existing.email, emailVerifiedAt: existing.emailVerifiedAt, emailVerifiedAddress: existing.emailVerifiedAddress, webauthnCredentials: existing.webauthnCredentials } : { webauthnCredentials: [] }) };
  });
  data._companyRestoreRevision = crypto.randomUUID();
  return data;
}
