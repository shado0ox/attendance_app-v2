import crypto from 'node:crypto';
import type { Express } from 'express';
import webpush from 'web-push';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { dueAttendanceReminders } from '../lib/attendanceReminders';
import { validPushSubscription } from './attendancePushValidation';

const prefix = 'attendancePush:';
const keyFor = (endpoint: string) => prefix + crypto.createHash('sha256').update(endpoint).digest('hex');
type Stored = { companyId: string; employeeId: string; subscription: webpush.PushSubscription; sent: string[] };

export function registerAttendancePush(app: Express, requireAuth: any, getMain: (companyId: string) => Promise<any>, companyActive: (companyId: string) => Promise<boolean>, send: typeof webpush.sendNotification = webpush.sendNotification) {
  let vapid: { publicKey: string; privateKey: string } | undefined;
  const keys = async () => {
    if (!vapid) {
      const generated = webpush.generateVAPIDKeys();
      await db.insert(schema.systemData).values({ key: 'attendancePushVapid', value: generated }).onConflictDoNothing();
      const [row] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, 'attendancePushVapid'));
      vapid = row.value as typeof generated;
    }
    return vapid;
  };
  const employeeOnly = [requireAuth(['employee'], false), (req: any, res: any, next: any) => {
    const companyId = req.query?.companyId ?? req.body?.companyId;
    if (companyId !== undefined && String(companyId) !== req.auth.companyId) return res.status(403).json({ error: 'الاشتراك خارج شركتك' });
    next();
  }];
  app.get('/api/attendance-push/key', employeeOnly, async (_req, res) => {
    if (process.env.ATTENDANCE_PUSH_ENABLED === 'false') return res.status(503).json({ error: 'تذكيرات السيرفر متوقفة؛ التذكير متاح أثناء فتح التطبيق.' });
    try { res.json({ publicKey: (await keys()).publicKey }); }
    catch { res.status(503).json({ error: 'تعذر تجهيز إشعارات الحضور' }); }
  });
  app.post('/api/attendance-push/subscription', employeeOnly, async (req, res) => {
    if (!validPushSubscription(req.body?.subscription)) return res.status(400).json({ error: 'اشتراك إشعارات غير صالح' });
    const auth = (req as any).auth, subscription = req.body.subscription as webpush.PushSubscription;
    try {
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${prefix + auth.companyId + ':' + auth.id}))`);
        const key = keyFor(subscription.endpoint);
        const owned = await tx.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE ${prefix + '%'} AND ${schema.systemData.value}->>'companyId' = ${auth.companyId} AND ${schema.systemData.value}->>'employeeId' = ${String(auth.id)}`);
        if (owned.filter(row => row.key !== key).length >= 5) throw new Error('device_limit');
        const [previousRow] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).for('update');
        const previous = previousRow?.value as Stored | undefined;
        const sameOwner = previous?.companyId === auth.companyId && previous?.employeeId === String(auth.id);
        const value: Stored = { companyId: auth.companyId, employeeId: String(auth.id), subscription: { endpoint: subscription.endpoint, keys: subscription.keys }, sent: sameOwner ? previous.sent || [] : [] };
        await tx.insert(schema.systemData).values({ key, value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
      });
      res.json({ enabled: true });
    } catch (error: any) { res.status(error.message === 'device_limit' ? 409 : 503).json({ error: error.message === 'device_limit' ? 'تم تفعيل خمسة أجهزة؛ عطّل جهازًا قديمًا أولًا' : 'تعذر حفظ اشتراك الإشعارات' }); }
  });
  app.delete('/api/attendance-push/subscription', employeeOnly, async (req, res) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return res.status(400).json({ error: 'اشتراك غير صالح' });
    const auth = (req as any).auth;
    try {
      await db.delete(schema.systemData).where(and(eq(schema.systemData.key, keyFor(endpoint)), sql`${schema.systemData.value}->>'companyId' = ${auth.companyId}`, sql`${schema.systemData.value}->>'employeeId' = ${String(auth.id)}`));
      res.json({ enabled: false });
    } catch { res.status(503).json({ error: 'تعذر إيقاف الإشعارات' }); }
  });

  let running = false;
  const run = async () => {
    if (running) return; running = true;
    try {
      const rows = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE ${prefix + '%'}`);
      const companies = new Set(rows.map(row => (row.value as Stored).companyId));
      for (const companyId of companies) {
        if (!await companyActive(companyId)) continue;
        const data = await getMain(companyId), now = Date.now();
        const from = new Date(now + 3 * 3600000 - 86400000).toISOString().slice(0, 10), to = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
        const [records, leaves, absences] = await Promise.all([
          db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), sql`${schema.attendance.date} BETWEEN ${from} AND ${to}`)),
          db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved'), sql`${schema.requests.date} BETWEEN ${from} AND ${to}`)),
          db.select().from(schema.electronicDocuments).where(and(eq(schema.electronicDocuments.companyId, companyId), eq(schema.electronicDocuments.status, 'approved'))),
        ]);
        for (const row of rows.filter(row => (row.value as Stored).companyId === companyId)) {
          const stored = row.value as Stored;
          if (!validPushSubscription(stored.subscription)) continue;
          const employeeAbsences = [from, to].filter(date => absences.some(doc => { const f = doc.formData as any; return doc.employeeId === stored.employeeId && f?.requestType === 'absence' && date >= f.absenceFrom && date <= f.absenceTo; })).map(date => ({ empId: stored.employeeId, date, status: 'approved' }));
          for (const reminder of dueAttendanceReminders(data, stored.employeeId, records, [...leaves, ...employeeAbsences], Date.now())) {
            // Claim each interval persistently before sending; retries/restarts never flood a device.
            const claimed = await db.transaction(async tx => {
              const [current] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, row.key)).for('update');
              const value = current?.value as Stored;
              if (!value || value.companyId !== companyId || value.employeeId !== stored.employeeId || value.sent?.includes(reminder.key)) return false;
              const fresh = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, stored.employeeId), eq(schema.attendance.date, reminder.date)));
              if (fresh.some(r => r[reminder.period === 1 ? 'checkIn' : 'checkIn2']) || Date.now() >= reminder.expiresAt) return false;
              await tx.update(schema.systemData).set({ value: { ...value, sent: [...(value.sent || []), reminder.key].slice(-24) }, updatedAt: new Date() }).where(eq(schema.systemData.key, row.key));
              return true;
            });
            if (!claimed) continue;
            try {
              const vapidKeys = await keys();
              await send(stored.subscription, JSON.stringify({ title: 'لم تسجل حضورك', body: `لم تُسجّل حضور ${reminder.shiftName}${reminder.period === 2 ? ' — الفترة الثانية' : ''}. افتح التطبيق لتسجيل البصمة.`, tag: `${companyId}:${stored.employeeId}:${reminder.date}:${reminder.period}`, url: '/employee', expiresAt: reminder.expiresAt }), {
                vapidDetails: { subject: process.env.APP_URL || 'https://attendance.example.com', ...vapidKeys },
                TTL: Math.max(1, Math.min(60, Math.floor((reminder.expiresAt - Date.now()) / 1000))), timeout: 10000, urgency: 'high',
              });
            } catch (error: any) {
              if ([404, 410].includes(error.statusCode)) await db.delete(schema.systemData).where(and(eq(schema.systemData.key, row.key), sql`${schema.systemData.value}->>'companyId' = ${companyId}`, sql`${schema.systemData.value}->>'employeeId' = ${stored.employeeId}`));
              else console.warn('Attendance push delivery failed', error.statusCode || 'network');
            }
          }
        }
      }
    } catch { console.warn('Attendance reminder worker temporarily unavailable'); }
    finally { running = false; }
  };
  const start = () => {
    if (process.env.ATTENDANCE_PUSH_ENABLED === 'false') return;
    const timer = setInterval(() => { void run(); }, 60000); timer.unref(); void run();
  };
  return { start, run };
}
