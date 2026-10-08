import { selfProfile, selfProfileUpdate, privateAttendanceDay, employeePhotoKey } from './src/server/employeeSelfService';
import { businessCompany, canReadCompany, subscriptionMetadata, subscriptionUpdate } from './src/server/tenantPrivacy';
import { identityValue, employeeIdentities, adminIdentity, masterIdentity, identityLock, allIdentities, assertUnique, resolveIdentity, migrateCompanyCodes, nextCompanyCode } from './src/server/companyIdentity';
import { backupHealth, buildInfo, mailHealthRows, readHealthFile, recordOperationalError, welcomeStateKey } from './src/server/systemHealth';
import { runBackup, verifyBackupRestore, startBackupScheduler } from './src/server/backup';
import { parseNotificationQuery, notificationPage, updateNotificationRead } from './src/lib/adminNotifications';
import { buildAdminNotifications, notificationPermissions, notificationStateKey } from './src/server/adminNotifications';
import { fullAdminAccess, parseAdminAccess, scopedMainData, mergeAdminData, ownsEmployee, ownsDay, allowedAdminRoute, type AdminAccess } from './src/lib/adminAccess';
import { normalizedEmail, employeeEmailVerified, preserveEmailVerification } from './src/lib/emailVerification';
import { emailVerificationKey, emailVerificationQuotaKey, verificationStatus, verificationRateLimit, newVerificationState, verificationCodeHash, matchesVerificationCode, verificationAttempts, verificationPayload } from './src/server/emailVerification';
import { parseEmployeeProfileQuery, employeeProfileData, employeeProfileSchedule } from './src/lib/employeeProfile';
import { correctionValues, validCorrectionTime, CorrectionValidationError } from './src/lib/attendanceCorrection';
import { scheduleContent, effectiveScheduleData, employeeScheduleContent } from './src/lib/schedulePublication';
import { employeeStatus, isActiveEmployee, employeeChanges, saveEmploymentHistory, employeeAtDate } from './src/lib/employeeLifecycle';
import { validEmployeeEmail } from './src/lib/employeeDirectory';
import { welcomePayload, deliverWelcome } from './src/server/welcomeEmail';
import { autoFix } from './src/lib/autoPunch';
import { analyzeAttendance } from './src/lib/attendanceAnalysis';
import { parseExceptionQuery, exceptionReportPage } from './src/lib/attendanceExceptions';
import { parseAttendanceQuery, attendanceReportPage } from './src/lib/attendanceQuery';
import { buildAttendanceDays } from './src/lib/attendanceReport';
import { validMonth, validAttendanceDate, riyadhMonth } from './src/lib/attendanceMonths';
import { mainDataVersion } from './src/lib/mainDataVersion';
import { punchFields, validatePunchTransition, checkPunchLocation } from './src/lib/punchPolicy';
import { matchAttendanceLocation } from './src/lib/attendanceLocations';
import { registerElectronicDocumentRoutes } from './src/server/electronicDocuments';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { db, schema, pool, initializeSchemaAndTables, getDbSchemaName } from './src/db/index.ts';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

const app = express();
app.use('/api', (_req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');next();});
// Main data includes the schedule and an optional base64 company logo.
app.use(express.json({ limit: '10mb' }));
app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'حجم البيانات يتجاوز 10 ميجابايت. قلّل حجم شعار الشركة ثم أعد الحفظ.' });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'صيغة بيانات الحفظ غير صحيحة.' });
  }
  next(error);
});

const PORT = 3011;
const isProd = process.env.NODE_ENV === 'production';

// --- AUTH / PASSWORD HELPERS -------------------------------------------------
// JWT_SECRET should be set in .env for production so sessions survive restarts.
// If it isn't, we now persist a generated secret in the database (see ensureJwtSecret()
// below, called during startup) so a server restart doesn't silently invalidate every
// stored session token — that used to happen because a brand new random secret was
// generated on every single process start, and any token signed with the old one would
// fail verification afterwards (looking like a random, unexplained logout to the user).
let JWT_SECRET = process.env.JWT_SECRET || '';

async function ensureJwtSecret() {
  if (JWT_SECRET) return; // explicit env value always wins
  const SECRET_KEY = '__jwt_secret__';
  try {
    const existing = await db.select().from(schema.systemData).where(eq(schema.systemData.key, SECRET_KEY)).limit(1);
    const storedValue = existing[0]?.value as unknown;
    if (typeof storedValue === 'string' && storedValue.length > 0) {
      JWT_SECRET = storedValue;
      console.warn('[security] JWT_SECRET is not set in .env — reusing the secret persisted in the database from a previous run so existing sessions keep working. Set JWT_SECRET in .env for full control over this in production.');
      return;
    }
  } catch (err) {
    console.error('[security] Could not read a persisted JWT secret from the database — a new one will be generated for this run only:', err);
  }

  const generated = crypto.randomBytes(32).toString('hex');
  JWT_SECRET = generated;
  try {
    await db.insert(schema.systemData).values({ key: SECRET_KEY, value: generated }).onConflictDoNothing();
    console.warn('[security] JWT_SECRET is not set in .env — generated a new secret and saved it to the database so future restarts reuse it. Set JWT_SECRET in .env if you prefer to manage it yourself.');
  } catch (err) {
    console.error('[security] Could not persist the generated JWT secret — sessions will NOT survive a restart until JWT_SECRET is set in .env:', err);
  }
}

const isBcryptHash = (value: unknown): value is string =>
  typeof value === 'string' && /^\$2[aby]\$/.test(value);

const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10);

// Verifies a password against a stored value that may be a bcrypt hash OR
// still be legacy plaintext. On a successful legacy-plaintext match, `onUpgrade`
// is called with the freshly hashed value so the caller can persist it — this
// migrates old plaintext rows to bcrypt automatically the next time someone logs in,
// with no separate migration script required.
function verifyPassword(plain: string, stored: string | null | undefined, onUpgrade?: (hash: string) => void): boolean {
  if (!stored) return false;
  if (isBcryptHash(stored)) {
    return bcrypt.compareSync(plain, stored);
  }
  const matches = plain === stored;
  if (matches && onUpgrade) {
    onUpgrade(hashPassword(plain));
  }
  return matches;
}

interface AuthTokenPayload {
  role: 'superadmin' | 'admin' | 'employee';
  companyId: string;
  id?: string | number;
  username?: string;
  passwordRevision?: string;
  name?: string;
}

const signToken = (payload: AuthTokenPayload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
const adminAccessKey = (companyId: string, id: unknown) => 'adminAccess:' + companyId + ':' + id;
async function resolveAdminAccess(auth: AuthTokenPayload): Promise<AdminAccess> {
  if (auth.role !== 'admin' || auth.id === undefined) return fullAdminAccess();
  if (!Number.isInteger(Number(auth.id)) || Number(auth.id) <= 0) throw new Error('حساب المسؤول غير متاح');
  const admins = await db.select().from(schema.admins).where(and(eq(schema.admins.id, Number(auth.id)), eq(schema.admins.companyId, auth.companyId))).limit(1);
  if (!admins[0]) throw new Error('حساب المسؤول غير متاح');
  const rows = await db.select().from(schema.systemData).where(eq(schema.systemData.key, adminAccessKey(auth.companyId, auth.id))).limit(1);
  // Preserve existing accounts until the company explicitly configures their access.
  return rows[0]?.value as AdminAccess || fullAdminAccess();
}
const requestAccess = (req: Request): AdminAccess => (req as any).adminAccess || fullAdminAccess();
async function visibleRows(req: Request, rows: any[], companyId: string) {
  const access = requestAccess(req);
  if (access.departmentIds === null) return rows;
  const data = await getMainDataByCompanyId(companyId);
  return rows.filter(row => ownsDay(access, data, row));
}


app.use((req,res,next)=>{res.on('finish',()=>{if(res.statusCode>=500 && req.path.startsWith('/api/') && !req.path.startsWith('/api/system-health') && req.route?.path){const auth=(req as any).auth as AuthTokenPayload|undefined;if(auth)void recordOperationalError(String(req.query.companyId || req.body?.companyId || auth.companyId || 'default'),String(req.route.path),req.method,res.statusCode);}});next();});
startBackupScheduler();

// Requires a valid bearer token with one of `roles`. When `matchCompany` is true (default),
// Business access is scoped to one company, including platform admins (company 101 only).
function requireAuth(roles: AuthTokenPayload['role'][], matchCompany: boolean = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'يلزم تسجيل الدخول للوصول لهذا المورد' });
    }
    let payload: AuthTokenPayload;
    try {
      payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthTokenPayload;
    } catch {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى' });
    }
    if (!roles.includes(payload.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية للقيام بهذا الإجراء' });
    }
    if (req.query.companyId && req.body?.companyId && req.query.companyId !== req.body.companyId) return res.status(400).json({ error: 'معرّف الشركة في الطلب غير متطابق' });
    const requestedCompanyId = (req.query.companyId as string) || (req.body && req.body.companyId) || 'default';
    if (matchCompany && !canReadCompany(payload, requestedCompanyId)) {
      return res.status(403).json({ error: 'لا يمكن الوصول لبيانات شركة أخرى' });
    }
    payload = { ...payload, companyId: businessCompany(payload) };
    if (payload.companyId !== 'default') {
      try { if (!await companyCanLogin(payload.companyId)) return res.status(403).json({error:'اشتراك الشركة غير نشط أو تم حذفها'}); }
      catch { return res.status(503).json({error:'تعذر التحقق من الشركة'}); }
    }
    if (payload.role === 'employee') {
      try {
        const result = await db.execute(sql`SELECT employee->>'status' AS status FROM ${schema.systemData}, jsonb_array_elements(${schema.systemData.value}->'employees') AS employee WHERE ${schema.systemData.key} = ${getMainDataKey(payload.companyId)} AND employee->>'id' = ${String(payload.id)} LIMIT 1`);
        const employee = result.rows[0];
        if (!isActiveEmployee(employee)) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.', code: 'EMPLOYEE_INACTIVE' });
      } catch { return res.status(503).json({ error: 'تعذر التحقق من حالة الحساب' }); }
    }
    if (payload.role === 'admin') {
      try {
        await validateOwnerSession(payload);
        const access = await resolveAdminAccess(payload);
        (req as any).adminAccess = access;
        if (payload.id !== undefined && req.query.mode === 'all' && ['/api/attendance-report', '/api/attendance-exceptions'].includes(req.path) && !access.permissions.canPrint) return res.status(403).json({ error: 'ليس لديك صلاحية التصدير' });
        if (payload.id !== undefined && !allowedAdminRoute(access, req.method, req.path)) return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء أو أنه خاص بإدارة الشركة' });
      } catch { return res.status(403).json({ error: 'تعذر التحقق من صلاحيات المسؤول' }); }
    }
    (req as any).auth = payload;
    next();
  };
}

// Scope id-based admin operations by the stored row, never the supplied company id.
function requireOwnedRow(table: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id || req.body?.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'رقم السجل غير صحيح' });
      const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
      const auth = (req as any).auth as AuthTokenPayload;
      if (!rows[0] || !canReadCompany(auth, rows[0].companyId || 'default')) return res.status(404).json({ error: 'السجل غير موجود أو غير مسموح' });
      if (!(await visibleRows(req, rows, rows[0].companyId || 'default')).length) return res.status(404).json({ error: 'السجل خارج نطاق أقسامك' });
      (req as any).ownedRow = rows[0]; next();
    } catch { return res.status(500).json({ error: 'تعذر التحقق من صلاحية السجل' }); }
  };
}
const audit = async (executor: any, auth: AuthTokenPayload, companyId: string, action: string, entityId: any, details: any) => {
  await executor.insert(schema.auditLog).values({ companyId, actorId: String(auth.id || auth.username || 'superadmin'), actorRole: auth.role, action, entityId: String(entityId), details });
};

// Reads the bearer token if present without blocking the request — used so a public,
// unauthenticated endpoint can still return richer data to a logged-in admin.
function tryReadAuth(req: Request): AuthTokenPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

// Strips sensitive fields from mainData before sending to an unauthenticated (or
// wrongly-scoped) caller. Employee PIN codes stay visible to that company's own
// logged-in admins, matching how the admin panel is designed (admins can view/share
// an employee's login code) — we only need to stop the public internet from reading them.
function sanitizeMainData(data: any, canSeeSecrets: boolean) {
  if (!data || canSeeSecrets) return data;
  return {
    ...data,
    employees: Array.isArray(data.employees)
      ? data.employees.map((e: any) => {
          const { password, ...rest } = e;
          return { ...rest, hasPassword: !!password };
        })
      : data.employees,
    settings: data.settings ? { ...data.settings, password: undefined } : data.settings,
  };
}

type StoredWebAuthnCredential = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  deviceType?: string;
  backedUp?: boolean;
};

const WEBAUTHN_RP_NAME = process.env.WEBAUTHN_RP_NAME || 'نظام الدوام';
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3011';
const WEBAUTHN_RP_ID =
  process.env.WEBAUTHN_RP_ID || new URL(WEBAUTHN_ORIGIN).hostname;

const webauthnChallenges = new Map<
  string,
  { challenge: string; type: 'registration' | 'authentication'; expiresAt: number }
>();

function getMainDataKey(companyId: string) {
  return companyId === 'default' ? 'mainData' : `mainData_${companyId}`;
}

async function getMainDataByCompanyId(companyId: string) {
  const key = getMainDataKey(companyId);
  const rows = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
  return rows[0]?.value as any;
}

async function saveEmployeeCredentials(companyId: string, empId: string, credentials: StoredWebAuthnCredential[]) {
  await db.transaction(async tx => {
    const key = getMainDataKey(companyId);
    const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1).for('update');
    const value: any = rows[0]?.value;
    const employee = value?.employees?.find((e: any) => String(e.id) === String(empId));
    if (!isActiveEmployee(employee)) throw new Error('حساب الموظف غير نشط');
    const merged = new Map<string, StoredWebAuthnCredential>((employee.webauthnCredentials || []).map((c: StoredWebAuthnCredential) => [c.id, c]));
    for (const credential of credentials) merged.set(credential.id, { ...credential, counter: Math.max(credential.counter, merged.get(credential.id)?.counter || 0) });
    const employees = value.employees.map((e: any) => String(e.id) === String(empId) ? { ...e, webauthnCredentials: [...merged.values()] } : e);
    await tx.update(schema.systemData).set({ value: { ...value, employees }, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
  });
}

function getChallengeMapKey(companyId: string, empId: string | number, type: 'registration' | 'authentication') {
  return `${type}:${companyId}:${String(empId)}`;
}

function setStoredChallenge(companyId: string, empId: string | number, type: 'registration' | 'authentication', challenge: string) {
  webauthnChallenges.set(getChallengeMapKey(companyId, empId, type), {
    challenge,
    type,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

function consumeStoredChallenge(companyId: string, empId: string | number, type: 'registration' | 'authentication') {
  const key = getChallengeMapKey(companyId, empId, type);
  const record = webauthnChallenges.get(key);
  if (!record) return null;
  webauthnChallenges.delete(key);
  if (record.expiresAt < Date.now()) return null;
  return record.challenge;
}

function bufferFromBase64url(value: string) {
  return Buffer.from(value, 'base64url');
}

registerElectronicDocumentRoutes(app, requireAuth, getMainDataByCompanyId);

// Debug DB route (development only — leaks connection details, never expose in production)
app.get('/api/debug-db', (req, res) => {
  if (isProd) return res.status(404).json({ error: 'Not found' });
  const connectionString = process.env.DATABASE_URL;
  res.json({
    cwd: process.cwd(),
    NODE_ENV: process.env.NODE_ENV,
    hasConnectionString: !!connectionString,
    connectionStringPrefix: connectionString ? connectionString.substring(0, 45) + '...' : null,
    SQL_HOST: process.env.SQL_HOST,
    SQL_USER: process.env.SQL_USER,
    SQL_DB_NAME: process.env.SQL_DB_NAME,
    DB_SCHEMA: getDbSchemaName(),
    DB_SSL: process.env.DB_SSL || 'auto',
    isExternalDb: connectionString?.includes('supabase') || connectionString?.includes('neon') || connectionString?.includes('render') || process.env.SQL_HOST?.includes('supabase')
  });
});

// Diagnose DB route (development only — leaks connection details, never expose in production)
app.get('/api/diagnose-db', async (req, res) => {
  if (isProd) return res.status(404).json({ error: 'Not found' });
  const connectionString = process.env.DATABASE_URL;
  const isExternalDb = connectionString?.includes('supabase') || connectionString?.includes('neon') || connectionString?.includes('render') || process.env.SQL_HOST?.includes('supabase');

  const diagnosticReport: any = {
    timestamp: new Date().toISOString(),
    config: {
      hasConnectionString: !!connectionString,
      connectionStringMasked: connectionString ? connectionString.replace(/:([^:@]+)@/, ':******@') : null,
      SQL_HOST: process.env.SQL_HOST,
      SQL_PORT: process.env.SQL_PORT,
      SQL_USER: process.env.SQL_USER,
      SQL_DB_NAME: process.env.SQL_DB_NAME,
      DB_SCHEMA: getDbSchemaName(),
      DB_SSL: process.env.DB_SSL || 'auto',
      isExternalDb
    },
    databaseHandshake: {
      status: 'pending',
      latencyMs: null,
      error: null
    },
    tablesCheck: {
      systemData: { status: 'untested', count: null, error: null },
      registrationRequests: { status: 'untested', count: null, error: null }
    }
  };

  try {
    const dbStartTime = Date.now();
    const systemDataResult = await db.select().from(schema.systemData).limit(1);
    diagnosticReport.databaseHandshake.status = 'SUCCESS';
    diagnosticReport.databaseHandshake.latencyMs = Date.now() - dbStartTime;
    diagnosticReport.tablesCheck.systemData.status = 'OK';
    diagnosticReport.tablesCheck.systemData.count = systemDataResult.length;
  } catch (error: any) {
    diagnosticReport.databaseHandshake.status = 'FAILED';
    diagnosticReport.databaseHandshake.error = {
      message: error.message || String(error),
      code: error.code,
      stack: error.stack,
      detail: error.detail,
      hint: error.hint
    };
  }

  if (diagnosticReport.databaseHandshake.status === 'SUCCESS') {
    try {
      const regReqResult = await db.select().from(schema.registrationRequests).limit(1);
      diagnosticReport.tablesCheck.registrationRequests.status = 'OK';
      diagnosticReport.tablesCheck.registrationRequests.count = regReqResult.length;
    } catch (error: any) {
      diagnosticReport.tablesCheck.registrationRequests.status = 'FAILED';
      diagnosticReport.tablesCheck.registrationRequests.error = {
        message: error.message || String(error),
        code: error.code
      };
    }
  }

  res.json(diagnosticReport);
});

// Default datasets to seed if DB is empty
const defaultDepartments = [
  { id: 'dept1', name: 'استقدام', needsMorning: true, needsEvening: true, friday: 'off' },
  { id: 'dept2', name: 'ايجار', needsMorning: true, needsEvening: true, friday: 'off' },
  { id: 'dept3', name: 'كول سنتر', needsMorning: true, needsEvening: true, friday: 'partial' }
];

const defaultShiftTypes = [
  { id: 'S', name: 'صباحي', start: '07:00', end: '15:00', type: 'morning' },
  { id: 'E', name: 'مسائي', start: '15:00', end: '23:00', type: 'evening' },
  { id: 'D', name: 'كامل (صباحي + مسائي)', start: '08:00', end: '22:00', type: 'double' }
];

const defaultEmployees = [
  { id: 'e1', name: 'امجد', dept: 'dept1', phone: '966501234567', username: 'amjad', color: '#01696f' },
  { id: 'e2', name: 'منار', dept: 'dept1', phone: '966501234568', username: 'manar', color: '#0891b2' },
  { id: 'e3', name: 'روان', dept: 'dept1', phone: '966501234569', username: 'rawan', color: '#7c3aed' },
  { id: 'e4', name: 'احلام', dept: 'dept2', phone: '966501234570', username: 'ahlam', color: '#be185d' },
  { id: 'e5', name: 'علي احمد', dept: 'dept2', phone: '966501234571', username: 'ali_ahmad', color: '#dc2626' },
  { id: 'e6', name: 'شروق', dept: 'dept2', phone: '966501234572', username: 'shorouk', color: '#d97706' },
  { id: 'e7', name: 'صفا', dept: 'dept3', phone: '966501234573', username: 'safa', color: '#065f46' },
  { id: 'e8', name: 'مريم', dept: 'dept3', phone: '966501234574', username: 'maryam', color: '#2563eb' },
  { id: 'e9', name: 'نور', dept: 'dept3', phone: '966501234575', username: 'nour', color: '#01696f' }
];

const defaultSchedule: any = {};
const june = '2026-06';
const empShifts: any = {
  e1: { type: 'S', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] },
  e2: { type: 'S', workDays: [6, 7, 9, 10, 11, 13, 14, 16, 17, 18] },
  e3: { type: 'S', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] },
  e4: { type: 'S', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] },
  e5: { type: 'E', workDays: [7, 8, 9, 10, 11, 14, 15, 16, 17, 18] },
  e6: { type: 'E', workDays: [6, 7, 8, 10, 11, 13, 14, 15, 17, 18] },
  e7: { type: 'E', workDays: [7, 8, 9, 10, 11, 14, 15, 16, 17, 18] },
  e8: { type: 'S', workDays: [6, 7, 9, 10, 13, 14, 16, 17, 19, 20, 22, 23] },
  e9: { type: 'E', workDays: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18] }
};

for (const [empId, cfg] of Object.entries(empShifts)) {
  for (let day = 1; day <= 30; day++) {
    const dateStr = `${june}-${String(day).padStart(2, '0')}`;
    if (!defaultSchedule[dateStr]) defaultSchedule[dateStr] = {};
    if ((cfg as any).workDays.includes(day)) {
      defaultSchedule[dateStr][empId] = { shiftType: (cfg as any).type, note: '' };
    } else {
      defaultSchedule[dateStr][empId] = { shiftType: 'A', note: '' };
    }
  }
}

const defaultMainData = {
  departments: defaultDepartments,
  employees: defaultEmployees,
  shiftTypes: defaultShiftTypes,
  schedule: defaultSchedule,
  settings: {
    password: '5198',
    companyName: 'نظام الدوام',
    officeLocation: { lat: 24.7136, lng: 46.6753, radius: 150 }
  }
};

const createCleanCompanyData = (companyName: string) => ({
  departments: [],
  employees: [],
  shiftTypes: [
    { id: 'S', name: 'صباحي', start: '08:00', end: '16:00', type: 'morning' },
    { id: 'E', name: 'مسائي', start: '16:00', end: '00:00', type: 'evening' }
  ],
  schedule: {},
  settings: {
    password: '1234',
    companyName: companyName,
    officeLocation: { lat: 24.7136, lng: 46.6753, radius: 150 }
  }
});

function employeeMainData(value: any, auth: AuthTokenPayload) {
  const { _schedulePublication, ...safe } = sanitizeMainData(value, false);
  const published = effectiveScheduleData(value);
  return { ...safe, schedule: published.schedule, shiftTypes: published.shiftTypes,
    employees: (value.employees || []).map((e: any) => String(e.id) === String(auth.id) ? { ...e, password: undefined, webauthnCredentials: undefined } : { id: e.id, name: e.name, dept: e.dept }),
    scheduleNotice: { revision: mainDataVersion(employeeScheduleContent(value, String(auth.id))), publishedAt: _schedulePublication?.publishedAt || null } };
}

// --- AUTH ENDPOINTS ---
// Password checks used to happen entirely in the browser (full admin/employee lists,
// including passwords, were fetched by the client and compared there). These endpoints
// move every password comparison to the server, so raw passwords never need to leave the DB.

const loginError = { error: 'اسم المستخدم أو البريد أو كلمة المرور غير صحيحة؛ راجع الإدارة إذا كانت بيانات الدخول مكررة' };
async function companyCanLogin(companyId:string) {
  if(companyId==='default')return true;
  const rows=await db.select().from(schema.companies).where(eq(schema.companies.id,companyId)).limit(1);const company=rows[0];
  return !!company && ['active','trial'].includes(company.subscriptionStatus || '') && (!company.subscriptionExpiresAt || new Date(company.subscriptionExpiresAt)>=new Date());
}
async function validateOwnerSession(auth:AuthTokenPayload) {
  if(auth.role!=='admin'||auth.id!==undefined||auth.companyId==='default')return;
  const rows=await db.select().from(schema.systemData).where(eq(schema.systemData.key,'ownerPasswordRevision:'+auth.companyId)).limit(1);
  if(rows[0] && auth.passwordRevision!==(rows[0].value as any).revision)throw new Error('انتهت جلسة مدير الشركة بعد تغيير كلمة المرور');
}
app.post('/api/auth/admin-login', async (req,res)=>{
  const {username,password,companyCode}=req.body || {};if(typeof username!=='string'||typeof password!=='string'||!username.trim()||!password)return res.status(400).json({error:'أدخل اسم المستخدم أو البريد وكلمة المرور'});
  try{
    const account=identityValue(username)==='admin'?{kind:'root' as const,companyId:'default',id:undefined}:resolveIdentity(await allIdentities(db),username,'admin');if(!account)return res.status(401).json(loginError);
    const companyId=account.companyId;
    const companyRows=account.kind==='master'?await db.select().from(schema.companies).where(eq(schema.companies.id,companyId)).limit(1):[];
    const company=companyRows[0];
    if(companyCode && identityValue(companyCode)!==(companyId==='default'?'101':(company || (await db.select().from(schema.companies).where(eq(schema.companies.id,companyId)).limit(1))[0])?.companyCode))return res.status(401).json(loginError);
    if(account.kind==='root'){
      const rows=await db.select().from(schema.systemData).where(eq(schema.systemData.key,'mainData')).limit(1);const value:any=rows[0]?.value,settings=value?.settings || {};
      if(!verifyPassword(password,settings.password || '5198',(hash)=>{db.update(schema.systemData).set({value:{...value,settings:{...settings,password:hash}},updatedAt:new Date()}).where(and(eq(schema.systemData.key,'mainData'),eq(schema.systemData.value,value))).catch(()=>{});}))return res.status(401).json(loginError);
      return res.json({token:signToken({role:'superadmin',companyId,name:'المدير العام'}),role:'superadmin',companyId,companyCode:'101',name:'المدير العام'});
    }
    const adminRows=account.kind==='admin'?await db.select().from(schema.admins).where(eq(schema.admins.id,Number(account.id))).limit(1):[];const admin=adminRows[0];
    const stored=company?.adminPassword || admin?.password;if(!stored || !verifyPassword(password,stored,(hash)=>{if(company)db.update(schema.companies).set({adminPassword:hash}).where(eq(schema.companies.id,companyId)).catch(()=>{});else db.update(schema.admins).set({password:hash}).where(eq(schema.admins.id,admin.id)).catch(()=>{});}))return res.status(401).json(loginError);
    if(!await companyCanLogin(companyId))return res.status(403).json({error:'اشتراك الشركة منتهي أو معطل؛ راجع الإدارة'});
    if(company){const revisions=await db.select().from(schema.systemData).where(eq(schema.systemData.key,'ownerPasswordRevision:'+companyId)).limit(1);return res.json({token:signToken({role:'admin',companyId,name:'مدير '+company.name,username:company.adminUsername,passwordRevision:(revisions[0]?.value as any)?.revision}),role:'admin',companyId,companyCode:company.companyCode,name:'مدير '+company.name,isMaster:true,...fullAdminAccess()});}
    const {password:ignored,...safe}=admin;return res.json({token:signToken({role:'admin',companyId,id:admin.id,name:admin.name,username:admin.username}),role:'admin',...safe,companyId,...await resolveAdminAccess({role:'admin',companyId,id:admin.id})});
  }catch{return res.status(503).json({error:'تعذر تسجيل الدخول؛ حاول لاحقًا'});}
});
app.post('/api/auth/employee-login',async(req,res)=>{
 const {username,password}=req.body || {};if(typeof username!=='string'||typeof password!=='string'||!username.trim()||!password)return res.status(400).json({error:'أدخل اسم المستخدم أو البريد وكلمة المرور'});
 try{
  const account=resolveIdentity(await allIdentities(db),username,'employee');if(!account)return res.status(401).json(loginError);
  const companyId=account.companyId,data=await getMainDataByCompanyId(companyId),employee=data?.employees?.find((e:any)=>String(e.id)===account.id);
  if(!employee || String(password).trim()!==String(employee.password || '123456').trim())return res.status(401).json(loginError);
  if(!isActiveEmployee(employee))return res.status(403).json({error:'حساب الموظف غير نشط؛ راجع الإدارة'});
  if(!await companyCanLogin(companyId))return res.status(403).json({error:'اشتراك الشركة منتهي أو معطل؛ راجع الإدارة'});
  const {password:ignored,webauthnCredentials:hidden,...safe}=employee;
  return res.json({token:signToken({role:'employee',companyId,id:employee.id,name:employee.name,username:employee.username}),...safe,companyId});
 }catch{return res.status(503).json({error:'تعذر تسجيل الدخول؛ حاول لاحقًا'});}
});

// --- WEBAUTHN ENDPOINTS ---

app.post('/api/auth/webauthn-register-options', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const { companyId: rawCompanyId, empId } = req.body || {};
  const companyId = rawCompanyId || 'default';
  const auth = (req as any).auth as AuthTokenPayload;

  const caller=tryReadAuth(req);
  if(caller && !canReadCompany(caller,companyId)) return res.status(403).json({error:'لا يمكن الوصول لبيانات شركة أخرى'});

  if (!empId) {
    return res.status(400).json({ error: 'empId مطلوب' });
  }

  if (auth.role === 'employee' && String(empId) !== String(auth.id)) {
    return res.status(403).json({ error: 'لا يمكنك تسجيل بصمة لحساب موظف آخر' });
  }

  try {
    const mainData = await getMainDataByCompanyId(companyId);
    const employees = mainData?.employees || [];
    const employee = employees.find((e: any) => String(e.id) === String(empId));

    if (!employee) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    const excludeCredentials = employee.webauthnCredentials?.map((cred: StoredWebAuthnCredential) => ({
     id: cred.id,
     type: 'public-key' as const,
     transports: (cred.transports || ['internal']) as AuthenticatorTransport[],
   })) || [];

    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: WEBAUTHN_RP_ID,
      userID: new Uint8Array(Buffer.from(String(employee.id))),
      userName: employee.username || employee.phone || String(employee.id),
      userDisplayName: employee.name || employee.username || 'Employee',
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    setStoredChallenge(companyId, employee.id, 'registration', options.challenge);
    return res.json(options);
  } catch (error: any) {
    console.error('Error generating WebAuthn registration options:', error);
    return res.status(500).json({ error: 'فشل تجهيز تسجيل البصمة', details: error?.message || String(error) });
  }
});

app.post('/api/auth/webauthn-register-verify', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const { companyId: rawCompanyId, empId, credential } = req.body || {};
  const companyId = rawCompanyId || 'default';
  const auth = (req as any).auth as AuthTokenPayload;

  if (!empId || !credential) {
    return res.status(400).json({ error: 'بيانات التسجيل غير مكتملة' });
  }

  if (auth.role === 'employee' && String(empId) !== String(auth.id)) {
    return res.status(403).json({ error: 'لا يمكنك تسجيل بصمة لحساب موظف آخر' });
  }

  try {
    const expectedChallenge = consumeStoredChallenge(companyId, empId, 'registration');
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'انتهت صلاحية challenge أو لم يتم إنشاؤه' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: WEBAUTHN_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'فشل التحقق من تسجيل البصمة' });
    }

    const mainData = await getMainDataByCompanyId(companyId);
    const employees = mainData?.employees || [];
    const employeeIndex = employees.findIndex((e: any) => String(e.id) === String(empId));

    if (employeeIndex === -1) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    const regInfo: any = verification.registrationInfo;
    const credentialInfo = regInfo.credential;

    const newCredential: StoredWebAuthnCredential = {
      id: credentialInfo.id,
      publicKey: Buffer.from(credentialInfo.publicKey).toString('base64url'),
      counter: credentialInfo.counter,
      transports: credential.response?.transports || ['internal'],
      deviceType: regInfo.credentialDeviceType,
      backedUp: regInfo.credentialBackedUp,
    };

    const currentEmployee = employees[employeeIndex];
    const existingCreds: StoredWebAuthnCredential[] = currentEmployee.webauthnCredentials || [];
    const withoutSameId = existingCreds.filter((c) => c.id !== newCredential.id);

    employees[employeeIndex] = {
      ...currentEmployee,
      webauthnCredentials: [...withoutSameId, newCredential],
    };

    await saveEmployeeCredentials(companyId, String(empId), employees[employeeIndex].webauthnCredentials);

    return res.json({ verified: true, message: 'تم تسجيل البصمة بنجاح' });
  } catch (error: any) {
    console.error('Error verifying WebAuthn registration:', error);
    return res.status(500).json({ error: 'فشل تأكيد تسجيل البصمة', details: error?.message || String(error) });
  }
});

app.post('/api/auth/webauthn-challenge', async (req, res) => {
  let { empId, companyId: rawCompanyId } = req.body || {};
  let companyId = rawCompanyId || 'default';
  if(req.body?.username){try{const account=resolveIdentity(await allIdentities(db),req.body.username,'employee');if(!account)return res.status(401).json(loginError);empId=account.id;companyId=account.companyId;}catch{return res.status(503).json({error:'تعذر التحقق من الحساب'});}}

  const caller=tryReadAuth(req);
  if(caller && !canReadCompany(caller,companyId)) return res.status(403).json({error:'لا يمكن الوصول لبيانات شركة أخرى'});

  if (!empId) {
    return res.status(400).json({ error: 'empId مطلوب' });
  }

  try {
    const mainData = await getMainDataByCompanyId(companyId);
    const employees = mainData?.employees || [];
    const employee = employees.find((e: any) => String(e.id) === String(empId));

    if (!employee) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    if (!isActiveEmployee(employee)) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.' });
    const creds: StoredWebAuthnCredential[] = employee.webauthnCredentials || [];
    if (!creds.length) {
      return res.status(404).json({ error: 'لم يتم تسجيل بصمة بيومترية لهذا الموظف بعد' });
    }

    const options = await generateAuthenticationOptions({
      rpID: WEBAUTHN_RP_ID,
      userVerification: 'required',
      allowCredentials: creds.map((cred) => ({
      id: cred.id,
      type: 'public-key' as const,
      transports: (cred.transports || ['internal']) as AuthenticatorTransport[],
      })),
   });

    if(!await companyCanLogin(companyId))return res.status(403).json({error:'اشتراك الشركة منتهي أو معطل'});
    setStoredChallenge(companyId, employee.id, 'authentication', options.challenge);

    return res.json({
      companyId,empId:employee.id,
      challenge: options.challenge,
      credentialIds: creds.map((c) => c.id),
    });
  } catch (error: any) {
    console.error('Error generating WebAuthn auth challenge:', error);
    return res.status(500).json({ error: 'فشل تجهيز التحقق البيومتري', details: error?.message || String(error) });
  }
});

app.post('/api/auth/webauthn-verify', async (req, res) => {
  const {
    empId,
    companyId: rawCompanyId,
    credentialId,
    clientDataJSON,
    authenticatorData,
    signature,
    userHandle,
  } = req.body || {};

  const companyId = rawCompanyId || 'default';
  const caller=tryReadAuth(req);
  if(caller && !canReadCompany(caller,companyId)) return res.status(403).json({error:'لا يمكن الوصول لبيانات شركة أخرى'});

  if (!empId || !credentialId || !clientDataJSON || !authenticatorData || !signature) {
    return res.status(400).json({ error: 'بيانات التحقق البيومتري غير مكتملة' });
  }

  try {
    if(!await companyCanLogin(companyId))return res.status(403).json({error:'اشتراك الشركة منتهي أو معطل'});
    const expectedChallenge = consumeStoredChallenge(companyId, empId, 'authentication');
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'انتهت صلاحية challenge أو لم يتم إنشاؤه' });
    }

    const mainData = await getMainDataByCompanyId(companyId);
    const employees = mainData?.employees || [];
    const employee = employees.find((e: any) => String(e.id) === String(empId));

    if (!employee) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    if (!isActiveEmployee(employee)) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.' });
    const creds: StoredWebAuthnCredential[] = employee.webauthnCredentials || [];
    const storedCred = creds.find((c) => c.id === credentialId);

    if (!storedCred) {
      return res.status(404).json({ error: 'بيانات البصمة المسجلة غير موجودة لهذا الحساب' });
    }

    const verification = await verifyAuthenticationResponse({
     response: {
     id: credentialId,
     rawId: credentialId,
     type: 'public-key',
     response: {
      clientDataJSON,
      authenticatorData,
      signature,
      userHandle,
     },
     clientExtensionResults: {},
     },
     expectedChallenge,
     expectedOrigin: WEBAUTHN_ORIGIN,
     expectedRPID: WEBAUTHN_RP_ID,
     requireUserVerification: true,
     credential: {
     id: storedCred.id,
     publicKey: bufferFromBase64url(storedCred.publicKey),
     counter: storedCred.counter,
     transports: (storedCred.transports || ['internal']) as AuthenticatorTransport[],
     },
    });

    if (!verification.verified) {
      return res.status(401).json({ error: 'فشل التحقق البيومتري' });
    }

    storedCred.counter = verification.authenticationInfo.newCounter;

    await saveEmployeeCredentials(companyId, String(empId), creds);

    const { password: _pw, webauthnCredentials:hidden, ...safeEmp } = employee;
    const token = signToken({
      role: 'employee',
      companyId,
      id: employee.id,
      name: employee.name,
      username: employee.username,
    });

    return res.json({
      token,
      ...safeEmp,
      companyId,
      biometricVerified: true,
    });
  } catch (error: any) {
    console.error('Error verifying WebAuthn authentication:', error);
    return res.status(500).json({ error: 'فشل التحقق النهائي من البصمة', details: error?.message || String(error) });
  }
});

// --- API ENDPOINTS ---

// Database Connection Status & Health Check
app.get('/api/db-status', requireAuth(['superadmin'], false), async (req, res) => {
  const connectionString = process.env.DATABASE_URL;
  const dbSchema = getDbSchemaName();
  const host = process.env.SQL_HOST || (connectionString ? 'via connection string' : 'localhost');
  const dbName = process.env.SQL_DB_NAME || 'postgres';

  try {
    const client = await pool.connect();
    try {
      const dbRes = await client.query('SELECT NOW(), current_schema()');
      return res.json({
        status: 'connected',
        serverTime: dbRes.rows[0]?.now,
        currentSchema: dbRes.rows[0]?.current_schema,
        targetSchema: dbSchema,
        host: isProd ? undefined : host,
        database: isProd ? undefined : dbName,
        message: 'تم الاتصال بقاعدة بيانات PostgreSQL بنجاح'
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({
      status: 'disconnected',
      error: 'فشل الاتصال بقاعدة البيانات PostgreSQL',
      details: isProd ? undefined : (err?.message || String(err)),
      host: isProd ? undefined : host,
      database: isProd ? undefined : dbName,
      targetSchema: dbSchema
    });
  }
});

// 1. Get/Seed Main App Data (Tenant Aware)
app.get('/api/main-data', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
  const auth = tryReadAuth(req);
  // Employee PIN codes / the superadmin password are only included for a caller who is
  // logged in as that company's admin, or the platform admin for company 101.
  if (auth && !canReadCompany(auth, companyId)) return res.status(403).json({ error: 'بيانات شركة أخرى غير متاحة' });
  if (auth && companyId !== 'default') {
    try { if (!await companyCanLogin(companyId)) return res.status(403).json({error:'اشتراك الشركة غير نشط أو تم حذفها'}); }
    catch { return res.status(503).json({error:'تعذر التحقق من الشركة'}); }
  }
  let access = fullAdminAccess();
  if (auth?.role === 'admin') { try { await validateOwnerSession(auth); access = await resolveAdminAccess(auth); } catch { return res.status(403).json({ error: 'حساب المسؤول غير متاح' }); } }
  const visibleMainData = async (value: any) => {
    if (!auth) return { departments: [], employees: [], shiftTypes: [], schedule: {}, settings: { companyName: 'نظام الدوام' } };
    if (auth.role !== 'employee') return { ...scopedMainData(sanitizeMainData(value, true), access), _adminAccess: access };
    const result=employeeMainData(value, auth);
    const photos=await db.select().from(schema.systemData).where(eq(schema.systemData.key,employeePhotoKey(companyId,String(auth.id)))).limit(1);
    return {...result,employees:result.employees.map((e:any)=>String(e.id)===String(auth.id)?{...e,photoDataUrl:(photos[0]?.value as any)?.dataUrl || ''}:e)};
  };
  const canSeeSecrets = !!auth && (auth.role === 'superadmin' || (auth.role === 'admin' && auth.companyId === companyId));

  try {
    const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    
    if (auth?.role === 'employee' && !isActiveEmployee((result[0]?.value as any)?.employees?.find((e: any) => String(e.id) === String(auth.id)))) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.', code: 'EMPLOYEE_INACTIVE' });
    if (result.length === 0) {
      if (!auth) return res.json(await visibleMainData(defaultMainData));
      // Seed initial data directly into PostgreSQL database
      let initialVal = defaultMainData;
      if (companyId !== 'default') {
        const comp = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
        if (!comp.length) return res.status(404).json({error:'الشركة غير موجودة'});
        const compName = comp[0].name;
        initialVal = createCleanCompanyData(compName);
      }
      
      const inserted = await db.insert(schema.systemData).values({
        key,
        value: initialVal,
      }).returning();
      
      return res.json(await visibleMainData({ ...(inserted[0].value as any), _version: mainDataVersion(inserted[0].value) }));
    }
    
    return res.json(await visibleMainData({ ...(result[0].value as any), _version: mainDataVersion(result[0].value) }));
  } catch (error: any) {
    console.error('Error fetching main-data from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في الاتصال بقاعدة البيانات PostgreSQL أثناء جلب البيانات الرئيسية',
      details: error?.message || String(error)
    });
  }
});

// 2. Save Main App Data (Tenant Aware)
// Admins/superadmin manage the whole company blob from the dashboard, so they keep
// full write access. An employee's only legitimate use of this endpoint is changing
// their own password, so their payload is narrowed down to just that before saving —
// this stops one logged-in employee token from rewriting another employee's data,
// the schedule, or the whole company's settings.
app.post('/api/main-data', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const { _baseVersion, _version, _adminAccess: ignoredAccess, _schedulePublication: ignoredPublication, scheduleNotice: ignoredNotice, ...rawPayload } = req.body || {};
  let payload = rawPayload;
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
  const auth = (req as any).auth as AuthTokenPayload;
  if (!payload || !Array.isArray(payload.employees) || !Array.isArray(payload.departments) || !Array.isArray(payload.shiftTypes) || !payload.schedule || typeof payload.schedule !== 'object' || Array.isArray(payload.schedule)) {
    return res.status(400).json({ error: 'بيانات الحفظ ناقصة أو غير صحيحة. لم يتم تعديل البيانات المسجلة.' });
  }

  if(new Set(payload.employees.map((e:any)=>String(e?.id))).size!==payload.employees.length || payload.employees.some((e:any)=>!e || !e.id))return res.status(400).json({error:'معرّفات الموظفين غير صحيحة أو مكررة'});
  if (auth.role !== 'employee' && payload.employees.some((e: any) => e.status !== undefined && !['active', 'suspended', 'archived'].includes(e.status))) return res.status(400).json({ error: 'حالة الموظف غير صحيحة' });
  try {
    const outcome = await db.transaction(async tx => {
      await identityLock(tx);
      const result = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);

      if (result.length === 0) {
        if (auth.role === 'employee' || (auth.role === 'admin' && auth.id !== undefined)) return { status: 404, body: { error: 'بيانات الشركة غير موجودة' } };
        await assertUnique(tx,employeeIdentities(companyId,payload.employees));
        const initialValue = { ...payload, employees: preserveEmailVerification([], saveEmploymentHistory([], payload.employees)) };
        const inserted = await tx.insert(schema.systemData).values({
          key,
          value: initialValue,
        }).onConflictDoNothing().returning();
        if (!inserted.length) return { status: 409, body: { error: 'تم إنشاء بيانات الشركة من جلسة أخرى. أعد تحميل البيانات قبل الحفظ.', code: 'DATA_CONFLICT' } };
        for (const change of employeeChanges([], initialValue.employees)) await audit(tx, auth, companyId, change.action, change.id, { ...change, actorName: auth.name || auth.username || 'المسؤول' });
        return { status: 200, body: { ...sanitizeMainData(inserted[0].value, true), _version: mainDataVersion(inserted[0].value) } };
      }

      const currentValue = result[0].value;
      if (auth.role !== 'employee' && _baseVersion !== mainDataVersion(currentValue)) {
        return { status: 409, body: { error: 'تغيرت البيانات في جلسة أخرى. لم يتم استبدالها. أعد تحميل آخر نسخة ثم أعد تطبيق تعديلك.', code: 'DATA_CONFLICT' } };
      }
      if (auth.role === 'admin' && auth.id !== undefined) {
        try { payload = mergeAdminData(currentValue, payload, requestAccess(req)); } catch (error: any) { return { status: 403, body: { error: error.message } }; }
      }
      if (auth.role !== 'employee' && (currentValue as any).employees?.some((e: any) => !payload.employees.some((next: any) => String(next.id) === String(e.id)))) return { status: 400, body: { error: 'لا تحذف الموظفين نهائيًا؛ استخدم الأرشفة للحفاظ على سجلاتهم.' } };
      if (auth.role !== 'employee' && payload.employees.some((e: any) => { const old = (currentValue as any).employees?.find((previous: any) => String(previous.id) === String(e.id)); return old && employeeStatus(old) !== employeeStatus(e) && (typeof e.statusReason !== 'string' || !e.statusReason.trim() || e.statusReason.length > 500); })) return { status: 400, body: { error: 'أدخل سبب تغيير الحالة، بحد أقصى 500 حرف' } };
      if (auth.role !== 'employee') {
        try { payload.employees = preserveEmailVerification((currentValue as any).employees || [], saveEmploymentHistory((currentValue as any).employees || [], payload.employees)); }
        catch (error: any) { return { status: 400, body: { error: error.message } }; }
      }
      let valueToSave: any = { ...payload, _schedulePublication: (currentValue as any)._schedulePublication || { ...scheduleContent(currentValue), publishedAt: null, legacy: true } };
      if (auth.role === 'employee') {
        // Only allow this employee to change their own password; everything else is
        // taken from the data already stored on the server, ignoring the rest of the payload.
        const current = result[0].value as any;
        const incomingEmp = (payload?.employees || []).find((e: any) => String(e.id) === String(auth.id));
        const nextEmployees = (current.employees || []).map((e: any) =>
          String(e.id) === String(auth.id) && incomingEmp ? { ...e, password: incomingEmp.password } : e
        );
        valueToSave = { ...current, employees: nextEmployees, updatedAt: Date.now() };
      }

      await assertUnique(tx,employeeIdentities(companyId,valueToSave.employees),employeeIdentities(companyId,(currentValue as any).employees || []));
      const updated = await tx.update(schema.systemData)
        .set({ value: valueToSave, updatedAt: new Date() })
        .where(and(eq(schema.systemData.key, key), eq(schema.systemData.value, currentValue)))
        .returning();
      if (!updated.length) return { status: 409, body: { error: 'حفظ مستخدم آخر تعديلًا أثناء طلبك. أعد تحميل البيانات قبل المحاولة.', code: 'DATA_CONFLICT' } };
      for (const change of employeeChanges((currentValue as any).employees || [], valueToSave.employees)) await audit(tx, auth, companyId, change.action, change.id, { ...change, actorName: auth.name || auth.username || 'المسؤول' });
      return { status: 200, body: { ...(auth.role === 'employee' ? employeeMainData(updated[0].value, auth) : { ...scopedMainData(sanitizeMainData(updated[0].value, true), requestAccess(req)), _adminAccess: requestAccess(req) }), _version: mainDataVersion(updated[0].value) } };
    });
    return res.status(outcome.status).json(outcome.body);
  } catch (error: any) {
    if(error.status===409)return res.status(409).json({error:error.message,code:error.code});
    console.error('Error saving main-data to PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في حفظ البيانات في قاعدة بيانات PostgreSQL',
      details: error?.message || String(error)
    });
  }
});

// 3. Registration Requests (Tenant Aware)
// Submitting a request stays public (it's the sign-up form itself); reading the list
// (which includes the applicant's chosen password) and approving/rejecting are admin-only.
app.get('/api/schedule-publication', requireAuth(['admin', 'superadmin']), async (req, res) => {
  try {
    const data = await getMainDataByCompanyId(String(req.query.companyId || 'default'));
    if (!data) return res.status(404).json({ error: 'بيانات الشركة غير موجودة' });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ publishedSignature: mainDataVersion(scheduleContent(effectiveScheduleData(data))), publishedAt: data._schedulePublication?.publishedAt || null, publishedBy: data._schedulePublication?.publishedBy || null });
  } catch { return res.status(500).json({ error: 'تعذر تحميل حالة النشر' }); }
});
app.post('/api/schedule-publication', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const auth = (req as any).auth as AuthTokenPayload;
  const companyId = String(req.query.companyId || 'default');
  const expectedSignature = req.body?.expectedSignature;
  if (typeof expectedSignature !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSignature)) return res.status(400).json({ error: 'يلزم مراجعة الجدول قبل نشره' });
  try {
    const outcome = await db.transaction(async tx => {
      const key = getMainDataKey(companyId);
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1).for('update');
      const data: any = rows[0]?.value;
      if (!data) return { status: 404, body: { error: 'بيانات الشركة غير موجودة' } };
      const signature = mainDataVersion(scheduleContent(data));
      if (signature !== expectedSignature) return { status: 409, body: { error: 'تغيّر الجدول أو لم تُحفظ تعديلاتك. حدّث البيانات وراجعها قبل النشر.' } };
      if (signature === mainDataVersion(scheduleContent(effectiveScheduleData(data)))) return { status: 200, body: { publishedSignature: signature, publishedAt: data._schedulePublication?.publishedAt || null, unchanged: true } };
      const publication = { ...scheduleContent(data), publishedAt: new Date().toISOString(), publishedBy: auth.name || auth.username || 'المسؤول' };
      await tx.update(schema.systemData).set({ value: { ...data, _schedulePublication: publication }, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
      await audit(tx, auth, companyId, 'schedule.publish', companyId, { actorName: publication.publishedBy, signature, publishedAt: publication.publishedAt });
      return { status: 200, body: { publishedSignature: signature, publishedAt: publication.publishedAt, publishedBy: publication.publishedBy } };
    });
    return res.status(outcome.status).json(outcome.body);
  } catch { return res.status(500).json({ error: 'تعذر نشر الجدول، لم يتم تأكيد النشر' }); }
});

// Narrow employee profile update: token identity only, locked row preserves admin changes.
// Employee self-service never accepts a target employee ID from the client.
app.get('/api/employee-profile',requireAuth(['employee']),async(req,res)=>{
  const auth=(req as any).auth as AuthTokenPayload;
  try{const data=await getMainDataByCompanyId(auth.companyId);const employee=data?.employees?.find((e:any)=>String(e.id)===String(auth.id));if(!employee)return res.status(404).json({error:'الحساب غير موجود'});const photos=await db.select().from(schema.systemData).where(eq(schema.systemData.key,employeePhotoKey(auth.companyId,String(auth.id)))).limit(1);return res.json(selfProfile({...employee,photoDataUrl:(photos[0]?.value as any)?.dataUrl || ''},data.departments));}
  catch{return res.status(503).json({error:'تعذر تحميل الملف الشخصي'});}
});
app.patch('/api/employee-profile',requireAuth(['employee']),async(req,res)=>{
  const auth=(req as any).auth as AuthTokenPayload;
  try{
    const update=selfProfileUpdate(req.body);
    const {photoDataUrl,...fields}=update;
    const profile=await db.transaction(async tx=>{
      await identityLock(tx);const key=getMainDataKey(auth.companyId);
      const [row]=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,key)).for('update');const data:any=row?.value;
      const current=data?.employees?.find((e:any)=>String(e.id)===String(auth.id));if(!isActiveEmployee(current))throw attendanceError(403,'الحساب غير نشط');
      const photoKey=employeePhotoKey(auth.companyId,String(auth.id));
      const photos=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,photoKey)).limit(1);
      const previousPhoto=(photos[0]?.value as any)?.dataUrl || '';
      const photoChanged=photoDataUrl!==undefined && photoDataUrl!==previousPhoto;
      const employee=preserveEmailVerification([current],[{...current,...fields,...(photoChanged?{photoUpdatedAt:new Date().toISOString()}:{})}])[0];
      await assertUnique(tx,employeeIdentities(auth.companyId,[employee]),employeeIdentities(auth.companyId,[current]));
      if(photoChanged){
        if(photoDataUrl==='')await tx.delete(schema.systemData).where(eq(schema.systemData.key,photoKey));
        else await tx.insert(schema.systemData).values({key:photoKey,value:{dataUrl:photoDataUrl}}).onConflictDoUpdate({target:schema.systemData.key,set:{value:{dataUrl:photoDataUrl},updatedAt:new Date()}});
      }
      if(photoChanged || Object.keys(fields).some(key=>current[key]!==employee[key])){
        await tx.update(schema.systemData).set({value:{...data,employees:data.employees.map((e:any)=>String(e.id)===String(auth.id)?employee:e)},updatedAt:new Date()}).where(eq(schema.systemData.key,key));
        await audit(tx,auth,auth.companyId,'employee.self-profile',auth.id,{fields:Object.keys(update),photoChanged});
      }
      return selfProfile({...employee,photoDataUrl:photoDataUrl===undefined?previousPhoto:photoDataUrl},data.departments);
    });return res.json(profile);
  }catch(error:any){return res.status(error.status || 503).json({error:error.status?error.message:'تعذر حفظ الملف الشخصي'});}
});
app.get('/api/employee-attendance',requireAuth(['employee']),async(req,res)=>{
  const auth=(req as any).auth as AuthTokenPayload;const month=req.query.month || riyadhMonth();
  if(!validMonth(month))return res.status(400).json({error:'حدد شهرًا صحيحًا'});
  const from=String(month)+'-01',last=new Date(Date.UTC(Number(String(month).slice(0,4)),Number(String(month).slice(5,7)),0)).getUTCDate(),to=String(month)+'-'+last;
  try{
    const data=await getMainDataByCompanyId(auth.companyId);const employee=data?.employees?.find((e:any)=>String(e.id)===String(auth.id));
    if(!employee)return res.status(404).json({error:'الحساب غير موجود'});
    const records=await db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId,auth.companyId),eq(schema.attendance.empId,String(auth.id)),sql`${schema.attendance.date} >= ${from}`,sql`${schema.attendance.date} <= ${to}`));
    const leaves=await db.select().from(schema.requests).where(and(eq(schema.requests.companyId,auth.companyId),eq(schema.requests.empId,String(auth.id)),eq(schema.requests.type,'leave'),eq(schema.requests.status,'approved'),sql`${schema.requests.date} >= ${from}`,sql`${schema.requests.date} <= ${to}`));
    const published=effectiveScheduleData(data);
    const days=analyzeAttendance(buildAttendanceDays(records,data.settings),{...published,employees:[employee]},{from,to,empId:String(auth.id),dept:''},leaves).map(privateAttendanceDay).sort((a,b)=>b.date.localeCompare(a.date));
    return res.json({month,generatedAt:new Date().toISOString(),items:days,totalMinutes:days.reduce((sum,d)=>sum+(d.minutes || 0),0),absentDays:days.filter(d=>d.absent).length,lateDays:days.filter(d=>d.lateMinutes>0).length,reviewDays:days.filter(d=>d.needsReview).length});
  }catch{return res.status(503).json({error:'تعذر تحميل البصمات والغياب'});}
});

app.patch('/api/employee-profile/email', requireAuth(['employee']), async (req, res) => {
  const auth = (req as any).auth as AuthTokenPayload;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!validEmployeeEmail(email)) return res.status(400).json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا' });
  try {
    const result = await db.transaction(async tx => {
      await identityLock(tx);
      const key = auth.companyId === 'default' ? 'mainData' : 'mainData_' + auth.companyId;
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1).for('update');
      const data: any = rows[0]?.value;
      if (!data?.employees?.some((e: any) => String(e.id) === String(auth.id))) return null;
      const employee = data.employees.find((e: any) => String(e.id) === String(auth.id));
      if (!isActiveEmployee(employee)) return null;
      if (employee.email === email) return true;
      await assertUnique(tx,employeeIdentities(auth.companyId,[{...employee,email}]),employeeIdentities(auth.companyId,[employee]));
      const value = { ...data, employees: data.employees.map((e: any) => String(e.id) === String(auth.id) ? preserveEmailVerification([e], [{ ...e, email }])[0] : e) };
      await tx.update(schema.systemData).set({ value, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
      await audit(tx, auth, auth.companyId, 'employee.email', auth.id, { name: data.employees.find((e: any) => String(e.id) === String(auth.id)).name, actorName: auth.name || 'الموظف', changes: { email: { before: data.employees.find((e: any) => String(e.id) === String(auth.id)).email || null, after: email } } });
      return true;
    });
    if (!result) return res.status(404).json({ error: 'حساب الموظف غير موجود' });
    return res.json({ email });
  } catch(error:any) { return res.status(error.status || 500).json({ error: error.status?error.message:'تعذر حفظ البريد، حاول مرة أخرى' }); }
});

// OTP metadata is separate from main-data and never returned to clients.
const emailVerificationAvailable = () => !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
app.get('/api/employee-profile/email-verification', requireAuth(['employee']), async (req, res) => {
  const auth = (req as any).auth as AuthTokenPayload;
  res.set('Cache-Control', 'private, no-store');
  try {
    const data = await getMainDataByCompanyId(auth.companyId);
    const employee = data?.employees?.find((e: any) => String(e.id) === String(auth.id));
    if (!employee) return res.status(404).json({ error: 'حساب الموظف غير موجود' });
    const keys = [emailVerificationKey(auth.companyId, String(auth.id)), emailVerificationQuotaKey(auth.companyId)];
    const rows = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} IN (${keys[0]}, ${keys[1]})`);
    return res.json(verificationStatus(employee, rows.find(r => r.key === keys[0])?.value, rows.find(r => r.key === keys[1])?.value, emailVerificationAvailable()));
  } catch { return res.status(500).json({ error: 'تعذر تحميل حالة تأكيد البريد' }); }
});
app.post('/api/employee-profile/email-verification/send', requireAuth(['employee']), async (req, res) => {
  const auth = (req as any).auth as AuthTokenPayload;
  res.set('Cache-Control', 'private, no-store');
  if (!emailVerificationAvailable()) return res.status(503).json({ error: 'خدمة تأكيد البريد غير مفعّلة؛ البريد محفوظ ويمكنك استخدام الجدول والبصمة' });
  const key = emailVerificationKey(auth.companyId, String(auth.id)), quotaKey = emailVerificationQuotaKey(auth.companyId);
  const nonce = crypto.randomUUID(), code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  let claim: any;
  try {
    claim = await db.transaction(async tx => {
      // Company row serializes rate claims with email/profile changes; network calls run after commit.
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, getMainDataKey(auth.companyId))).limit(1).for('update');
      const data: any = rows[0]?.value;
      const employee = data?.employees?.find((e: any) => String(e.id) === String(auth.id));
      if (!isActiveEmployee(employee)) return { status: 403, body: { error: 'حساب الموظف غير نشط' } };
      if (!validEmployeeEmail(employee.email)) return { status: 400, body: { error: 'احفظ بريدًا إلكترونيًا صحيحًا أولًا' } };
      if (employeeEmailVerified(employee)) return { status: 200, body: { ...verificationStatus(employee, null, null, true), message: 'بريدك مؤكد بالفعل' } };
      const previousRows = await tx.select().from(schema.systemData).where(sql`${schema.systemData.key} IN (${key}, ${quotaKey})`);
      const previous: any = previousRows.find(r => r.key === key)?.value, quota: any = previousRows.find(r => r.key === quotaKey)?.value;
      const retryAfter = verificationRateLimit(previous, quota, Date.now());
      if (retryAfter) return { status: 429, body: { ...verificationStatus(employee, previous, quota, true), error: 'انتظر قبل طلب رمز جديد', retryAfter } };
      const now = Date.now();
      const state = newVerificationState(previous, quota, employee.email, verificationCodeHash(JWT_SECRET, auth.companyId, String(auth.id), employee.email, nonce, code), nonce, now);
      for (const [entryKey, value] of [[key, state.challenge], [quotaKey, state.quota]] as const) await tx.insert(schema.systemData).values({ key: entryKey, value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
      return { employee, company: data.settings?.companyName || 'الشركة', challenge: state.challenge, quota: state.quota };
    });
    if (claim.status) { if (claim.status === 429) res.set('Retry-After', String(claim.body.retryAfter)); return res.status(claim.status).json(claim.body); }
    let providerId: string | undefined, delivery = 'sent';
    try { providerId = await deliverWelcome(verificationPayload(claim.employee, claim.company, code), 'employee-email-verification-' + nonce); }
    catch { delivery = 'failed'; }
    const result = await db.transaction(async tx => {
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, getMainDataKey(auth.companyId))).limit(1).for('update');
      const employee = (rows[0]?.value as any)?.employees?.find((e: any) => String(e.id) === String(auth.id));
      const challenges = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
      const current: any = challenges[0]?.value;
      if (!isActiveEmployee(employee) || normalizedEmail(employee.email) !== claim.challenge.email || current?.nonce !== nonce) return null;
      if (!current.consumedAt) await tx.update(schema.systemData).set({ value: { ...current, delivery, ...(providerId ? { providerId } : {}) }, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
      if (delivery === 'sent') await audit(tx, auth, auth.companyId, 'employee.email.verification.send', auth.id, { actorName: employee.name, email: employee.email });
      return verificationStatus(employee, current, claim.quota, true);
    });
    if (!result) return res.status(409).json({ error: 'تغير البريد أو الحساب أثناء الإرسال؛ حدّث بياناتك ثم حاول مجددًا' });
    return res.status(delivery === 'sent' ? 200 : 503).json({ ...result, ...(delivery === 'sent' ? { message: 'قُبلت رسالة الرمز بواسطة خدمة البريد. راجع البريد والرسائل غير المرغوب فيها' } : { error: 'تعذر تأكيد إرسال الرمز. إذا وصل يمكنك استخدامه، أو انتظر ثم أعد الإرسال' }) });
  } catch { return res.status(500).json({ error: 'تعذر طلب رمز التأكيد، حاول لاحقًا' }); }
});
app.post('/api/employee-profile/email-verification/confirm', requireAuth(['employee']), async (req, res) => {
  const auth = (req as any).auth as AuthTokenPayload;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  res.set('Cache-Control', 'private, no-store');
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'أدخل رمزًا من 6 أرقام' });
  try {
    const outcome = await db.transaction(async tx => {
      const key = getMainDataKey(auth.companyId), challengeKey = emailVerificationKey(auth.companyId, String(auth.id));
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1).for('update');
      const data: any = rows[0]?.value;
      const employee = data?.employees?.find((e: any) => String(e.id) === String(auth.id));
      if (!isActiveEmployee(employee)) return { status: 403, body: { error: 'حساب الموظف غير نشط' } };
      const challenges = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, challengeKey)).limit(1);
      const challenge: any = challenges[0]?.value;
      if (!challenge || challenge.consumedAt || challenge.email !== normalizedEmail(employee.email) || challenge.expiresAt <= Date.now()) return { status: 409, body: { error: 'الرمز منتهي أو البريد تغير؛ اطلب رمزًا جديدًا' } };
      if (challenge.attempts >= verificationAttempts) return { status: 429, body: { error: 'انتهت المحاولات المسموحة؛ اطلب رمزًا جديدًا بعد مهلة الإرسال', attemptsRemaining: 0 } };
      const expected = verificationCodeHash(JWT_SECRET, auth.companyId, String(auth.id), employee.email, challenge.nonce, code);
      if (!matchesVerificationCode(challenge.codeHash, expected)) {
        await tx.update(schema.systemData).set({ value: { ...challenge, attempts: challenge.attempts + 1 }, updatedAt: new Date() }).where(eq(schema.systemData.key, challengeKey));
        return { status: 400, body: { error: 'الرمز غير صحيح', attemptsRemaining: verificationAttempts - challenge.attempts - 1 } };
      }
      const verifiedAt = new Date().toISOString();
      const value = { ...data, employees: data.employees.map((e: any) => String(e.id) === String(auth.id) ? { ...e, emailVerifiedAt: verifiedAt, emailVerifiedAddress: normalizedEmail(employee.email) } : e) };
      await tx.update(schema.systemData).set({ value, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
      const { codeHash: ignoredHash, ...consumed } = challenge;
      await tx.update(schema.systemData).set({ value: { ...consumed, consumedAt: Date.now() }, updatedAt: new Date() }).where(eq(schema.systemData.key, challengeKey));
      await audit(tx, auth, auth.companyId, 'employee.email.verify', auth.id, { actorName: employee.name, email: employee.email, verifiedAt });
      return { status: 200, body: { ...verificationStatus({ ...employee, emailVerifiedAt: verifiedAt, emailVerifiedAddress: normalizedEmail(employee.email) }, { ...consumed, consumedAt: Date.now() }, null, emailVerificationAvailable()), message: 'تم تأكيد البريد الإلكتروني' } };
    });
    return res.status(outcome.status).json(outcome.body);
  } catch { return res.status(500).json({ error: 'تعذر تأكيد البريد، حاول مرة أخرى' }); }
});

// Only stored employee addresses can receive welcome mail; durable claim prevents concurrent sends.
app.post('/api/employees/:id/welcome-email', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = String(req.query.companyId || 'default');
  const key = welcomeStateKey(companyId, req.params.id);
  let claimed: any;
  try {
    const data = await db.select().from(schema.systemData).where(eq(schema.systemData.key, companyId === 'default' ? 'mainData' : 'mainData_' + companyId)).limit(1);
    const employee = (data[0]?.value as any)?.employees?.find((e: any) => e.id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'الموظف غير موجود' });
    const companies = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    const rows = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    const previous: any = rows[0]?.value;
    if (!isActiveEmployee(employee) || !validEmployeeEmail(employee.email)) return res.status(409).json({ error: 'حساب أو بريد الموظف يحتاج مراجعة' });
    if (previous?.status === 'sent') return res.json({ message: 'سبق قبول رسالة الترحيب بواسطة خدمة البريد', status: 'sent' });
    if (previous?.payload?.to?.[0] && normalizedEmail(previous.payload.to[0]) !== normalizedEmail(employee.email)) return res.status(409).json({ error: 'تغير بريد الموظف؛ راجع سجل Resend قبل إعادة الإرسال' });
    // Never replay an ambiguous send beyond the provider's 24-hour idempotency window.
    if (previous && (!Number.isFinite(previous.startedAt) || Date.now() - previous.startedAt > 23 * 3600000)) return res.status(409).json({ error: 'يلزم مراجعة سجل Resend قبل إعادة الإرسال؛ انتهت نافذة منع التكرار' });
    if (previous?.status === 'sending' && Date.now() - previous.claimedAt < 60000) return res.status(409).json({ error: 'الإرسال جارٍ بالفعل، انتظر ثم حاول مجددًا' });
    const payload = previous?.payload || welcomePayload(employee, companies[0]?.name || 'الشركة');
    if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'لم يتم إعداد مفتاح Resend على السيرفر' });
    claimed = { status: 'sending', payload, startedAt: previous?.startedAt || Date.now(), claimedAt: Date.now(), claim: crypto.randomUUID() };
    const saved = rows.length
      ? await db.update(schema.systemData).set({ value: claimed, updatedAt: new Date() }).where(and(eq(schema.systemData.key, key), eq(schema.systemData.value, previous))).returning()
      : await db.insert(schema.systemData).values({ key, value: claimed }).onConflictDoNothing().returning();
    if (!saved.length) return res.status(409).json({ error: 'هناك طلب إرسال آخر، حاول لاحقًا' });
    const providerId = await deliverWelcome(payload, key);
    await db.update(schema.systemData).set({ value: { ...claimed, status: 'sent', providerId }, updatedAt: new Date() }).where(and(eq(schema.systemData.key, key), eq(schema.systemData.value, claimed)));
    return res.json({ status: 'sent', message: 'تم قبول رسالة الترحيب بواسطة خدمة البريد؛ وصولها يُراجع من لوحة Resend' });
  } catch (error: any) {
    if (claimed) await db.update(schema.systemData).set({ value: { ...claimed, status: 'failed' }, updatedAt: new Date() }).where(and(eq(schema.systemData.key, key), eq(schema.systemData.value, claimed))).catch(() => {});
    return res.status(503).json({ error: error?.name === 'TimeoutError' || error?.name === 'TypeError' ? 'تعذر تأكيد الإرسال؛ يمكنك إعادة المحاولة' : (/^(بريد الموظف|يلزم ضبط|رابط البرنامج|خدمة البريد|رفضت خدمة البريد|لم تؤكد)/.test(error?.message || '') ? error.message : 'تعذر إرسال رسالة الترحيب؛ راجع إعدادات السيرفر') });
  }
});

app.get('/api/registration-requests', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  try {
    const result = await db.select()
      .from(schema.registrationRequests)
      .where(eq(schema.registrationRequests.companyId, companyId))
      .orderBy(desc(schema.registrationRequests.createdAt));
    return res.json(result);
  } catch (error: any) {
    console.error('Error getting registration requests from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب طلبات التسجيل من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/registration-requests',async(req,res)=>{
 const {name,username,phone,password,companyCode}=req.body || {};
 if(typeof name!=='string'||!name.trim()||typeof username!=='string'||!username.trim()||typeof password!=='string'||password.length<6||typeof phone!=='string'||!phone.trim())return res.status(400).json({error:'أكمل بيانات طلب الحساب'});
 try{
  const result=await db.transaction(async tx=>{await identityLock(tx);const code=identityValue(companyCode);let companyId='default';
   if(code!=='101'){const companies=await tx.select().from(schema.companies).where(eq(schema.companies.companyCode,code)).limit(1);if(!companies[0])throw attendanceError(400,'رمز الشركة غير صحيح');companyId=companies[0].id;}
   if(!await companyCanLogin(companyId))throw attendanceError(403,'اشتراك الشركة منتهي أو معطل');
   await assertUnique(tx,[{owner:'registration:new',companyId,kind:'employee',username:identityValue(username),email:''}]);
   const pending=await tx.select().from(schema.registrationRequests).where(eq(schema.registrationRequests.status,'pending'));if(pending.some(r=>identityValue(r.username)===identityValue(username)))throw attendanceError(409,'اسم المستخدم مستخدم في طلب حساب قيد المراجعة');
   return (await tx.insert(schema.registrationRequests).values({name:name.trim(),type:'employee',username:identityValue(username),phone:phone.trim(),password,status:'pending',companyId}).returning())[0];
  });return res.json({id:result.id,status:result.status,companyId:result.companyId});
 }catch(error:any){return res.status(error.status || 503).json({error:error.status?error.message:'تعذر إرسال طلب الحساب'});}
});

app.put('/api/registration-requests/:id',requireAuth(['admin','superadmin'],false),requireOwnedRow(schema.registrationRequests),async(req,res)=>{
 const id=Number(req.params.id),status=req.body?.status,auth=(req as any).auth as AuthTokenPayload;
 if(!['approved','rejected'].includes(status))return res.status(400).json({error:'قرار الطلب غير صحيح'});
 try{
  const result=await db.transaction(async tx=>{await identityLock(tx);const [request]=await tx.select().from(schema.registrationRequests).where(eq(schema.registrationRequests.id,id)).limit(1).for('update');if(!request)throw attendanceError(404,'الطلب غير موجود');if(request.status!=='pending')throw attendanceError(409,'سبق اتخاذ قرار في الطلب');
   if(status==='approved'){
    if(request.type!=='employee')throw attendanceError(400,'أنشئ حساب المسؤول من إدارة الصلاحيات؛ هذا الطلب القديم لا يُقبل كموظف');
    const companyId=request.companyId || 'default',key=getMainDataKey(companyId);const [row]=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,key)).limit(1).for('update');const data:any=row?.value;if(!data)throw attendanceError(404,'بيانات الشركة غير موجودة');
    const employee={id:'e'+crypto.randomUUID(),name:request.name,username:identityValue(request.username),phone:request.phone,password:request.password,dept:data.departments?.[0]?.id || '',color:'#01696f'};
    await assertUnique(tx,employeeIdentities(companyId,[employee]));
    await tx.update(schema.systemData).set({value:{...data,employees:[...(data.employees || []),employee]},updatedAt:new Date()}).where(eq(schema.systemData.key,key));await audit(tx,auth,companyId,'employee.create',employee.id,{name:employee.name,source:'registration',requestId:id});
   }
   return (await tx.update(schema.registrationRequests).set({status}).where(eq(schema.registrationRequests.id,id)).returning())[0];
  });const {password:hidden,...safe}=result;return res.json(safe);
 }catch(error:any){return res.status(error.status || 503).json({error:error.status?error.message:'تعذر اتخاذ القرار؛ لم يتم اعتماد الحساب'});}
});

app.delete('/api/registration-requests/:id', requireAuth(['admin', 'superadmin'], false), requireOwnedRow(schema.registrationRequests), async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.delete(schema.registrationRequests).where(eq(schema.registrationRequests.id, id));
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting registration request from PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حذف طلب التسجيل من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

// Approval and every attendance mutation share a company transaction lock.
// This also protects date moves and prevents snapshots racing with writes.
const lockAttendance = async (tx: any, companyId: string) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance-report:' + companyId}))`);
};
const attendanceError = (status: number, message: string) => Object.assign(new Error(message), { status });
const assertMonthOpen = async (tx: any, companyId: string, date: unknown) => {
  if (!validAttendanceDate(date)) throw attendanceError(400, 'تاريخ الحضور غير صالح');
  const rows = await tx.select().from(schema.attendanceMonths).where(eq(schema.attendanceMonths.key, companyId + ':' + date.slice(0, 7))).limit(1);
  if ((rows[0]?.value as any)?.status === 'approved') throw attendanceError(409, 'الشهر معتمد ومغلق؛ أعد فتحه بسبب مسجل قبل تعديل البصمات');
};

app.get('/api/attendance-months', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = String(req.query.companyId || 'default'), month = req.query.month;
  if (!validMonth(month)) return res.status(400).json({ error: 'اختر شهرًا صالحًا' });
  try {
    const rows = await db.select().from(schema.attendanceMonths).where(eq(schema.attendanceMonths.key, companyId + ':' + month)).limit(1);
    return res.json(rows[0]?.value || { month, status: 'open' });
  } catch { return res.status(500).json({ error: 'تعذر قراءة حالة اعتماد الشهر' }); }
});
app.post('/api/attendance-months', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = String(req.body.companyId || 'default'), { month, action, reason } = req.body;
  const auth = (req as any).auth as AuthTokenPayload;
  if (!validMonth(month) || !['approve', 'reopen'].includes(action)) return res.status(400).json({ error: 'الشهر أو الإجراء غير صالح' });
  if (action === 'approve' && month >= riyadhMonth()) return res.status(400).json({ error: 'يمكن اعتماد الشهور المنتهية فقط' });
  if (action === 'reopen' && (typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 1000)) return res.status(400).json({ error: 'اكتب سبب إعادة الفتح (5 إلى 1000 حرف)' });
  try {
    const result = await db.transaction(async tx => {
      await lockAttendance(tx, companyId);
      const key = companyId + ':' + month;
      const rows = await tx.select().from(schema.attendanceMonths).where(eq(schema.attendanceMonths.key, key)).limit(1);
      const old: any = rows[0]?.value || { month, status: 'open', revision: 0 };
      if (req.body.expectedStatus !== undefined && (req.body.expectedStatus !== old.status || req.body.expectedRevision !== (old.revision || 0))) throw attendanceError(409, 'تغيرت حالة الشهر؛ حدّث الحالة قبل المتابعة');
      if (action === 'approve' && old.status === 'approved') return old;
      if (action === 'reopen' && old.status !== 'approved') throw attendanceError(409, 'الشهر مفتوح بالفعل؛ حدّث الحالة');
      let value: any;
      if (action === 'approve') {
        const records = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), sql`${schema.attendance.date} LIKE ${month + '-%'}`));
        const mainData = await getMainDataByCompanyId(companyId);
        const days = buildAttendanceDays(records, mainData?.settings).map(day => ({ ...day, departmentName: mainData?.departments?.find((d: any) => d.id === day.dept)?.name || day.dept }));
        if (!days.length) throw attendanceError(409, 'لا توجد سجلات لهذا الشهر');
        if (days.some(day => day.minutes === null)) throw attendanceError(409, 'راجع السجلات الناقصة أو غير الصالحة قبل اعتماد الشهر');
        value = { month, status: 'approved', revision: (old.revision || 0) + 1, approvedAt: new Date().toISOString(), approvedBy: auth.username || auth.id || auth.role,
          snapshot: { companyName: mainData?.settings?.companyName || companyId, days, totalMinutes: days.reduce((sum, day) => sum + (day.minutes || 0), 0) } };
      } else value = { ...old, status: 'open', reopenedAt: new Date().toISOString(), reopenedBy: auth.username || auth.id || auth.role, reopenReason: reason.trim() };
      await tx.insert(schema.attendanceMonths).values({ key, companyId, month, value }).onConflictDoUpdate({ target: schema.attendanceMonths.key, set: { value } });
      await audit(tx, auth, companyId, 'attendance.month.' + action, month, { revision: value.revision, snapshot: action === 'approve' ? value.snapshot : undefined, days: value.snapshot?.days.length, totalMinutes: value.snapshot?.totalMinutes, reason: action === 'reopen' ? reason.trim() : 'اعتماد كشف الشهر' });
      return value;
    });
    return res.json(result);
  } catch (error: any) { console.error('Monthly attendance operation failed', error); return res.status(error.status || 500).json({ error: error.status ? error.message : 'تعذر تحديث اعتماد الشهر' }); }
});

// Query only the requested period. Build complete employee-days before paging so
// duplicate rows and overnight punches cannot be split across display pages.
app.get('/api/attendance-report', requireAuth(['admin', 'superadmin']), async (req, res) => {
  let query: ReturnType<typeof parseAttendanceQuery>;
  try { query = parseAttendanceQuery(req.query); } catch (error: any) { return res.status(400).json({ error: error.message }); }
  const companyId = String(req.query.companyId || 'default');
  try {
    let records = await db.select().from(schema.attendance).where(and(
      eq(schema.attendance.companyId, companyId),
      sql`${schema.attendance.date} >= ${query.from}`, sql`${schema.attendance.date} <= ${query.to}`,
      query.empId ? eq(schema.attendance.empId, query.empId) : undefined,
      query.dept && !query.analysis ? eq(schema.attendance.dept, query.dept) : undefined,
    )).orderBy(desc(schema.attendance.id));
    records = await visibleRows(req, records, companyId);
    const mainData = await getMainDataByCompanyId(companyId);
    let reportDays = buildAttendanceDays(records, mainData?.settings);
    if (query.analysis) {
      const leaves = await db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved'), sql`${schema.requests.date} >= ${query.from}`, sql`${schema.requests.date} <= ${query.to}`));
      reportDays = analyzeAttendance(reportDays, effectiveScheduleData(mainData), query, leaves);
    }
    const days = reportDays.map(day => ({ ...day, departmentName: mainData?.departments?.find((dept: any) => dept.id === day.dept)?.name || day.dept }));
    return res.json({ ...attendanceReportPage(days.filter(day => ownsDay(requestAccess(req), mainData, day)), query), companyName: mainData?.settings?.companyName || companyId, from: query.from, to: query.to });
  } catch (error) { console.error('Attendance report query failed', error); return res.status(500).json({ error: 'تعذر تحميل كشف الحضور' }); }
});

app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/system-health', requireAuth(['admin', 'superadmin']), async (req,res) => {
  res.set('Cache-Control','private, no-store');
  const companyId=String(req.query.companyId || 'default'), auth=(req as any).auth as AuthTokenPayload, access=requestAccess(req);
  const [backup,version,errorLog]=await Promise.all([backupHealth(),buildInfo(),readHealthFile('health-errors.json')]);
  let database:any={status:'unavailable',latencyMs:null,tables:[],message:'تعذر الاتصال بقاعدة البيانات'}, mail:any={available:false,items:[],counts:{accepted:0,failed:0,pending:0},total:0};
  let client:any;
  try {
    const started=Date.now();client=await pool.connect();await client.query({text:'SELECT 1',query_timeout:3000});
    const tables=await client.query({text:'SELECT table_name FROM information_schema.tables WHERE table_schema=$1',values:[getDbSchemaName()],query_timeout:3000});
    const expected=['system_data','attendance','requests','admins','companies','audit_log','attendance_months','registration_requests','electronic_documents','electronic_document_audit'];
    const missing=expected.filter(name=>!tables.rows.some((r:any)=>r.table_name===name));
    database={status:missing.length?'incomplete':'ok',latencyMs:Date.now()-started,tables:expected.map(name=>({name,present:!missing.includes(name)})),message:missing.length?'جداول مطلوبة غير موجودة':'الاتصال والجداول الأساسية سليمة'};
    client.release();client=undefined;
    const data=await getMainDataByCompanyId(companyId), employees=data?.employees || [];
    const keys=new Map<string,{kind:string;empId:string}>();for(const e of employees){keys.set(welcomeStateKey(companyId,String(e.id)),{kind:'welcome',empId:String(e.id)});keys.set(emailVerificationKey(companyId,String(e.id)),{kind:'verification',empId:String(e.id)});}
    const rows=keys.size?await db.select().from(schema.systemData).where(inArray(schema.systemData.key,[...keys.keys()])):[];
    const entries=rows.map(row=>({...row,...keys.get(row.key)}));
    mail={available:true,...mailHealthRows(employees,entries.filter(e=>e.kind==='welcome'),entries.filter(e=>e.kind==='verification'),auth.role==='superadmin'||access.permissions.canManageEmployees)};
  }catch{}finally{client?.release();}
  const errors=(Array.isArray(errorLog?.items)?errorLog.items:[]).filter((e:any)=>e.companyId===companyId).slice(0,20).map((e:any)=>({route:e.route,method:e.method,status:e.status,at:e.at}));
  return res.json({generatedAt:new Date().toISOString(),database,backup,version,mail:{...mail,configured:!!(process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.APP_URL),provider:'Resend',deliveryConfirmed:false},errors,permissions:{canBackup:auth.role==='superadmin',canRetryWelcome:auth.role==='superadmin'||access.permissions.canManageEmployees}});
});
for(const [endpoint,job] of [['backup',runBackup],['verify-restore',verifyBackupRestore]] as const) app.post('/api/system-health/'+endpoint,requireAuth(['superadmin']),async(_req,res)=>{try{await job();return res.json({success:true});}catch(error:any){return res.status(error.status || 503).json({error:error.status ? error.message : 'تعذر تأكيد العملية'});}});

// Derived notification center; read flags are per account and never update company settings.
async function collectNotifications(req: Request) {
  let query: ReturnType<typeof parseNotificationQuery>;
  try { query = parseNotificationQuery(req.query); } catch (error: any) { throw attendanceError(400, error.message); }
  const companyId = String(req.query.companyId || 'default'), access = requestAccess(req);
  const data = await getMainDataByCompanyId(companyId);
  if (!data) throw attendanceError(404, 'بيانات الشركة غير موجودة');
  if (query.dept && (!data.departments?.some((d: any) => d.id === query.dept) || (access.departmentIds !== null && !access.departmentIds.includes(query.dept)))) throw attendanceError(403, 'القسم خارج نطاق حسابك');
  const permissions = notificationPermissions(access);
  if (!Object.values(permissions).some(Boolean) || (query.category && !permissions[query.category])) throw attendanceError(403, 'ليس لديك صلاحية لهذه التنبيهات');
  const employeeIds = access.departmentIds === null ? null : (data.employees || []).filter((e: any) => access.departmentIds!.includes(e.dept)).map((e: any) => String(e.id));
  const [records, requests] = await Promise.all([
    permissions.attendance ? db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), employeeIds === null ? undefined : inArray(schema.attendance.empId, employeeIds), sql`${schema.attendance.date} >= ${query.from}`, sql`${schema.attendance.date} <= ${query.to}`)).orderBy(desc(schema.attendance.id)) : Promise.resolve([]),
    db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), employeeIds === null ? undefined : inArray(schema.requests.empId, employeeIds), sql`${schema.requests.date} >= ${query.from}`, sql`${schema.requests.date} <= ${query.to}`, sql`(${schema.requests.status} = 'pending' OR (${schema.requests.status} = 'approved' AND ${schema.requests.type} = 'leave'))`)).orderBy(desc(schema.requests.id)),
  ]);
  return { query, companyId, permissions, items: buildAdminNotifications(companyId, data, records, requests, access, query) };
}
app.get('/api/notifications', requireAuth(['admin', 'superadmin']), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const result = await collectNotifications(req), key = notificationStateKey(result.companyId, (req as any).auth);
    const state = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    return res.json({ ...notificationPage(result.items, state[0]?.value, result.query), from: result.query.from, to: result.query.to, permissions: result.permissions, generatedAt: new Date().toISOString() });
  } catch (error: any) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'تعذر تحميل التنبيهات' }); }
});
app.post('/api/notifications/read', requireAuth(['admin', 'superadmin']), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const result = await collectNotifications(req), key = notificationStateKey(result.companyId, (req as any).auth);
    const allowed = new Set(result.items.map(item => item.id));
    // Validate before any insert; fabricated or resolved IDs cannot create metadata.
    try { updateNotificationRead({}, req.body?.ids, req.body?.read, allowed); } catch (error: any) { return res.status(400).json({ error: error.message }); }
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
      const value = updateNotificationRead(rows[0]?.value, req.body.ids, req.body.read, allowed);
      await tx.insert(schema.systemData).values({ key, value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
    });
    return res.json({ success: true });
  } catch (error: any) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'تعذر حفظ حالة التنبيه' }); }
});

// Read-only review queue: use published shifts and preserve historical punch departments.
app.get('/api/attendance-exceptions', requireAuth(['admin', 'superadmin']), async (req, res) => {
  let query: ReturnType<typeof parseExceptionQuery>;
  try { query = parseExceptionQuery(req.query); } catch (error: any) { return res.status(400).json({ error: error.message }); }
  const companyId = String(req.query.companyId || 'default');
  res.set('Cache-Control', 'private, no-store');
  try {
    let records = await db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), sql`${schema.attendance.date} >= ${query.from}`, sql`${schema.attendance.date} <= ${query.to}`, query.empId ? eq(schema.attendance.empId, query.empId) : undefined)).orderBy(desc(schema.attendance.id));
    records = await visibleRows(req, records, companyId);
    const requests = await db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), sql`${schema.requests.date} >= ${query.from}`, sql`${schema.requests.date} <= ${query.to}`, query.empId ? eq(schema.requests.empId, query.empId) : undefined));
    const data = await getMainDataByCompanyId(companyId), published = effectiveScheduleData(data);
    const now = Date.now();
    const days = analyzeAttendance(buildAttendanceDays(records, data?.settings), published, query, requests.filter(r => r.type === 'leave' && r.status === 'approved'), now);
    const report = exceptionReportPage(days.filter(day => ownsDay(requestAccess(req), data, day)), query, now);
    const byDay = new Map<string, any[]>(), pending = new Map<string, any[]>();
    for (const row of records) { const key = `${row.empId}|${row.date}`; byDay.set(key, [...(byDay.get(key) || []), row]); }
    for (const request of requests) if (ownsDay(requestAccess(req), data, request) && request.type === 'attendance_adjustment' && request.status === 'pending') { const key = `${request.empId}|${request.date}`; pending.set(key, [...(pending.get(key) || []), { id: request.id, notes: request.notes, checkInTime: request.checkInTime, checkOutTime: request.checkOutTime, period: (request.details as any)?.period === 2 ? 2 : 1, checkInNextDay: (request.details as any)?.checkInNextDay === true, checkOutNextDay: (request.details as any)?.checkOutNextDay === true }]); }
    return res.json({ ...report, items: report.items.map(day => {
      const key = `${day.empId}|${day.date}`, assigned = published?.schedule?.[day.date]?.[day.empId];
      const shift = published?.shiftTypes?.find((s: any) => s.id === assigned?.shiftType);
      return { id: key, empId: day.empId, empName: day.empName, date: day.date, dept: day.dept, departmentName: data?.departments?.find((d: any) => d.id === day.dept)?.name || day.dept || 'بدون قسم', first: day.first, last: day.last, minutes: day.minutes, note: day.note || '', ignored: day.ignored, analysis: day.analysis, exceptions: day.exceptions,
        shiftName: ['A','OFF'].includes(assigned?.shiftType) ? 'راحة / إجازة' : shift?.name || 'غير مجدول', shiftNote: assigned?.note || '', pendingCorrections: pending.get(key) || [],
        records: (byDay.get(key) || []).map(row => ({ id: row.id, source: row.source, note: row.note, checkIn: row.checkIn, checkOut: row.checkOut, checkIn2: row.checkIn2, checkOut2: row.checkOut2, checkInLocation: row.checkInLocation, checkOutLocation: row.checkOutLocation, checkInLocation2: row.checkInLocation2, checkOutLocation2: row.checkOutLocation2 })) };
    }), companyName: data?.settings?.companyName || companyId, from: query.from, to: query.to, generatedAt: new Date(now).toISOString() });
  } catch { return res.status(500).json({ error: 'تعذر تحميل استثناءات الحضور' }); }
});

// 4. Attendance Endpoints (Tenant Aware)
app.get('/api/attendance', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  if ((req.query.from !== undefined && !validAttendanceDate(req.query.from)) || (req.query.to !== undefined && !validAttendanceDate(req.query.to)) || (req.query.empId !== undefined && typeof req.query.empId !== 'string')) return res.status(400).json({ error: 'فلتر الحضور غير صالح' });
  try {
    const result = await db.select()
      .from(schema.attendance)
      .where(and(eq(schema.attendance.companyId, companyId), (req as any).auth.role === 'employee' ? eq(schema.attendance.empId, String((req as any).auth.id)) : (req.query.empId ? eq(schema.attendance.empId, String(req.query.empId)) : undefined), req.query.from ? sql`${schema.attendance.date} >= ${req.query.from}` : undefined, req.query.to ? sql`${schema.attendance.date} <= ${req.query.to}` : undefined))
      .orderBy(desc(schema.attendance.createdAt));
    return res.json(await visibleRows(req, result, companyId));
  } catch (error: any) {
    console.error('Error getting attendance logs from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب سجلات الحضور والانصراف من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/attendance', requireAuth(['employee', 'admin', 'superadmin']), async (req, res, next) => {
  const auth = (req as any).auth as AuthTokenPayload;
  if (auth.role !== 'employee') return next();
  const fields = punchFields.filter(field => req.body[field] != null);
  if (fields.length !== 1) return res.status(400).json({ error: 'أرسل بصمة واحدة فقط في الطلب' });
  const field = fields[0];
  if (req.body.automatic === true && !field.startsWith('checkIn')) return res.status(400).json({ error: 'الانصراف يحتاج تأكيد الموظف' });
  const companyId = auth.companyId;
  try {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${companyId + ':' + auth.id}))`);
      await lockAttendance(tx, companyId);
      const mainData = await getMainDataByCompanyId(companyId);
      const employee = mainData?.employees?.find((e: any) => String(e.id) === String(auth.id));
      if (!isActiveEmployee(employee)) return { status: 403, body: { error: 'حساب الموظف غير نشط' } };
      const now = Date.now();
      const date = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
      let record: any;
      if (req.body.id) {
        const rows = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.id, Number(req.body.id)), eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, String(auth.id)))).limit(1);
        record = rows[0];
        if (!record) return { status: 404, body: { error: 'السجل غير متاح' } };
        const start = Number(record.checkInTs);
        if (!Number.isFinite(start) || now - start > 86400000 || start > now) return { status: 409, body: { error: 'السجل خارج فترة البصمة؛ اطلب تصحيحًا من الإدارة' } };
      } else {
        const rows = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, String(auth.id)), eq(schema.attendance.date, date))).orderBy(desc(schema.attendance.id)).limit(1);
        record = rows[0];
      }
      await assertMonthOpen(tx, companyId, record?.date || date);
      const transition = validatePunchTransition(record, field);
      if (transition === 'duplicate') return { status: 200, body: record };
      if (transition) return { status: 409, body: { error: transition } };
      const suffix = field.endsWith('2') ? '2' : '';
      const out = field.startsWith('checkOut');
      const base = out ? 'checkOut' : 'checkIn';
      const lat = req.body[base + 'Lat' + suffix], lng = req.body[base + 'Lng' + suffix];
      if (req.body.automatic === true) {
        const fix = autoFix({ ...mainData?.settings, _attendanceEmployee: employee }, { coords: { latitude: Number(lat), longitude: Number(lng), accuracy: req.body.gpsAccuracy }, timestamp: req.body.gpsTimestamp }, now);
        if (fix.kind !== 'inside') return { status: 400, body: { error: 'الموقع التلقائي غير دقيق أو قديم أو خارج المواقع المسموحة؛ أعد الفحص' } };
      }
      const location = checkPunchLocation(mainData?.settings, lat, lng, !out || !!mainData?.settings?.officeLocation?.preventOutCheckout, employee);
      if (location.error) return { status: 403, body: { error: location.error } };
      const values: any = { [field]: new Date(now).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }),
        [base + 'Ts' + suffix]: String(now), [base + 'Location' + suffix]: location.name };
      if (req.body.automatic === true) { values.source = 'GPS تلقائي'; values.note = ((record?.note || '') + ' [حضور تلقائي مؤكد بالموقع]').trim(); }
      if (!out && lat != null && lng != null) { values[base + 'Lat' + suffix] = Number(lat); values[base + 'Lng' + suffix] = Number(lng); }
      const saved = record ? await tx.update(schema.attendance).set(values).where(eq(schema.attendance.id, record.id)).returning()
        : await tx.insert(schema.attendance).values({ ...values, empId: String(auth.id), empName: employee.name, dept: employee.dept || '', date, companyId, source: req.body.automatic === true ? 'GPS تلقائي' : 'GPS', status: 'present' }).returning();
      await audit(tx, auth, companyId, 'punch.' + field, saved[0].id, { time: now, location: location.name, lat: lat ?? null, lng: lng ?? null, automatic: req.body.automatic === true, gpsAccuracy: req.body.automatic === true ? req.body.gpsAccuracy : undefined });
      return { status: 200, body: saved[0] };
    });
    return res.status(result.status).json(result.body);
  } catch (error: any) { console.error('Punch transaction failed', error); return res.status(error.status || 500).json({ error: error.status ? error.message : 'تعذر حفظ البصمة؛ لم يتم تأكيد التسجيل' }); }
});

app.post('/api/attendance', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const {
    id, empId, empName, dept, date,
    checkIn, checkInTs, checkOut, checkOutTs, checkInLat, checkInLng,
    checkIn2, checkInTs2, checkOut2, checkOutTs2, checkInLat2, checkInLng2,
    status, source, note, companyId
  } = req.body;

  let activeCompanyId = companyId || 'default';
  const auth = (req as any).auth as AuthTokenPayload;

  try {
    if (id) {
      const rows = await db.select().from(schema.attendance).where(eq(schema.attendance.id, Number(id))).limit(1);
      if (!rows[0] || !canReadCompany(auth, rows[0].companyId || 'default')) return res.status(404).json({ error: 'سجل الحضور غير متاح' });
      activeCompanyId = rows[0].companyId || 'default';
    }
    const mainData = await getMainDataByCompanyId(activeCompanyId);
    const locationLabel = (lat: any, lng: any) => {
      if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return 'غير مسجل';
      const match = matchAttendanceLocation(mainData?.settings, Number(lat), Number(lng));
      return match.inside ? match.location!.name : 'خارج المواقع المعتمدة';
    };
    const locations: Record<string, string> = {};
    for (const [timeField, latField, lngField, nameField] of [
      ['checkIn', 'checkInLat', 'checkInLng', 'checkInLocation'],
      ['checkIn2', 'checkInLat2', 'checkInLng2', 'checkInLocation2'],
      ['checkOut', 'checkOutLat', 'checkOutLng', 'checkOutLocation'],
      ['checkOut2', 'checkOutLat2', 'checkOutLng2', 'checkOutLocation2']
    ]) {
      if (req.body[timeField]) locations[nameField] = auth.role !== 'employee' && /الإدارة|الادارة/.test(source || note || '')
        ? 'تسجيل إداري' : locationLabel(req.body[latField], req.body[lngField]);
    }
    if (id) {
      // Check-out / second-period updates reference an existing row by id and don't
      // resend empId, so ownership is verified against the stored record instead.
      if (auth.role === 'employee') {
        const existingRows = await db.select().from(schema.attendance).where(eq(schema.attendance.id, parseInt(id))).limit(1);
        if (!existingRows[0] || String(existingRows[0].empId) !== String(auth.id) || existingRows[0].companyId !== activeCompanyId) {
          return res.status(403).json({ error: 'لا يمكنك تعديل سجل حضور موظف آخر' });
        }
      }
      // Update existing record in PostgreSQL.
      // IMPORTANT: only touch fields that were actually sent in this request.
      // A checkout ping only sends {id, checkOut, checkOutTs, ...} — if we blindly
      // set every column from the destructured body, the fields that weren't sent
      // (checkIn, checkInTs, etc.) come back as `undefined`, and the old
      // `checkInTs ? String(checkInTs) : null` ternary would turn that into an
      // explicit NULL, wiping the check-in timestamp that had been saved moments
      // earlier — which is exactly why "duration" next to the times went blank.
      const updateData: Record<string, any> = { ...locations };
      if (empId !== undefined) updateData.empId = empId;
      if (empName !== undefined) updateData.empName = empName;
      if (dept !== undefined) updateData.dept = dept;
      if (date !== undefined) updateData.date = date;
      if (checkIn !== undefined) updateData.checkIn = checkIn;
      if (checkInTs !== undefined) updateData.checkInTs = checkInTs ? String(checkInTs) : null;
      if (checkOut !== undefined) updateData.checkOut = checkOut;
      if (checkOutTs !== undefined) updateData.checkOutTs = checkOutTs ? String(checkOutTs) : null;
      if (checkInLat !== undefined) updateData.checkInLat = checkInLat;
      if (checkInLng !== undefined) updateData.checkInLng = checkInLng;
      if (checkIn2 !== undefined) updateData.checkIn2 = checkIn2;
      if (checkInTs2 !== undefined) updateData.checkInTs2 = checkInTs2 ? String(checkInTs2) : null;
      if (checkOut2 !== undefined) updateData.checkOut2 = checkOut2;
      if (checkOutTs2 !== undefined) updateData.checkOutTs2 = checkOutTs2 ? String(checkOutTs2) : null;
      if (checkInLat2 !== undefined) updateData.checkInLat2 = checkInLat2;
      if (checkInLng2 !== undefined) updateData.checkInLng2 = checkInLng2;
      if (status !== undefined) updateData.status = status;
      if (source !== undefined) updateData.source = source;
      if (note !== undefined) updateData.note = note;

      const updated = await db.transaction(async tx => {
        await lockAttendance(tx, activeCompanyId);
        const before = await tx.select().from(schema.attendance).where(eq(schema.attendance.id, Number(id))).limit(1);
        if (!before[0]) throw attendanceError(404, 'السجل غير متاح');
        await assertMonthOpen(tx, activeCompanyId, before[0].date);
        if (date !== undefined) await assertMonthOpen(tx, activeCompanyId, date);
        const saved = await tx.update(schema.attendance).set(updateData).where(eq(schema.attendance.id, Number(id))).returning();
        await audit(tx, auth, before[0].companyId || 'default', 'attendance.correct', id, { before: before[0], after: saved[0], reason: note || 'تعديل إداري' });
        return saved;
      });
      return res.json(updated[0]);
    } else {
      if (auth.role === 'employee' && String(empId) !== String(auth.id)) {
        return res.status(403).json({ error: 'لا يمكنك تسجيل حضور موظف آخر' });
      }
      // Insert new record in PostgreSQL
      const inserted = await db.transaction(async tx => {
        await lockAttendance(tx, activeCompanyId);
        await assertMonthOpen(tx, activeCompanyId, date);
        const saved = await tx.insert(schema.attendance).values({
        empId, empName, dept: dept || '', date, ...locations,
        checkIn, checkInTs: checkInTs ? String(checkInTs) : null, checkOut, checkOutTs: checkOutTs ? String(checkOutTs) : null, checkInLat, checkInLng,
        checkIn2, checkInTs2: checkInTs2 ? String(checkInTs2) : null, checkOut2, checkOutTs2: checkOutTs2 ? String(checkOutTs2) : null, checkInLat2, checkInLng2,
        status: status || 'present', source: source || 'المقر', note: note || '',
        companyId: activeCompanyId
      }).returning();
        await audit(tx, auth, activeCompanyId, 'attendance.create', saved[0].id, { after: saved[0], reason: note || 'تسجيل إداري' });
        return saved;
      });
      return res.json(inserted[0]);
    }
  } catch (error: any) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error registering attendance in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل تسجيل الحضور والانصراف في قاعدة البيانات PostgreSQL: ' + (error?.message || String(error))
    });
  }
});

app.delete('/api/attendance/:id', requireAuth(['admin', 'superadmin'], false), requireOwnedRow(schema.attendance), async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.transaction(async tx => {
      await lockAttendance(tx, (req as any).ownedRow.companyId || 'default');
      const rows = await tx.select().from(schema.attendance).where(eq(schema.attendance.id, id)).limit(1);
      const record = rows[0];
      if (!record) throw attendanceError(404, 'السجل غير متاح');
      await assertMonthOpen(tx, record.companyId || 'default', record.date);
      await audit(tx, (req as any).auth, record.companyId || 'default', 'attendance.delete', id, { before: record });
      await tx.delete(schema.attendance).where(eq(schema.attendance.id, id));
    });
    return res.json({ success: true });
  } catch (error: any) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error deleting attendance record from PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حذف سجل الحضور من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

// 5. Employee Requests Endpoints (Tenant Aware)
app.get('/api/requests', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  try {
    const result = await db.select()
      .from(schema.requests)
      .where(and(eq(schema.requests.companyId, companyId), (req as any).auth.role === 'employee' ? eq(schema.requests.empId, String((req as any).auth.id)) : undefined))
      .orderBy(desc(schema.requests.createdAt));
    return res.json(await visibleRows(req, result, companyId));
  } catch (error: any) {
    console.error('Error getting requests from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب طلبات الموظفين من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/requests', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const {
    empId, empName, dept, date, type, notes, status,
    swapWithEmpId, swapWithEmpName, targetShift, checkInTime, checkOutTime, companyId
  } = req.body;

  const auth = (req as any).auth as AuthTokenPayload;
  if (auth.role === 'employee' && String(empId) !== String(auth.id)) {
    return res.status(403).json({ error: 'لا يمكنك تقديم طلب نيابة عن موظف آخر' });
  }

  if (type === 'attendance_adjustment') {
    const requestCompany = String(companyId || 'default');
    const reason = String(notes || req.body.note || '').trim();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
    if (!validAttendanceDate(date) || date > today || (req.body.details?.period !== undefined && ![1, 2].includes(req.body.details.period)) || !reason || reason.length > 1000 || (!checkInTime && !checkOutTime) || (checkInTime && !validCorrectionTime(checkInTime)) || (checkOutTime && !validCorrectionTime(checkOutTime))) return res.status(400).json({ error: 'حدد يومًا غير مستقبلي ووقتًا صحيحًا وسبب التصحيح (حتى 1000 حرف)' });
    const details = { period: req.body.details?.period === 2 ? 2 : 1, checkInNextDay: req.body.details?.checkInNextDay === true, checkOutNextDay: req.body.details?.checkOutNextDay === true };
    try {
      const result = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestCompany + ':' + empId + ':' + date + ':correction'}))`);
        const main = await getMainDataByCompanyId(requestCompany);
        const employee = main?.employees?.find((e: any) => String(e.id) === String(empId));
        if (!employee) throw attendanceError(404, 'الموظف غير موجود');
        const pending = await tx.select().from(schema.requests).where(and(eq(schema.requests.companyId, requestCompany), eq(schema.requests.empId, String(empId)), eq(schema.requests.date, date), eq(schema.requests.type, type), eq(schema.requests.status, 'pending'))).limit(1);
        if (pending.length) throw attendanceError(409, 'يوجد طلب تصحيح معلّق لنفس اليوم بالفعل');
        const records = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, requestCompany), eq(schema.attendance.empId, String(empId)), eq(schema.attendance.date, date))).orderBy(schema.attendance.id);
        if (records.length > 1) throw attendanceError(409, 'اليوم يحتوي عدة سجلات؛ اطلب مراجعة إدارية مباشرة');
        const proposed = correctionValues({ date, checkInTime, checkOutTime, details }, records[0]);
        if (Object.entries(proposed).some(([field, value]) => /Ts[2]?$/.test(field) && Number(value) > Date.now())) throw attendanceError(400, 'لا يمكن طلب بصمة في وقت مستقبلي');
        const inserted = await tx.insert(schema.requests).values({ empId: String(empId), empName: employee.name, dept: records[0]?.dept || employeeAtDate(employee, date).dept || '', date, type, notes: reason, status: 'pending', companyId: requestCompany, checkInTime: checkInTime || null, checkOutTime: checkOutTime || null, details: { ...details, baseline: mainDataVersion(records), original: records[0] || null } }).returning();
        await audit(tx, auth, requestCompany, 'attendance.correction.request', inserted[0].id, { empId, date, reason, requested: { checkInTime, checkOutTime, ...details } });
        return inserted[0];
      });
      return res.json(result);
    } catch (error: any) { return res.status(error.status || (error instanceof CorrectionValidationError ? 400 : 500)).json({ error: error.status || error instanceof CorrectionValidationError ? error.message : 'تعذر تقديم طلب التصحيح' }); }
  }

  try {
    const inserted = await db.insert(schema.requests).values({
      empId, empName: auth.role === 'employee' ? (auth.name || empName) : empName, dept: dept || '', date, type, notes: notes || req.body.note || '', status: auth.role === 'employee' ? 'pending' : (status || 'pending'),
      swapWithEmpId, swapWithEmpName, targetShift, checkInTime, checkOutTime,
      companyId: companyId || 'default'
    }).returning();
    return res.json(inserted[0]);
  } catch (error: any) {
    console.error('Error creating request in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل تقديم الطلب في قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.put('/api/requests/:id', requireAuth(['admin', 'superadmin'], false), requireOwnedRow(schema.requests), async (req, res) => {
  const id = Number(req.params.id), auth = (req as any).auth as AuthTokenPayload;
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'قرار المراجعة غير صحيح' });
  const reviewReason = String(req.body.reviewReason || '').trim();
  if (reviewReason.length > 1000 || (status === 'rejected' && !reviewReason)) return res.status(400).json({ error: 'أدخل سبب الرفض، بحد أقصى 1000 حرف' });
  try {
    const outcome = await db.transaction(async tx => {
      const companyId = (req as any).ownedRow.companyId || 'default';
      await lockAttendance(tx, companyId);
      const rows = await tx.select().from(schema.requests).where(eq(schema.requests.id, id)).limit(1).for('update');
      const request = rows[0];
      const mainRows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, getMainDataKey(companyId))).limit(1).for('update');
      const requestData: any = mainRows[0]?.value;
      if (!request || !ownsDay(requestAccess(req), requestData, request)) throw attendanceError(404, 'الطلب غير موجود أو خارج أقسامك');
      if (request.status === status) return request;
      if (request.status !== 'pending') throw attendanceError(409, 'تمت مراجعة الطلب بالفعل؛ لا يمكن تغيير قراره');
      if (status === 'approved' && request.type === 'attendance_adjustment') {
        await assertMonthOpen(tx, companyId, request.date);
        const records = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, request.empId), eq(schema.attendance.date, request.date))).orderBy(schema.attendance.id);
        if (records.some(row => !ownsDay(requestAccess(req), requestData, row))) throw attendanceError(403, 'البصمة الأصلية خارج نطاق أقسامك');
        const details = request.details as any;
        if (!details?.baseline) throw attendanceError(409, 'هذا طلب قديم بلا نسخة أصلية؛ اطلب من الموظف إعادة تقديمه');
        if (mainDataVersion(records) !== details.baseline) throw attendanceError(409, 'البصمة تغيرت بعد تقديم الطلب؛ ارفضه واطلب نسخة جديدة للمراجعة');
        if (records.length > 1) throw attendanceError(409, 'السجلات متعددة وتحتاج مراجعة مباشرة');
        const values = correctionValues(request, records[0]);
        const reviewedBy = auth.name || auth.username || 'المسؤول';
        values.source = 'تصحيح معتمد';
        values.note = [records[0]?.note, `تصحيح طلب #${id}: ${request.notes}`].filter(Boolean).join(' | ');
        const saved = records.length ? await tx.update(schema.attendance).set(values).where(eq(schema.attendance.id, records[0].id)).returning() : await tx.insert(schema.attendance).values({ ...values, empId: request.empId, empName: request.empName, dept: request.dept, date: request.date, companyId, status: 'present' }).returning();
        await audit(tx, auth, companyId, 'attendance.correction.approve', saved[0].id, { requestId: id, empId: request.empId, date: request.date, before: records[0] || null, after: saved[0], reason: request.notes, reviewReason, reviewedBy });
      }
      if (status === 'approved' && ['leave', 'shift_change', 'swap'].includes(request.type)) {
        if (!requestData) throw attendanceError(404, 'بيانات الشركة غير موجودة');
        if (!validAttendanceDate(request.date)) throw attendanceError(409, 'تاريخ الطلب غير صالح');
        if (request.type === 'shift_change' && !requestData.shiftTypes?.some((shift: any) => shift.id === request.targetShift)) throw attendanceError(409, 'الشيفت المطلوب غير متاح؛ راجع الطلب');
        if (request.type === 'swap' && (!request.swapWithEmpId || request.swapWithEmpId === request.empId || !requestData.employees?.some((e: any) => String(e.id) === request.swapWithEmpId))) throw attendanceError(409, 'موظف التبديل غير متاح');
        const schedule = structuredClone(requestData.schedule || {}), day = schedule[request.date] || {};
        if (request.type === 'leave') day[request.empId] = { shiftType: 'A', note: 'إجازة معتمدة' };
        if (request.type === 'shift_change') day[request.empId] = { shiftType: request.targetShift, note: 'تعديل شيفت معتمد' };
        if (request.type === 'swap') {
          const first = day[request.empId]?.shiftType || 'A', second = day[request.swapWithEmpId!]?.shiftType || 'A';
          day[request.empId] = { shiftType: second, note: `بديل لـ ${request.swapWithEmpName || request.swapWithEmpId}` };
          day[request.swapWithEmpId!] = { shiftType: first, note: `بديل لـ ${request.empName}` };
        }
        schedule[request.date] = day;
        await tx.update(schema.systemData).set({ value: { ...requestData, schedule }, updatedAt: new Date() }).where(eq(schema.systemData.key, getMainDataKey(companyId)));
        await audit(tx, auth, companyId, 'schedule.request.apply', request.id, { type: request.type, date: request.date, empId: request.empId, actorName: auth.name || auth.username });
      }
      const updated = await tx.update(schema.requests).set({ status, reviewedBy: auth.name || auth.username || 'المسؤول', reviewedAt: new Date(), reviewReason }).where(eq(schema.requests.id, id)).returning();
      await audit(tx, auth, companyId, 'request.' + status, id, { empId: request.empId, type: request.type, reason: reviewReason, actorName: auth.name || auth.username || 'المسؤول' });
      return updated[0];
    });
    return res.json(outcome);
  } catch (error: any) { return res.status(error.status || (error instanceof CorrectionValidationError ? 400 : 500)).json({ error: error.status || error instanceof CorrectionValidationError ? error.message : 'تعذر مراجعة الطلب' }); }
});

// 6. Admin User Endpoints (Tenant Aware)
app.get('/api/admins', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  try {
    const result = await db.select()
      .from(schema.admins)
      .where(eq(schema.admins.companyId, companyId))
      .orderBy(desc(schema.admins.createdAt));
    // Password hashes never need to reach the client — the admin UI only ever needs
    // to know an admin exists, not their (hashed) credential.
    const safeResult = await Promise.all(result.map(async ({ password, ...rest }) => ({ ...rest, ...await resolveAdminAccess({ role: 'admin', companyId, id: rest.id }) })));
    return res.json(safeResult);
  } catch (error: any) {
    console.error('Error getting admins from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب بيانات المسؤولين من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/admins', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const { id, name, username, password, email } = req.body;
  const companyId = String(req.body.companyId || 'default'), auth = (req as any).auth as AuthTokenPayload;
  if (typeof name !== 'string' || !name.trim() || typeof username !== 'string' || !username.trim() || (id !== undefined && (!Number.isInteger(Number(id)) || Number(id) <= 0))) return res.status(400).json({ error: 'بيانات المسؤول غير صحيحة' });
  if(email && !validEmployeeEmail(email))return res.status(400).json({error:'بريد المسؤول غير صحيح'});
  try {
    const data = await getMainDataByCompanyId(companyId);
    const access = parseAdminAccess(req.body, data?.departments || []);
    const actorAccess = requestAccess(req);
    if (auth.role === 'admin' && auth.id !== undefined && Object.keys(access.permissions).some(p => access.permissions[p] && !actorAccess.permissions[p])) return res.status(403).json({ error: 'لا يمكنك منح صلاحية لا تملكها' });
    const result = await db.transaction(async tx => {
      await identityLock(tx);
      let saved: any;
      if (id) {
        const rows = await tx.select().from(schema.admins).where(and(eq(schema.admins.id, Number(id)), eq(schema.admins.companyId, companyId))).limit(1).for('update');
        if (!rows[0]) throw attendanceError(404, 'حساب المسؤول غير متاح');
        await assertUnique(tx,[adminIdentity({...rows[0],username,email:email===undefined?rows[0].email:email})],[adminIdentity(rows[0])]);
        const values: any = { name: name.trim(), username: identityValue(username),email:email===undefined?rows[0].email:identityValue(email) };
        if (typeof password === 'string' && password.trim()) values.password = hashPassword(password.trim());
        [saved] = await tx.update(schema.admins).set(values).where(eq(schema.admins.id, Number(id))).returning();
      } else {
        if (typeof password !== 'string' || !password.trim()) throw attendanceError(400, 'كلمة المرور مطلوبة');
        await assertUnique(tx,[adminIdentity({id:'new',companyId,username,email})]);
        [saved] = await tx.insert(schema.admins).values({ name: name.trim(), username: identityValue(username), email:identityValue(email),password: hashPassword(password.trim()), companyId }).returning();
      }
      await tx.insert(schema.systemData).values({ key: adminAccessKey(companyId, saved.id), value: access }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: access, updatedAt: new Date() } });
      await audit(tx, auth, companyId, 'admin.access.update', saved.id, { departmentIds: access.departmentIds, permissions: access.permissions, actorName: auth.name || auth.username });
      const { password: secret, ...safe } = saved;
      return { ...safe, ...access };
    });
    return res.json(result);
  } catch (error: any) { return res.status(error.status || 400).json({ error: error.status ? error.message : 'تعذر حفظ المسؤول: ' + error.message }); }
});

app.delete('/api/admins/:id', requireAuth(['admin', 'superadmin'], false), requireOwnedRow(schema.admins), async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.transaction(async tx => {
      await tx.delete(schema.admins).where(eq(schema.admins.id, id));
      await tx.delete(schema.systemData).where(eq(schema.systemData.key, adminAccessKey((req as any).ownedRow.companyId || 'default', id)));
      await tx.delete(schema.systemData).where(eq(schema.systemData.key, notificationStateKey((req as any).ownedRow.companyId || 'default', { role: 'admin', id })));
      await audit(tx, (req as any).auth, (req as any).ownedRow.companyId || 'default', 'admin.delete', id, { name: (req as any).ownedRow.name });
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting admin from PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حذف المسؤول من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

// Sections are requested on demand; never return another employee's records or login secrets.
app.get('/api/employees/:id/profile', requireAuth(['admin', 'superadmin']), async (req, res) => {
  let query: ReturnType<typeof parseEmployeeProfileQuery>;
  try { query = parseEmployeeProfileQuery(req.query); } catch (error: any) { return res.status(400).json({ error: error.message }); }
  const companyId = String(req.query.companyId || 'default');
  res.set('Cache-Control', 'private, no-store');
  try {
    const mainData = await getMainDataByCompanyId(companyId);
    const employee = mainData?.employees?.find((e: any) => String(e.id) === req.params.id);
    if (!employee || !ownsEmployee(requestAccess(req), mainData, employee.id)) return res.status(404).json({ error: 'الموظف غير موجود أو خارج أقسامك' });
    if (requestAccess(req).departmentIds !== null && ['history', 'requests', 'overview'].includes(query.section)) return res.status(403).json({ error: 'ملف الموظف الكامل لإدارة الشركة؛ راجع يوم الحضور أو الطلب من القائمة' });
    if (query.section === 'overview') {
      // Fetch only this authorized employee's photo; never include photos in bulk main-data.
      const photos = await db.select().from(schema.systemData).where(eq(schema.systemData.key, employeePhotoKey(companyId, String(employee.id)))).limit(1);
      return res.json({ employee: { ...employeeProfileData(employee, mainData.departments || []), photoDataUrl: (photos[0]?.value as any)?.dataUrl || '' } });
    }
    if (query.section === 'schedule') { const report = employeeProfileSchedule(scopedMainData(mainData, requestAccess(req)), employee, query); return res.json({ ...report, items: report.items.filter(day => ownsDay(requestAccess(req), mainData, { empId: employee.id, date: day.date })) }); }
    if (query.section === 'history') {
      const items = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.companyId, companyId), eq(schema.auditLog.entityId, String(employee.id)), sql`${schema.auditLog.action} LIKE 'employee.%'`)).orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id)).limit(100);
      return res.json({ items });
    }
    if (query.section === 'requests') {
      const scope = and(eq(schema.requests.companyId, companyId), eq(schema.requests.empId, String(employee.id)), sql`${schema.requests.date} >= ${query.from}`, sql`${schema.requests.date} <= ${query.to}`);
      const [counts] = await db.select({ total: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where ${schema.requests.status} = 'pending')::int`, approved: sql<number>`count(*) filter (where ${schema.requests.status} = 'approved')::int`, rejected: sql<number>`count(*) filter (where ${schema.requests.status} = 'rejected')::int` }).from(schema.requests).where(scope);
      const pageCount = Math.max(1, Math.ceil(counts.total / query.pageSize)), page = Math.min(query.page, pageCount);
      const items = await db.select({ id: schema.requests.id, date: schema.requests.date, type: schema.requests.type, notes: schema.requests.notes, status: schema.requests.status, createdAt: schema.requests.createdAt, reviewReason: schema.requests.reviewReason, reviewedAt: schema.requests.reviewedAt, targetShift: schema.requests.targetShift, swapWithEmpName: schema.requests.swapWithEmpName, checkInTime: schema.requests.checkInTime, checkOutTime: schema.requests.checkOutTime, details: schema.requests.details }).from(schema.requests).where(scope).orderBy(desc(schema.requests.createdAt), desc(schema.requests.id)).limit(query.pageSize).offset((page - 1) * query.pageSize);
      return res.json({ items: items.map(({ details, ...item }) => {
        const info = details as any;
        const suffix = info?.period === 2 ? '2' : '';
        return { ...item, period: info?.period === 2 ? 2 : 1, checkInNextDay: info?.checkInNextDay === true, checkOutNextDay: info?.checkOutNextDay === true,
          originalCheckIn: info?.original?.['checkIn' + suffix] || null, originalCheckOut: info?.original?.['checkOut' + suffix] || null,
          targetShiftName: mainData.shiftTypes?.find((shift: any) => shift.id === item.targetShift)?.name || item.targetShift || '' };
      }), ...counts, page, pageCount });
    }
    const scope = and(eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, String(employee.id)), sql`${schema.attendance.date} >= ${query.from}`, sql`${schema.attendance.date} <= ${query.to}`);
    let records = await db.select().from(schema.attendance).where(scope).orderBy(desc(schema.attendance.id));
    records = await visibleRows(req, records, companyId);
    const leaves = await db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), eq(schema.requests.empId, String(employee.id)), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved'), sql`${schema.requests.date} >= ${query.from}`, sql`${schema.requests.date} <= ${query.to}`));
    const analysisQuery = parseAttendanceQuery({ from: query.from, to: query.to, empId: String(employee.id), analysis: '1', mode: 'all' });
    const days = analyzeAttendance(buildAttendanceDays(records, mainData.settings), effectiveScheduleData(mainData), analysisQuery, leaves);
    const report = attendanceReportPage(days.filter(day => ownsDay(requestAccess(req), mainData, day)), analysisQuery);
    // Keep actual attendance locations, but avoid exposing raw coordinates or unrelated metadata.
    return res.json({ ...report, items: report.items.map(day => ({ date: day.date, departmentName: mainData.departments?.find((d: any) => d.id === day.dept)?.name || day.dept || 'بدون قسم', first: day.first, last: day.last, minutes: day.minutes, reportStatus: day.reportStatus, analysis: day.analysis, note: day.note || '' })) });
  } catch (error) { console.error('Employee profile query failed', error); return res.status(500).json({ error: 'تعذر تحميل ملف الموظف' }); }
});

app.get('/api/employee-audit', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = String(req.query.companyId || 'default');
  const empId = String(req.query.empId || '');
  if (!empId) return res.status(400).json({ error: 'اختر موظفًا' });
  if (requestAccess(req).departmentIds !== null) return res.status(403).json({ error: 'سجل الموظف الكامل لإدارة الشركة' });
  try {
    const rows = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.companyId, companyId), eq(schema.auditLog.entityId, empId), sql`${schema.auditLog.action} LIKE 'employee.%'`)).orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id)).limit(100);
    res.set('Cache-Control', 'private, no-store');
    return res.json(rows);
  } catch { return res.status(500).json({ error: 'تعذر تحميل سجل الموظف' }); }
});

app.get('/api/audit-log', requireAuth(['admin', 'superadmin']), async (req, res) => {
  try {
    const companyId = String(req.query.companyId || 'default');
    const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.companyId, companyId)).orderBy(desc(schema.auditLog.createdAt)).limit(200);
    res.json(rows);
  } catch { res.status(500).json({ error: 'تعذر تحميل سجل التعديلات' }); }
});

// Subscription control plane: no credentials, employees, schedules or tenant impersonation.
app.get('/api/companies', async (req, res) => {
  res.set('Cache-Control', 'private, no-store'); res.vary('Authorization');
  const auth = tryReadAuth(req);
  if (!auth) return res.json([]);
  try {
    if (auth.role === 'superadmin') {
      const result = await db.select({id:schema.companies.id,name:schema.companies.name,companyCode:schema.companies.companyCode,subscriptionStatus:schema.companies.subscriptionStatus,subscriptionExpiresAt:schema.companies.subscriptionExpiresAt,monthlyFee:schema.companies.monthlyFee,createdAt:schema.companies.createdAt}).from(schema.companies).orderBy(desc(schema.companies.createdAt));
      const main = await getMainDataByCompanyId('default');
      return res.json([{id:'default',name:main?.settings?.companyName || 'الشركة الافتراضية',companyCode:'101',subscriptionStatus:'active',isDefault:true,monthlyFee:'0'},...result.filter(c=>c.id!=='default').map(subscriptionMetadata)]);
    }
    const result = await db.select({id:schema.companies.id,name:schema.companies.name,companyCode:schema.companies.companyCode}).from(schema.companies).where(eq(schema.companies.id,auth.companyId));
    return res.json(result);
  } catch { return res.status(500).json({error:'تعذر جلب الشركات'}); }
});

app.post('/api/companies', requireAuth(['superadmin'], false), async (req,res) => {
  try {
    const values = subscriptionUpdate(req.body);
    const result = await db.update(schema.companies).set(values).where(eq(schema.companies.id,req.body.id)).returning({id:schema.companies.id});
    if (!result.length) return res.status(404).json({error:'الشركة غير موجودة؛ ينشئ صاحب الشركة حسابه من شاشة الدخول'});
    return res.json({success:true});
  } catch(error:any) { return res.status(error.status || 500).json({error:error.status?error.message:'تعذر تحديث الاشتراك'}); }
});

app.get('/api/privacy-info', (_req,res)=>res.json({contact:process.env.PRIVACY_CONTACT_EMAIL || '',controller:process.env.PRIVACY_CONTROLLER_NAME || '',retention:process.env.PRIVACY_RETENTION_NOTICE || '',version:'2026-10-06'}));

app.post('/api/company-owner/password', requireAuth(['admin']), async(req,res)=>{
  const auth=(req as any).auth as AuthTokenPayload;
  if(auth.companyId==='default'||auth.id!==undefined)return res.status(403).json({error:'خاص بصاحب الشركة المشتركة'});
  const {currentPassword,newPassword}=req.body || {};
  if(typeof currentPassword!=='string'||typeof newPassword!=='string'||newPassword.length<10||Buffer.byteLength(newPassword,'utf8')>72)return res.status(400).json({error:'أدخل كلمة المرور الحالية والجديدة (10 أحرف على الأقل، وحتى 72 بايت)'});
  try {
    const password=hashPassword(newPassword);
    await db.transaction(async tx=>{
      await identityLock(tx);
      const [company]=await tx.select().from(schema.companies).where(eq(schema.companies.id,auth.companyId)).for('update');
      if(!company || !verifyPassword(currentPassword,company.adminPassword || ''))throw attendanceError(401,'كلمة المرور الحالية غير صحيحة');
      // Recheck the revision under the same identity lock to prevent stale concurrent rotations.
      const key='ownerPasswordRevision:'+auth.companyId;
      const previous=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,key));
      if(previous[0] && auth.passwordRevision!==(previous[0].value as any).revision)throw attendanceError(403,'الجلسة لم تعد صالحة');
      await tx.update(schema.companies).set({adminPassword:password}).where(eq(schema.companies.id,auth.companyId));
      const value={revision:crypto.randomUUID()};
      await tx.insert(schema.systemData).values({key,value}).onConflictDoUpdate({target:schema.systemData.key,set:{value,updatedAt:new Date()}});
    });
    return res.json({success:true,message:'تم تغيير كلمة المرور وإلغاء جلسات مدير الشركة القديمة؛ سجّل الدخول مجددًا'});
  }catch(error:any){return res.status(error.status || 500).json({error:error.status?error.message:'تعذر تغيير كلمة المرور'});}
});

// Company owners choose their own credentials. Platform admins cannot create known passwords.
const registrationWindow = new Map<string,{started:number;count:number}>();
app.post('/api/company-registration', async (req,res) => {
  if (tryReadAuth(req)) return res.status(403).json({error:'تسجيل الشركة يتم بواسطة صاحبها دون جلسة مسؤول النظام'});
  const now=Date.now(),ip=req.ip || 'unknown';
  for(const [key,value] of registrationWindow) if(now-value.started>3600000) registrationWindow.delete(key);
  const quota=registrationWindow.get(ip) || {started:now,count:0};
  if(quota.count>=10) return res.status(429).json({error:'محاولات تسجيل كثيرة؛ أعد المحاولة لاحقًا'});
  quota.count++;registrationWindow.set(ip,quota);
  const {id,name,adminUsername,adminEmail,adminPassword,privacyAccepted}=req.body || {};
  if(typeof id!=='string'||id==='default'||! /^[a-z0-9_-]{2,64}$/.test(id)||typeof name!=='string'||!name.trim()||name.length>200||typeof adminUsername!=='string'||!adminUsername.trim()||adminUsername.length>100||!validEmployeeEmail(adminEmail)||typeof adminPassword!=='string'||adminPassword.length<10||Buffer.byteLength(adminPassword,'utf8')>72||privacyAccepted!==true) return res.status(400).json({error:'أدخل بيانات الشركة وبريدًا صحيحًا وكلمة مرور من 10 أحرف على الأقل ووافق على سياسة الخصوصية'});
  try {
    const password=hashPassword(adminPassword);
    const created=await db.transaction(async tx=>{
      await identityLock(tx);
      const existing=await tx.select({id:schema.companies.id}).from(schema.companies).where(eq(schema.companies.id,id));
      const data=await tx.select({key:schema.systemData.key}).from(schema.systemData).where(inArray(schema.systemData.key,['mainData_'+id,'deletedCompany:'+id]));
      if(existing.length || data.length) throw attendanceError(409,'معرّف الشركة مستخدم أو محجوز؛ اختر معرّفًا جديدًا');
      await assertUnique(tx,[masterIdentity({id,adminUsername,adminEmail})]);
      const companyCode=await nextCompanyCode(tx);
      await tx.insert(schema.companies).values({id,name:name.trim(),adminUsername:identityValue(adminUsername),adminEmail:identityValue(adminEmail),adminPassword:password,companyCode,subscriptionStatus:'pending',monthlyFee:'0'});
      await tx.insert(schema.systemData).values({key:'mainData_'+id,value:createCleanCompanyData(name.trim())});
      await tx.insert(schema.systemData).values({key:'companyPrivacy:'+id,value:{version:'2026-10-06',acceptedAt:new Date().toISOString()}});
      return {companyCode};
    });
    return res.json({...created,message:'تم التسجيل. حساب الشركة ينتظر تفعيل الاشتراك؛ احتفظ ببيانات دخولك.'});
  } catch(error:any) { return res.status(error.status || 500).json({error:error.status?error.message:'تعذر تسجيل الشركة'}); }
});

app.delete('/api/companies/:id', requireAuth(['superadmin'], false), async (req,res) => {
  const id=req.params.id;
  if(id==='default') return res.status(400).json({error:'لا يمكن حذف الشركة الافتراضية'});
  try {
    await db.transaction(async tx=>{
      await identityLock(tx);
      const companies=await tx.select({id:schema.companies.id,adminUsername:schema.companies.adminUsername}).from(schema.companies).where(eq(schema.companies.id,id));
      if(!companies.length) throw attendanceError(404,'الشركة غير موجودة');
      const data=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,'mainData_'+id));
      const admins=await tx.select({id:schema.admins.id,username:schema.admins.username}).from(schema.admins).where(eq(schema.admins.companyId,id));
      const keys=['mainData_'+id,'companyPrivacy:'+id,'ownerPasswordRevision:'+id,emailVerificationQuotaKey(id),notificationStateKey(id,{role:'admin'}),notificationStateKey(id,{role:'admin',username:companies[0].adminUsername || undefined})];
      for(const employee of (data[0]?.value as any)?.employees || []) keys.push(welcomeStateKey(id,String(employee.id)),emailVerificationKey(id,String(employee.id)),employeePhotoKey(id,String(employee.id)));
      for(const admin of admins) keys.push(adminAccessKey(id,admin.id),notificationStateKey(id,{role:'admin',id:admin.id}));
      for(const role of ['superadmin','admin']) for(const username of [undefined, 'admin']) keys.push(notificationStateKey(id,{role,username}));
      for(const table of [schema.electronicDocumentAudit,schema.electronicDocuments,schema.attendance,schema.requests,schema.registrationRequests,schema.auditLog,schema.attendanceMonths,schema.admins]) await tx.delete(table).where(eq(table.companyId,id));
      await tx.delete(schema.systemData).where(inArray(schema.systemData.key,keys));
      await tx.delete(schema.companies).where(eq(schema.companies.id,id));
      // Reserve the old namespace so old JWTs cannot access a newly created company's data.
      await tx.insert(schema.systemData).values({key:'deletedCompany:'+id,value:{deletedAt:new Date().toISOString()}}).onConflictDoNothing();
    });
    return res.json({success:true});
  } catch(error:any) { return res.status(error.status || 500).json({error:error.status?error.message:'تعذر حذف الشركة'}); }
});


// --- INTEGRATE VITE DEV SERVER MIDDLEWARE & PRODUCTION STATIC SERVING ---

async function startServer() {
  await initializeSchemaAndTables();
  await migrateCompanyCodes(db);
  await ensureJwtSecret();

  // Serve only this public association file; Express otherwise ignores dot-directories.
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const assetRoot = process.env.NODE_ENV === 'production' ? 'dist' : 'public';
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/json');
    res.sendFile(path.join(process.cwd(), assetRoot, '.well-known', 'assetlinks.json'), { dotfiles: 'allow' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('manifest.json') || filePath.includes('sw.js') || filePath.includes('registerSW') || filePath.endsWith('pwa-upgrade-bridge.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
