import { scheduleContent, effectiveScheduleData, employeeScheduleContent } from './src/lib/schedulePublication';
import { employeeStatus, isActiveEmployee, employeeChanges } from './src/lib/employeeLifecycle';
import { validEmployeeEmail } from './src/lib/employeeDirectory';
import { welcomePayload, deliverWelcome } from './src/server/welcomeEmail';
import { autoFix } from './src/lib/autoPunch';
import { analyzeAttendance } from './src/lib/attendanceAnalysis';
import { parseAttendanceQuery, attendanceReportPage } from './src/lib/attendanceQuery';
import { buildAttendanceDays } from './src/lib/attendanceReport';
import { validMonth, validAttendanceDate, riyadhMonth } from './src/lib/attendanceMonths';
import { mainDataVersion } from './src/lib/mainDataVersion';
import { punchFields, validatePunchTransition, checkPunchLocation } from './src/lib/punchPolicy';
import { matchAttendanceLocation } from './src/lib/attendanceLocations';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { db, schema, pool, initializeSchemaAndTables, getDbSchemaName } from './src/db/index.ts';
import { eq, desc, and, sql } from 'drizzle-orm';
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
  name?: string;
}

const signToken = (payload: AuthTokenPayload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

// Requires a valid bearer token with one of `roles`. When `matchCompany` is true (default),
// the token's companyId must match the request's companyId (superadmin is always exempt).
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
    if (matchCompany && payload.role !== 'superadmin' && payload.companyId !== requestedCompanyId) {
      return res.status(403).json({ error: 'لا يمكن الوصول لبيانات شركة أخرى' });
    }
    if (payload.role === 'employee') {
      try {
        const result = await db.execute(sql`SELECT employee->>'status' AS status FROM ${schema.systemData}, jsonb_array_elements(${schema.systemData.value}->'employees') AS employee WHERE ${schema.systemData.key} = ${getMainDataKey(payload.companyId)} AND employee->>'id' = ${String(payload.id)} LIMIT 1`);
        const employee = result.rows[0];
        if (!isActiveEmployee(employee)) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.', code: 'EMPLOYEE_INACTIVE' });
      } catch { return res.status(503).json({ error: 'تعذر التحقق من حالة الحساب' }); }
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
      if (!rows[0] || (auth.role !== 'superadmin' && rows[0].companyId !== auth.companyId)) return res.status(404).json({ error: 'السجل غير موجود أو غير مسموح' });
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

app.post('/api/auth/admin-login', async (req, res) => {
  const { username, password, companyId: rawCompanyId, companyCode } = req.body || {};
  const companyId = rawCompanyId || 'default';
  if (!username || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
  }
  const normalizedUsername = String(username).trim().toLowerCase();

  try {
    // 1. Root/superadmin login (only valid for the 'default' workspace)
    if (companyId === 'default' && normalizedUsername === 'admin') {
      const key = 'mainData';
      const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
      const mainDataValue = result[0]?.value as any;
      const settings = mainDataValue?.settings || {};
      const storedPassword = settings.password || '5198';
      const ok = verifyPassword(password, storedPassword, (hash) => {
        db.update(schema.systemData)
          .set({ value: { ...mainDataValue, settings: { ...settings, password: hash } }, updatedAt: new Date() })
          .where(and(eq(schema.systemData.key, key), eq(schema.systemData.value, mainDataValue)))
          .catch((e) => console.error('Failed to upgrade superadmin password hash:', e));
      });
      if (ok) {
        const token = signToken({ role: 'superadmin', companyId: 'default', name: 'المدير العام' });
        return res.json({ token, role: 'superadmin', name: 'المدير العام', companyId: 'default' });
      }
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    // 2. Company "master admin" login (companyCode + adminUsername/adminPassword on the companies table)
    if (companyId !== 'default') {
      const companyRows = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
      const company = companyRows[0];
      if (company) {
        const expectedCode = company.companyCode || '0';
        if ((companyCode || '').trim() !== expectedCode) {
          return res.status(401).json({ error: 'رمز الشركة غير صحيح' });
        }
        const isExpired = company.subscriptionStatus !== 'active' &&
          company.subscriptionExpiresAt && new Date(company.subscriptionExpiresAt) < new Date();
        if (isExpired || company.subscriptionStatus === 'suspended') {
          return res.status(403).json({ error: 'عذراً، اشتراك هذه الشركة منتهي أو معطل حالياً. يرجى مراجعة الإدارة.' });
        }
        if (company.adminUsername && normalizedUsername === String(company.adminUsername).toLowerCase()) {
          const ok = verifyPassword(password, company.adminPassword, (hash) => {
            db.update(schema.companies).set({ adminPassword: hash }).where(eq(schema.companies.id, companyId))
              .catch((e) => console.error('Failed to upgrade company admin password hash:', e));
          });
          if (ok) {
            const token = signToken({ role: 'admin', companyId, name: `مدير ${company.name}`, username: company.adminUsername });
            return res.json({ token, role: 'admin', name: `مدير ${company.name}`, companyId, isMaster: true });
          }
          return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
      }
    }

    // 3. Sub-admin login (admins table, scoped to companyId)
    const admins = await db.select().from(schema.admins).where(eq(schema.admins.companyId, companyId));
    const foundAdmin = admins.find((adm: any) => {
      const usernameMatch = adm.username && adm.username.toLowerCase() === normalizedUsername;
      const nameMatch = adm.name && adm.name.toLowerCase() === normalizedUsername;
      return usernameMatch || nameMatch;
    });

    if (!foundAdmin) {
      return res.status(401).json({ error: 'اسم المستخدم أو رمز الدخول غير صحيح' });
    }

    const ok = verifyPassword(password, foundAdmin.password, (hash) => {
      db.update(schema.admins).set({ password: hash }).where(eq(schema.admins.id, foundAdmin.id))
        .catch((e) => console.error('Failed to upgrade admin password hash:', e));
    });

    if (!ok) {
      return res.status(401).json({ error: 'اسم المستخدم أو رمز الدخول غير صحيح' });
    }

    const { password: _pw, ...safeAdmin } = foundAdmin;
    const token = signToken({ role: 'admin', companyId, id: foundAdmin.id, name: foundAdmin.name, username: foundAdmin.username });
    return res.json({ token, role: 'admin', ...safeAdmin, companyId });
  } catch (error: any) {
    console.error('Error during admin login:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول', details: error?.message || String(error) });
  }
});

app.post('/api/auth/employee-login', async (req, res) => {
  const { username, password, companyId: rawCompanyId } = req.body || {};
  const companyId = rawCompanyId || 'default';
  if (!username || !password) {
    return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });
  }
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
  const normalized = String(username).trim().toLowerCase();

  try {
    const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    const employees: any[] = (result[0]?.value as any)?.employees || [];

    const matchedEmp = employees.find((e: any) =>
      (e.username || '').toLowerCase() === normalized ||
      (e.name || '').toLowerCase() === normalized ||
      (e.phone || '').trim() === String(username).trim()
    );

    if (!matchedEmp) {
      return res.status(401).json({ error: 'هذا الموظف غير مسجل في قائمة الموظفين النشطة' });
    }

    if (!isActiveEmployee(matchedEmp)) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.' });
    const targetPassword = matchedEmp.password || '123456';
    // Employee PIN codes are intentionally kept as plain values (admins can view/share
    // them from the dashboard), so we compare directly rather than via bcrypt.
    if (String(password).trim() !== String(targetPassword).trim()) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة. (الرمز الافتراضي هو 123456)' });
    }

    const { password: _pw, ...safeEmp } = matchedEmp;
    const token = signToken({ role: 'employee', companyId, id: matchedEmp.id, name: matchedEmp.name, username: matchedEmp.username });
    return res.json({ token, ...safeEmp, companyId });
  } catch (error: any) {
    console.error('Error during employee login:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول', details: error?.message || String(error) });
  }
});

// --- WEBAUTHN ENDPOINTS ---

app.post('/api/auth/webauthn-register-options', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const { companyId: rawCompanyId, empId } = req.body || {};
  const companyId = rawCompanyId || 'default';
  const auth = (req as any).auth as AuthTokenPayload;

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
  const { empId, companyId: rawCompanyId } = req.body || {};
  const companyId = rawCompanyId || 'default';

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

    setStoredChallenge(companyId, employee.id, 'authentication', options.challenge);

    return res.json({
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

  if (!empId || !credentialId || !clientDataJSON || !authenticatorData || !signature) {
    return res.status(400).json({ error: 'بيانات التحقق البيومتري غير مكتملة' });
  }

  try {
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

    const { password: _pw, ...safeEmp } = employee;
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
  // logged in as that same company's admin/superadmin (or as superadmin generally).
  if (auth && auth.role !== 'superadmin' && auth.companyId !== companyId) return res.status(403).json({ error: 'بيانات شركة أخرى غير متاحة' });
  const visibleMainData = (value: any) => {
    if (!auth) return { departments: [], employees: [], shiftTypes: [], schedule: {}, settings: { companyName: value?.settings?.companyName, logoDataUrl: value?.settings?.logoDataUrl } };
    if (auth.role !== 'employee') return sanitizeMainData(value, true);
    return employeeMainData(value, auth);
  };
  const canSeeSecrets = !!auth && (auth.role === 'superadmin' || (auth.role === 'admin' && auth.companyId === companyId));

  try {
    const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    
    if (auth?.role === 'employee' && !isActiveEmployee((result[0]?.value as any)?.employees?.find((e: any) => String(e.id) === String(auth.id)))) return res.status(403).json({ error: 'حساب الموظف غير نشط. تواصل مع الإدارة.', code: 'EMPLOYEE_INACTIVE' });
    if (result.length === 0) {
      if (!auth) return res.json(visibleMainData(defaultMainData));
      // Seed initial data directly into PostgreSQL database
      let initialVal = defaultMainData;
      if (companyId !== 'default') {
        const comp = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
        const compName = comp.length > 0 ? comp[0].name : 'شركة فرعية جديدة';
        initialVal = createCleanCompanyData(compName);
      }
      
      const inserted = await db.insert(schema.systemData).values({
        key,
        value: initialVal,
      }).returning();
      
      return res.json(visibleMainData({ ...(inserted[0].value as any), _version: mainDataVersion(inserted[0].value) }));
    }
    
    return res.json(visibleMainData({ ...(result[0].value as any), _version: mainDataVersion(result[0].value) }));
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
  const { _baseVersion, _version, _schedulePublication: ignoredPublication, scheduleNotice: ignoredNotice, ...payload } = req.body || {};
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
  const auth = (req as any).auth as AuthTokenPayload;
  if (!payload || !Array.isArray(payload.employees) || !Array.isArray(payload.departments) || !Array.isArray(payload.shiftTypes) || !payload.schedule || typeof payload.schedule !== 'object' || Array.isArray(payload.schedule)) {
    return res.status(400).json({ error: 'بيانات الحفظ ناقصة أو غير صحيحة. لم يتم تعديل البيانات المسجلة.' });
  }

  if (auth.role !== 'employee' && payload.employees.some((e: any) => e.status !== undefined && !['active', 'suspended', 'archived'].includes(e.status))) return res.status(400).json({ error: 'حالة الموظف غير صحيحة' });
  try {
    const outcome = await db.transaction(async tx => {
      const result = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);

      if (result.length === 0) {
        if (auth.role === 'employee') return { status: 404, body: { error: 'بيانات الشركة غير موجودة' } };
        const initialValue = payload;
        const inserted = await tx.insert(schema.systemData).values({
          key,
          value: initialValue,
        }).onConflictDoNothing().returning();
        if (!inserted.length) return { status: 409, body: { error: 'تم إنشاء بيانات الشركة من جلسة أخرى. أعد تحميل البيانات قبل الحفظ.', code: 'DATA_CONFLICT' } };
        for (const change of employeeChanges([], payload.employees)) await audit(tx, auth, companyId, change.action, change.id, { ...change, actorName: auth.name || auth.username || 'المسؤول' });
        return { status: 200, body: { ...sanitizeMainData(inserted[0].value, true), _version: mainDataVersion(inserted[0].value) } };
      }

      const currentValue = result[0].value;
      if (auth.role !== 'employee' && _baseVersion !== mainDataVersion(currentValue)) {
        return { status: 409, body: { error: 'تغيرت البيانات في جلسة أخرى. لم يتم استبدالها. أعد تحميل آخر نسخة ثم أعد تطبيق تعديلك.', code: 'DATA_CONFLICT' } };
      }
      if (auth.role !== 'employee' && (currentValue as any).employees?.some((e: any) => !payload.employees.some((next: any) => String(next.id) === String(e.id)))) return { status: 400, body: { error: 'لا تحذف الموظفين نهائيًا؛ استخدم الأرشفة للحفاظ على سجلاتهم.' } };
      if (auth.role !== 'employee' && payload.employees.some((e: any) => { const old = (currentValue as any).employees?.find((previous: any) => String(previous.id) === String(e.id)); return old && employeeStatus(old) !== employeeStatus(e) && (typeof e.statusReason !== 'string' || !e.statusReason.trim() || e.statusReason.length > 500); })) return { status: 400, body: { error: 'أدخل سبب تغيير الحالة، بحد أقصى 500 حرف' } };
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

      const updated = await tx.update(schema.systemData)
        .set({ value: valueToSave, updatedAt: new Date() })
        .where(and(eq(schema.systemData.key, key), eq(schema.systemData.value, currentValue)))
        .returning();
      if (!updated.length) return { status: 409, body: { error: 'حفظ مستخدم آخر تعديلًا أثناء طلبك. أعد تحميل البيانات قبل المحاولة.', code: 'DATA_CONFLICT' } };
      for (const change of employeeChanges((currentValue as any).employees || [], valueToSave.employees)) await audit(tx, auth, companyId, change.action, change.id, { ...change, actorName: auth.name || auth.username || 'المسؤول' });
      return { status: 200, body: { ...(auth.role === 'employee' ? employeeMainData(updated[0].value, auth) : sanitizeMainData(updated[0].value, true)), _version: mainDataVersion(updated[0].value) } };
    });
    return res.status(outcome.status).json(outcome.body);
  } catch (error: any) {
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
app.patch('/api/employee-profile/email', requireAuth(['employee']), async (req, res) => {
  const auth = (req as any).auth as AuthTokenPayload;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!validEmployeeEmail(email)) return res.status(400).json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا' });
  try {
    const result = await db.transaction(async tx => {
      const key = auth.companyId === 'default' ? 'mainData' : 'mainData_' + auth.companyId;
      const rows = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1).for('update');
      const data: any = rows[0]?.value;
      if (!data?.employees?.some((e: any) => String(e.id) === String(auth.id))) return null;
      if (data.employees.find((e: any) => String(e.id) === String(auth.id)).email === email) return true;
      const value = { ...data, employees: data.employees.map((e: any) => String(e.id) === String(auth.id) ? { ...e, email } : e) };
      await tx.update(schema.systemData).set({ value, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
      await audit(tx, auth, auth.companyId, 'employee.email', auth.id, { name: data.employees.find((e: any) => String(e.id) === String(auth.id)).name, actorName: auth.name || 'الموظف', changes: { email: { before: data.employees.find((e: any) => String(e.id) === String(auth.id)).email || null, after: email } } });
      return true;
    });
    if (!result) return res.status(404).json({ error: 'حساب الموظف غير موجود' });
    return res.json({ email });
  } catch { return res.status(500).json({ error: 'تعذر حفظ البريد، حاول مرة أخرى' }); }
});

// Only stored employee addresses can receive welcome mail; durable claim prevents concurrent sends.
app.post('/api/employees/:id/welcome-email', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = String(req.query.companyId || 'default');
  const key = 'welcomeEmail_' + crypto.createHash('sha256').update(JSON.stringify([companyId, req.params.id])).digest('hex');
  let claimed: any;
  try {
    const data = await db.select().from(schema.systemData).where(eq(schema.systemData.key, companyId === 'default' ? 'mainData' : 'mainData_' + companyId)).limit(1);
    const employee = (data[0]?.value as any)?.employees?.find((e: any) => e.id === req.params.id);
    if (!employee) return res.status(404).json({ error: 'الموظف غير موجود' });
    const companies = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    const rows = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    const previous: any = rows[0]?.value;
    if (previous?.status === 'sent') return res.json({ message: 'سبق قبول رسالة الترحيب بواسطة خدمة البريد', status: 'sent' });
    // Never replay an ambiguous send beyond the provider's 24-hour idempotency window.
    if (previous && Date.now() - previous.startedAt > 23 * 3600000) return res.status(409).json({ error: 'يلزم مراجعة سجل Resend قبل إعادة الإرسال؛ انتهت نافذة منع التكرار' });
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

app.post('/api/registration-requests', async (req, res) => {
  const { name, type, username, phone, password, status, companyId } = req.body;

  try {
    const inserted = await db.insert(schema.registrationRequests).values({
      name,
      type,
      username: username || '',
      phone,
      password,
      status: status || 'pending',
      companyId: companyId || 'default'
    }).returning();
    return res.json(inserted[0]);
  } catch (error: any) {
    console.error('Error creating registration request in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل إرسال طلب التسجيل في قاعدة البيانات PostgreSQL: ' + (error?.message || String(error))
    });
  }
});

app.put('/api/registration-requests/:id', requireAuth(['admin', 'superadmin'], false), requireOwnedRow(schema.registrationRequests), async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  try {
    const updated = await db.update(schema.registrationRequests)
      .set({ status })
      .where(eq(schema.registrationRequests.id, id))
      .returning();
    return res.json(updated[0]);
  } catch (error: any) {
    console.error('Error updating registration request in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل تحديث حالة طلب التسجيل في قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
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
    const records = await db.select().from(schema.attendance).where(and(
      eq(schema.attendance.companyId, companyId),
      sql`${schema.attendance.date} >= ${query.from}`, sql`${schema.attendance.date} <= ${query.to}`,
      query.empId ? eq(schema.attendance.empId, query.empId) : undefined,
      query.dept && !query.analysis ? eq(schema.attendance.dept, query.dept) : undefined,
    )).orderBy(desc(schema.attendance.id));
    const mainData = await getMainDataByCompanyId(companyId);
    let reportDays = buildAttendanceDays(records, mainData?.settings);
    if (query.analysis) {
      const leaves = await db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved'), sql`${schema.requests.date} >= ${query.from}`, sql`${schema.requests.date} <= ${query.to}`));
      reportDays = analyzeAttendance(reportDays, effectiveScheduleData(mainData), query, leaves);
    }
    const days = reportDays.map(day => ({ ...day, departmentName: mainData?.departments?.find((dept: any) => dept.id === day.dept)?.name || day.dept }));
    return res.json({ ...attendanceReportPage(days, query), companyName: mainData?.settings?.companyName || companyId, from: query.from, to: query.to });
  } catch (error) { console.error('Attendance report query failed', error); return res.status(500).json({ error: 'تعذر تحميل كشف الحضور' }); }
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
    return res.json(result);
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
      if (!rows[0] || (auth.role !== 'superadmin' && rows[0].companyId !== auth.companyId)) return res.status(404).json({ error: 'سجل الحضور غير متاح' });
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
    return res.json(result);
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
  const id = parseInt(req.params.id);
  const { status } = req.body;

  try {
    const updated = await db.update(schema.requests)
      .set({ status })
      .where(eq(schema.requests.id, id))
      .returning();
    return res.json(updated[0]);
  } catch (error: any) {
    console.error('Error updating request in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل تحديث حالة الطلب في قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
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
    const safeResult = result.map(({ password, ...rest }) => rest);
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
  const { id, name, username, password, companyId } = req.body;
  const activeCompanyId = companyId || 'default';

  try {
    if (id) {
      const existing = await db.select().from(schema.admins).where(eq(schema.admins.id, Number(id))).limit(1);
      const auth = (req as any).auth as AuthTokenPayload;
      if (!existing[0] || (auth.role !== 'superadmin' && existing[0].companyId !== auth.companyId)) return res.status(404).json({ error: 'حساب المسؤول غير متاح' });
      const updateSet: Record<string, any> = { name, username };
      // Leaving the password field blank on an edit keeps the existing credential —
      // the form no longer prefills the old password, so "unchanged" means "not sent".
      if (password && password.trim()) {
        updateSet.password = hashPassword(password.trim());
      }
      const updated = await db.update(schema.admins)
        .set(updateSet)
        .where(eq(schema.admins.id, parseInt(id)))
        .returning();
      const { password: _pw, ...safe } = updated[0];
      return res.json(safe);
    } else {
      if (!password || !password.trim()) {
        return res.status(400).json({ error: 'كلمة المرور مطلوبة عند إنشاء مسؤول جديد' });
      }
      const inserted = await db.insert(schema.admins).values({
        name,
        username,
        password: hashPassword(password.trim()),
        companyId: activeCompanyId
      }).returning();
      const { password: _pw, ...safe } = inserted[0];
      return res.json(safe);
    }
  } catch (error: any) {
    console.error('Error creating/updating admin in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حفظ بيانات المسؤول في قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.delete('/api/admins/:id', requireAuth(['admin', 'superadmin'], false), requireOwnedRow(schema.admins), async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.delete(schema.admins).where(eq(schema.admins.id, id));
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting admin from PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حذف المسؤول من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.get('/api/employee-audit', requireAuth(['admin', 'superadmin']), async (req, res) => {
  const companyId = String(req.query.companyId || 'default');
  const empId = String(req.query.empId || '');
  if (!empId) return res.status(400).json({ error: 'اختر موظفًا' });
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

// 7. Companies / Subscription Management Endpoints
// The company list is fetched by the public login screen (to populate the workspace
// picker), so it can't require login itself — but it used to also hand back every
// company's master admin password and verification code in plain text to any visitor.
// A logged-in superadmin still gets the full rows (needed to manage/renew companies).
app.get('/api/companies', async (req, res) => {
  const auth = tryReadAuth(req);
  const isSuperadmin = auth?.role === 'superadmin';
  try {
    const result = await db.select().from(schema.companies).orderBy(desc(schema.companies.createdAt));
    if (isSuperadmin) return res.json(result);
    const safeResult = result.map(({ adminPassword, companyCode, ...rest }) => rest);
    return res.json(safeResult);
  } catch (error: any) {
    console.error('Error getting companies from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب الشركات من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/companies', requireAuth(['superadmin'], false), async (req, res) => {
  const { id, name, logoUrl, subscriptionStatus, subscriptionExpiresAt, monthlyFee, adminUsername, adminPassword, companyCode } = req.body;

  try {
    const existing = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
    
    let resultCompany;
    if (existing.length > 0) {
      const updateSet: Record<string, any> = {
        name,
        logoUrl: logoUrl || '',
        subscriptionStatus: subscriptionStatus || 'active',
        subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
        monthlyFee: monthlyFee || '100',
        adminUsername,
        companyCode: companyCode || '0',
      };
      // Blank password on an edit means "keep the current one" — the dashboard no
      // longer displays or prefills the existing plaintext password.
      if (adminPassword && adminPassword.trim()) {
        updateSet.adminPassword = hashPassword(adminPassword.trim());
      }
      const updated = await db.update(schema.companies)
        .set(updateSet)
        .where(eq(schema.companies.id, id))
        .returning();
      resultCompany = updated[0];
    } else {
      if (!adminPassword || !adminPassword.trim()) {
        return res.status(400).json({ error: 'كلمة مرور المدير المسؤول مطلوبة عند إنشاء شركة جديدة' });
      }
      const inserted = await db.insert(schema.companies).values({
        id,
        name,
        logoUrl: logoUrl || '',
        subscriptionStatus: subscriptionStatus || 'active',
        subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
        monthlyFee: monthlyFee || '100',
        adminUsername,
        adminPassword: hashPassword(adminPassword.trim()),
        companyCode: companyCode || '0',
      }).returning();
      resultCompany = inserted[0];
      
      const cleanData = createCleanCompanyData(name);
      await db.insert(schema.systemData).values({
        key: 'mainData_' + id,
        value: cleanData,
      }).catch(() => {});
    }
    const { adminPassword: _pw, ...safeCompany } = resultCompany;
    return res.json(safeCompany);
  } catch (error: any) {
    console.error('Error saving company to PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حفظ بيانات الشركة في قاعدة البيانات: ' + (error?.message || String(error))
    });
  }
});

app.delete('/api/companies/:id', requireAuth(['superadmin'], false), async (req, res) => {
  const id = req.params.id;

  try {
    await db.delete(schema.companies).where(eq(schema.companies.id, id));
    await db.delete(schema.systemData).where(eq(schema.systemData.key, 'mainData_' + id));
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting company from PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حذف الشركة من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});


// --- INTEGRATE VITE DEV SERVER MIDDLEWARE & PRODUCTION STATIC SERVING ---

async function startServer() {
  await initializeSchemaAndTables();
  await ensureJwtSecret();

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
