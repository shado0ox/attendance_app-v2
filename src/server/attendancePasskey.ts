import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { attendancePasskeyRequired, emptyPasskeyPolicy, parsePasskeyPolicy, type AttendancePasskeyPolicy } from '../lib/attendancePasskeyPolicy';
import { isActiveEmployee } from '../lib/employeeLifecycle';
const policyKey = (company: string) => 'attendancePasskeyPolicy:' + company;
const fingerprint = (credential: any) => crypto.createHash('sha256').update(credential.publicKey).digest('hex');
const approvedCredentials = (policy: AttendancePasskeyPolicy, employee: any) => (employee?.webauthnCredentials || []).filter((c: any) => policy.approved[String(employee.id)]?.[c.id] === fingerprint(c));
export async function readAttendancePasskeyPolicy(company: string, tx: any = db): Promise<AttendancePasskeyPolicy> {
  const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, policyKey(company)));
  return row?.value as AttendancePasskeyPolicy || emptyPasskeyPolicy();
}
/** Proof is consumed in the attendance transaction, scoped to account, action and record. */
export async function checkAttendancePasskey(tx: any, auth: any, employee: any, body: any, field: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${policyKey(auth.companyId)}))`);
  const policy = await readAttendancePasskeyPolicy(auth.companyId, tx);
  if (!attendancePasskeyRequired(policy, String(auth.id))) return { verified: false };
  const fail = { status: 403, body: { code: 'PASSKEY_REQUIRED', error: 'يلزم تأكيد الحضور أو الانصراف بمفتاح Passkey معتمد من الإدارة' } };
  if (body.automatic === true || typeof body.passkeyProof !== 'string' || !/^[a-f0-9]{64}$/.test(body.passkeyProof)) return fail;
  const key = 'attendancePasskeyProof:' + body.passkeyProof;
  const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).for('update');
  const value: any = row?.value;
  if (!value || value.companyId !== auth.companyId || value.employeeId !== String(auth.id) || value.field !== field || value.recordId !== String(body.id || '') || value.expiresAt <= Date.now() || !approvedCredentials(policy, employee).some((c: any) => c.id === value.credentialId)) return fail;
  await tx.delete(schema.systemData).where(eq(schema.systemData.key, key));
  return { verified: true };
}
export function registerAttendancePasskey(app: any, requireAuth: any, getMain: any, saveCredentials: any, config: { rpID: string; origin: string | string[] }) {
  const employeeAuth = requireAuth(['employee'], false), adminAuth = requireAuth(['admin', 'superadmin'], false);
  const respond = (handler: any) => async (req: any, res: any) => { try { await handler(req, res); } catch (error: any) { res.status(400).json({ error: error.message || 'تعذر التحقق' }); } };
  app.get('/api/attendance-passkey/status', employeeAuth, respond(async (req: any, res: any) => {
    const policy = await readAttendancePasskeyPolicy(req.auth.companyId), data = await getMain(req.auth.companyId);
    const employee = data?.employees?.find((e: any) => String(e.id) === String(req.auth.id));
    res.json({ required: attendancePasskeyRequired(policy, String(req.auth.id)), approvedCount: approvedCredentials(policy, employee).length, pendingCount: (employee?.webauthnCredentials || []).length - approvedCredentials(policy, employee).length });
  }));
  app.get('/api/attendance-passkey/policy', adminAuth, respond(async (req: any, res: any) => {
    const policy = await readAttendancePasskeyPolicy(req.auth.companyId), data = await getMain(req.auth.companyId);
    res.json({ mode: policy.mode, employeeIds: policy.employeeIds, employees: (data?.employees || []).map((e: any) => ({ id: String(e.id), name: e.name, credentials: (e.webauthnCredentials || []).map((c: any) => ({ id: c.id, backedUp: c.backedUp, approved: policy.approved[String(e.id)]?.[c.id] === fingerprint(c) })) })) });
  }));
  app.post('/api/attendance-passkey/policy', adminAuth, respond(async (req: any, res: any) => {
    const company = req.auth.companyId;
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${policyKey(company)}))`);
      const policy = await readAttendancePasskeyPolicy(company, tx), data = await getMain(company);
      const value = { ...policy, ...parsePasskeyPolicy(req.body, data?.employees || []) };
      await tx.insert(schema.systemData).values({ key: policyKey(company), value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
      await tx.insert(schema.auditLog).values({ companyId: company, actorId: String(req.auth.id || req.auth.username || 'owner'), actorRole: req.auth.role, action: 'passkey.policy', entityId: company, details: { mode: value.mode, employeeIds: value.employeeIds } });
    }); res.json({ saved: true });
  }));
  app.post('/api/attendance-passkey/credential', adminAuth, respond(async (req: any, res: any) => {
    const company = req.auth.companyId, { employeeId, credentialId, approved } = req.body;
    if (typeof approved !== 'boolean') throw new Error('حدد اعتماد أو إلغاء اعتماد المفتاح');
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${policyKey(company)}))`);
      const policy = await readAttendancePasskeyPolicy(company, tx), data = await getMain(company);
      const credential = data?.employees?.find((e: any) => String(e.id) === employeeId)?.webauthnCredentials?.find((c: any) => c.id === credentialId);
      if (!credential) throw new Error('مفتاح الموظف غير موجود في الشركة');
      const approvals = { ...policy.approved[employeeId] };
      if (approved) approvals[credentialId] = fingerprint(credential); else delete approvals[credentialId];
      const value = { ...policy, approved: { ...policy.approved, [employeeId]: approvals } };
      await tx.insert(schema.systemData).values({ key: policyKey(company), value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
      await tx.insert(schema.auditLog).values({ companyId: company, actorId: String(req.auth.id || req.auth.username || 'owner'), actorRole: req.auth.role, action: 'passkey.credential', entityId: employeeId, details: { credentialId, approved } });
    }); res.json({ saved: true });
  }));
  const validAction = (body: any) => ['checkIn', 'checkOut', 'checkIn2', 'checkOut2'].includes(body.field) && (body.recordId == null || typeof body.recordId === 'number' || typeof body.recordId === 'string');
  app.post('/api/attendance-passkey/options', employeeAuth, respond(async (req: any, res: any) => {
    if (!validAction(req.body)) throw new Error('عملية حضور غير صحيحة');
    const policy = await readAttendancePasskeyPolicy(req.auth.companyId), data = await getMain(req.auth.companyId);
    const employee = data?.employees?.find((e: any) => String(e.id) === String(req.auth.id));
    if (!isActiveEmployee(employee)) throw new Error('حساب الموظف غير نشط');
    if (!attendancePasskeyRequired(policy, String(req.auth.id))) return res.json({ required: false });
    const credentials = approvedCredentials(policy, employee);
    if (!credentials.length) throw new Error('سجل مفتاح Passkey من بوابة الموظف ثم اطلب من الإدارة اعتماده');
    const options = await generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'required', allowCredentials: credentials.map((c: any) => ({ id: c.id, transports: c.transports })) });
    const challengeId = crypto.randomBytes(32).toString('hex');
    await db.delete(schema.systemData).where(sql`${schema.systemData.key} LIKE 'attendancePasskeyChallenge:%' AND (${schema.systemData.value}->>'expiresAt')::bigint < ${Date.now()}`);
    await db.delete(schema.systemData).where(sql`${schema.systemData.key} LIKE 'attendancePasskeyProof:%' AND (${schema.systemData.value}->>'expiresAt')::bigint < ${Date.now()}`);
    await db.delete(schema.systemData).where(sql`${schema.systemData.key} LIKE 'attendancePasskeyChallenge:%' AND ${schema.systemData.value}->>'companyId' = ${req.auth.companyId} AND ${schema.systemData.value}->>'employeeId' = ${String(req.auth.id)}`);
    await db.insert(schema.systemData).values({ key: 'attendancePasskeyChallenge:' + challengeId, value: { companyId: req.auth.companyId, employeeId: String(req.auth.id), field: req.body.field, recordId: String(req.body.recordId || ''), challenge: options.challenge, expiresAt: Date.now() + 120000 } });
    res.json({ required: true, challengeId, options });
  }));
  app.post('/api/attendance-passkey/verify', employeeAuth, respond(async (req: any, res: any) => {
    if (typeof req.body.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.challengeId)) throw new Error('تحدي غير صالح');
    const key = 'attendancePasskeyChallenge:' + req.body.challengeId;
    const proof = crypto.randomBytes(32).toString('hex');
    let changed: any;
    await db.transaction(async tx => {
      const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).for('update');
      const value: any = row?.value;
      if (!value || value.companyId !== req.auth.companyId || value.employeeId !== String(req.auth.id) || value.expiresAt <= Date.now()) throw new Error('التحدي منتهي أو خارج الحساب');
      const policy = await readAttendancePasskeyPolicy(req.auth.companyId, tx), data = await getMain(req.auth.companyId);
      const employee = data?.employees?.find((e: any) => String(e.id) === String(req.auth.id));
      if (!isActiveEmployee(employee)) throw new Error('حساب الموظف غير نشط');
      const credential = approvedCredentials(policy, employee).find((c: any) => c.id === req.body.credential?.id);
      if (!credential) throw new Error('مفتاح غير معتمد');
      const result = await verifyAuthenticationResponse({ response: req.body.credential, expectedChallenge: value.challenge, expectedOrigin: config.origin, expectedRPID: config.rpID, requireUserVerification: true, credential: { ...credential, publicKey: Buffer.from(credential.publicKey, 'base64url') } });
      if (!result.verified) throw new Error('فشل التحقق من المفتاح');
      changed = { ...credential, counter: result.authenticationInfo.newCounter };
      await tx.delete(schema.systemData).where(eq(schema.systemData.key, key));
      await tx.insert(schema.systemData).values({ key: 'attendancePasskeyProof:' + proof, value: { ...value, challenge: undefined, credentialId: credential.id, expiresAt: Date.now() + 60000 } });
    });
    await saveCredentials(req.auth.companyId, String(req.auth.id), [changed]);
    res.json({ proof });
  }));
}
