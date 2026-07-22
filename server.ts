import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db, schema, pool, initializeSchemaAndTables, getDbSchemaName } from './src/db/index.ts';
import { eq, desc } from 'drizzle-orm';

const app = express();
app.use(express.json());

const PORT = 3000;

// Debug DB route
app.get('/api/debug-db', (req, res) => {
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

// Diagnose DB route
app.get('/api/diagnose-db', async (req, res) => {
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
        host,
        database: dbName,
        message: 'تم الاتصال بقاعدة بيانات PostgreSQL بنجاح'
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return res.status(500).json({
      status: 'disconnected',
      error: 'فشل الاتصال بقاعدة البيانات PostgreSQL',
      details: err?.message || String(err),
      host,
      database: dbName,
      targetSchema: dbSchema
    });
  }
});

// 1. Get/Seed Main App Data (Tenant Aware)
app.get('/api/main-data', async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;

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
      
      return res.json(inserted[0].value);
    }
    
    return res.json(result[0].value);
  } catch (error: any) {
    console.error('Error fetching main-data from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في الاتصال بقاعدة البيانات PostgreSQL أثناء جلب البيانات الرئيسية',
      details: error?.message || String(error)
    });
  }
});

// 2. Save Main App Data (Tenant Aware)
app.post('/api/main-data', async (req, res) => {
  const payload = req.body;
  const companyId = (req.query.companyId as string) || 'default';
  const key = companyId === 'default' ? 'mainData' : 'mainData_' + companyId;

  try {
    const result = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)).limit(1);
    
    if (result.length === 0) {
      const inserted = await db.insert(schema.systemData).values({
        key,
        value: payload,
      }).returning();
      return res.json(inserted[0].value);
    } else {
      const updated = await db.update(schema.systemData)
        .set({ value: payload, updatedAt: new Date() })
        .where(eq(schema.systemData.key, key))
        .returning();
      return res.json(updated[0].value);
    }
  } catch (error: any) {
    console.error('Error saving main-data to PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في حفظ البيانات في قاعدة بيانات PostgreSQL',
      details: error?.message || String(error)
    });
  }
});

// 3. Registration Requests (Tenant Aware)
app.get('/api/registration-requests', async (req, res) => {
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

app.put('/api/registration-requests/:id', async (req, res) => {
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

app.delete('/api/registration-requests/:id', async (req, res) => {
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
app.get('/api/attendance', async (req, res) => {
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

app.post('/api/attendance', async (req, res) => {
  const {
    id, empId, empName, dept, date,
    checkIn, checkInTs, checkOut, checkOutTs, checkInLat, checkInLng,
    checkIn2, checkInTs2, checkOut2, checkOutTs2, checkInLat2, checkInLng2,
    status, source, note, companyId
  } = req.body;

  const activeCompanyId = companyId || 'default';

  try {
    if (id) {
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

app.delete('/api/attendance/:id', async (req, res) => {
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
app.get('/api/requests', async (req, res) => {
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

app.post('/api/requests', async (req, res) => {
  const {
    empId, empName, dept, date, type, notes, status,
    swapWithEmpId, swapWithEmpName, targetShift, checkInTime, checkOutTime, companyId
  } = req.body;

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

app.put('/api/requests/:id', async (req, res) => {
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
app.get('/api/admins', async (req, res) => {
  const companyId = (req.query.companyId as string) || 'default';
  try {
    const result = await db.select()
      .from(schema.admins)
      .where(eq(schema.admins.companyId, companyId))
      .orderBy(desc(schema.admins.createdAt));
    return res.json(result);
  } catch (error: any) {
    console.error('Error getting admins from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب بيانات المسؤولين من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/admins', async (req, res) => {
  const { id, name, username, password, companyId } = req.body;
  const activeCompanyId = companyId || 'default';

  try {
    if (id) {
      const updated = await db.update(schema.admins)
        .set({ name, username, password })
        .where(eq(schema.admins.id, parseInt(id)))
        .returning();
      return res.json(updated[0]);
    } else {
      const inserted = await db.insert(schema.admins).values({
        name,
        username,
        password,
        companyId: activeCompanyId
      }).returning();
      return res.json(inserted[0]);
    }
  } catch (error: any) {
    console.error('Error creating/updating admin in PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حفظ بيانات المسؤول في قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.delete('/api/admins/:id', async (req, res) => {
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
app.get('/api/companies', async (req, res) => {
  try {
    const result = await db.select().from(schema.companies).orderBy(desc(schema.companies.createdAt));
    return res.json(result);
  } catch (error: any) {
    console.error('Error getting companies from PostgreSQL:', error);
    return res.status(500).json({
      error: 'خطأ في جلب الشركات من قاعدة البيانات',
      details: error?.message || String(error)
    });
  }
});

app.post('/api/companies', async (req, res) => {
  const { id, name, logoUrl, subscriptionStatus, subscriptionExpiresAt, monthlyFee, adminUsername, adminPassword, companyCode } = req.body;

  try {
    const existing = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
    
    let resultCompany;
    if (existing.length > 0) {
      const updated = await db.update(schema.companies)
        .set({
          name,
          logoUrl: logoUrl || '',
          subscriptionStatus: subscriptionStatus || 'active',
          subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
          monthlyFee: monthlyFee || '100',
          adminUsername,
          adminPassword,
          companyCode: companyCode || '0',
        })
        .where(eq(schema.companies.id, id))
        .returning();
      resultCompany = updated[0];
    } else {
      const inserted = await db.insert(schema.companies).values({
        id,
        name,
        logoUrl: logoUrl || '',
        subscriptionStatus: subscriptionStatus || 'active',
        subscriptionExpiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null,
        monthlyFee: monthlyFee || '100',
        adminUsername,
        adminPassword,
        companyCode: companyCode || '0',
      }).returning();
      resultCompany = inserted[0];
      
      const cleanData = createCleanCompanyData(name);
      await db.insert(schema.systemData).values({
        key: 'mainData_' + id,
        value: cleanData,
      }).catch(() => {});
    }
    return res.json(resultCompany);
  } catch (error: any) {
    console.error('Error saving company to PostgreSQL:', error);
    return res.status(500).json({
      error: 'فشل حفظ بيانات الشركة في قاعدة البيانات: ' + (error?.message || String(error))
    });
  }
});

app.delete('/api/companies/:id', async (req, res) => {
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
