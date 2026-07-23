import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { db, schema, pool, initializeSchemaAndTables, getDbSchemaName } from './src/db/index.ts';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

// --- AUTH / PASSWORD HELPERS -------------------------------------------------
// JWT_SECRET should be set in .env for production so sessions survive restarts.
// A random fallback is used in dev so the app still works out of the box.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('[security] JWT_SECRET is not set in .env — using a random session secret for this run only. Set JWT_SECRET in .env for production so logins survive server restarts.');
  return generated;
})();

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

const signToken = (payload: AuthTokenPayload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

// Requires a valid bearer token with one of `roles`. When `matchCompany` is true (default),
// the token's companyId must match the request's companyId (superadmin is always exempt).
function requireAuth(roles: AuthTokenPayload['role'][], matchCompany: boolean = true) {
  return (req: Request, res: Response, next: NextFunction) => {
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
    const requestedCompanyId = (req.query.companyId as string) || (req.body && req.body.companyId) || 'default';
    if (matchCompany && payload.role !== 'superadmin' && payload.companyId !== requestedCompanyId) {
      return res.status(403).json({ error: 'لا يمكن الوصول لبيانات شركة أخرى' });
    }
    (req as any).auth = payload;
    next();
  };
}

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
          .where(eq(schema.systemData.key, key))
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

// --- API ENDPOINTS ---

// Database Connection Status & Health Check
app.get('/api/db-status', async (req, res) => {
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
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
  const auth = tryReadAuth(req);
  // Employee PIN codes / the superadmin password are only included for a caller who is
  // logged in as that same company's admin/superadmin (or as superadmin generally).
  const canSeeSecrets = !!auth && (auth.role === 'superadmin' || (auth.role === 'admin' && auth.companyId === companyId));

  try {
    const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    
    if (result.length === 0) {
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
      
      return res.json(sanitizeMainData(inserted[0].value, canSeeSecrets));
    }
    
    return res.json(sanitizeMainData(result[0].value, canSeeSecrets));
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
  const payload = req.body;
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
  const auth = (req as any).auth as AuthTokenPayload;

  try {
    const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);

    if (result.length === 0) {
      const initialValue = auth.role === 'employee' ? (payload && payload.employees ? payload : defaultMainData) : payload;
      const inserted = await db.insert(schema.systemData).values({
        key,
        value: initialValue,
      }).returning();
      return res.json(sanitizeMainData(inserted[0].value, auth.role !== 'employee'));
    }

    let valueToSave = payload;
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

    const updated = await db.update(schema.systemData)
      .set({ value: valueToSave, updatedAt: new Date() })
      .where(eq(schema.systemData.key, key))
      .returning();
    return res.json(sanitizeMainData(updated[0].value, auth.role !== 'employee'));
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

app.put('/api/registration-requests/:id', requireAuth(['admin', 'superadmin'], false), async (req, res) => {
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

app.delete('/api/registration-requests/:id', requireAuth(['admin', 'superadmin'], false), async (req, res) => {
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

// 4. Attendance Endpoints (Tenant Aware)
app.get('/api/attendance', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  try {
    const result = await db.select()
      .from(schema.attendance)
      .where(eq(schema.attendance.companyId, companyId))
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

app.post('/api/attendance', requireAuth(['employee', 'admin', 'superadmin']), async (req, res) => {
  const {
    id, empId, empName, dept, date,
    checkIn, checkInTs, checkOut, checkOutTs, checkInLat, checkInLng,
    checkIn2, checkInTs2, checkOut2, checkOutTs2, checkInLat2, checkInLng2,
    status, source, note, companyId
  } = req.body;

  const activeCompanyId = companyId || 'default';
  const auth = (req as any).auth as AuthTokenPayload;

  try {
    if (id) {
      // Check-out / second-period updates reference an existing row by id and don't
      // resend empId, so ownership is verified against the stored record instead.
      if (auth.role === 'employee') {
        const existingRows = await db.select().from(schema.attendance).where(eq(schema.attendance.id, parseInt(id))).limit(1);
        if (!existingRows[0] || String(existingRows[0].empId) !== String(auth.id)) {
          return res.status(403).json({ error: 'لا يمكنك تعديل سجل حضور موظف آخر' });
        }
      }
      // Update existing record in PostgreSQL
      const updated = await db.update(schema.attendance)
        .set({
          empId, empName, dept, date,
          checkIn, checkInTs: checkInTs ? String(checkInTs) : null, checkOut, checkOutTs: checkOutTs ? String(checkOutTs) : null, checkInLat, checkInLng,
          checkIn2, checkInTs2: checkInTs2 ? String(checkInTs2) : null, checkOut2, checkOutTs2: checkOutTs2 ? String(checkOutTs2) : null, checkInLat2, checkInLng2,
          status, source, note
        })
        .where(eq(schema.attendance.id, parseInt(id)))
        .returning();
      return res.json(updated[0]);
    } else {
      if (auth.role === 'employee' && String(empId) !== String(auth.id)) {
        return res.status(403).json({ error: 'لا يمكنك تسجيل حضور موظف آخر' });
      }
      // Insert new record in PostgreSQL
      const inserted = await db.insert(schema.attendance).values({
        empId, empName, dept: dept || '', date,
        checkIn, checkInTs: checkInTs ? String(checkInTs) : null, checkOut, checkOutTs: checkOutTs ? String(checkOutTs) : null, checkInLat, checkInLng,
        checkIn2, checkInTs2: checkInTs2 ? String(checkInTs2) : null, checkOut2, checkOutTs2: checkOutTs2 ? String(checkOutTs2) : null, checkInLat2, checkInLng2,
        status: status || 'present', source: source || 'المقر', note: note || '',
        companyId: activeCompanyId
      }).returning();
      return res.json(inserted[0]);
    }
  } catch (error: any) {
    console.error('Error registering attendance in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل تسجيل الحضور والانصراف في قاعدة البيانات PostgreSQL: ' + (error?.message || String(error))
    });
  }
});

app.delete('/api/attendance/:id', requireAuth(['admin', 'superadmin'], false), async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.delete(schema.attendance).where(eq(schema.attendance.id, id));
    return res.json({ success: true });
  } catch (error: any) {
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
      .where(eq(schema.requests.companyId, companyId))
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
      empId, empName, dept: dept || '', date, type, notes: notes || '', status: status || 'pending',
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

app.put('/api/requests/:id', requireAuth(['admin', 'superadmin'], false), async (req, res) => {
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

app.delete('/api/admins/:id', requireAuth(['admin', 'superadmin'], false), async (req, res) => {
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
  // Ensure local PostgreSQL schema and tables are initialized
  await initializeSchemaAndTables();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
