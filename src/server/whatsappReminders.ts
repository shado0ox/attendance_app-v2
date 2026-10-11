import crypto from 'node:crypto';
import express, { type Express } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { dueWhatsAppReminders, parseWhatsAppSettings, whatsappDefaults, whatsappReady, type WhatsAppSettings } from '../lib/whatsappReminders';
import { decryptWhatsAppSecret, encryptWhatsAppSecret, sendWhatsAppTemplate, validWhatsAppSignature, whatsappTemplatePayload } from './whatsappSecurity';
type Stored = { companyId: string; settings: WhatsAppSettings; secrets: Record<string, string>; webhookId: string };
const configKey = (id: string) => 'whatsappConfig:' + id;
const logPrefix = 'whatsappLog:';
const eventKey = (companyId: string, messageId: string) => 'whatsappEvent:' + crypto.createHash('sha256').update(JSON.stringify([companyId, messageId])).digest('hex');
const statusRank: Record<string, number> = { sending: -1, unknown: -1, accepted: 0, sent: 1, failed: 1.5, delivered: 2, read: 3 };
const secretFields = ['accessToken', 'appSecret', 'verifyToken'];
export function registerWhatsAppReminders(app: Express, requireAuth: any, getMain: (id: string) => Promise<any>, companyActive: (id: string) => Promise<boolean>, encryptionKey: () => string, send = sendWhatsAppTemplate) {
  const empty = (companyId: string): Stored => ({ companyId, settings: whatsappDefaults(), secrets: {}, webhookId: crypto.randomBytes(24).toString('hex') });
  const read = async (companyId: string, tx: any = db) => { const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, configKey(companyId))); return (row?.value as Stored) || empty(companyId); };
  const decode = (config: Stored, field: string) => decryptWhatsAppSecret(config.secrets[field] || '', encryptionKey(), config.companyId + ':' + field);
  const ready = (config: Stored) => whatsappReady(config.settings, !!config.secrets.accessToken, !!config.secrets.appSecret, !!config.secrets.verifyToken);
  const view = (config: Stored) => ({ ...config.settings, hasAccessToken: !!config.secrets.accessToken, hasAppSecret: !!config.secrets.appSecret, hasVerifyToken: !!config.secrets.verifyToken, ready: ready(config), webhookPath: '/api/whatsapp-webhook/' + config.webhookId });
  app.use('/api/whatsapp', express.json({ limit: '256kb' }));
  const admin = [requireAuth(['admin', 'superadmin'], false), (req: any, res: any, next: any) => { const requested = req.query.companyId ?? req.body?.companyId; if (requested !== undefined && String(requested) !== req.auth.companyId) return res.status(403).json({ error: 'الإعدادات خارج شركتك' }); next(); }];
  const saveConfig = async (tx: any, config: Stored) => tx.insert(schema.systemData).values({ key: configKey(config.companyId), value: config }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: config, updatedAt: new Date() } });
  app.post('/api/whatsapp/check', admin, async (req, res) => {
    try {
      const config = await read((req as any).auth.companyId);
      if (!config.settings.phoneNumberId || !config.secrets.accessToken) return res.status(400).json({ error: 'احفظ Phone Number ID وAccess Token أولًا' });
      const response = await fetch(`https://graph.facebook.com/${config.settings.apiVersion}/${config.settings.phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${decode(config, 'accessToken')}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      const body = await response.json();
      if (!response.ok || String(body.id) !== config.settings.phoneNumberId) return res.status(400).json({ error: 'تعذر التحقق من رقم الإرسال؛ راجع المعرف وصلاحية التوكن' });
      res.json({ connected: true, message: 'تم التحقق من رقم الإرسال؛ اعتماد القوالب وتسليم الرسائل يحتاجان اختبار إرسال.' });
    } catch { res.status(503).json({ error: 'تعذر الاتصال بـ Meta أو فك بيانات الحساب؛ راجع الاتصال والبيانات المحفوظة' }); }
  });
  app.get('/api/whatsapp/settings', admin, async (req, res) => {
    try {
      const companyId = (req as any).auth.companyId;
      const config = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${configKey(companyId)}))`);
        const value = await read(companyId, tx); await saveConfig(tx, value); return value;
      });
      const data = await getMain(companyId);
      res.json({ ...view(config), employees: (data?.employees || []).map((e: any) => ({ id: String(e.id), name: e.name })) });
    } catch { res.status(503).json({ error: 'تعذر تحميل إعدادات واتساب' }); }
  });
  app.post('/api/whatsapp/settings', admin, async (req, res) => {
    const companyId = (req as any).auth.companyId;
    try {
      const data = await getMain(companyId);
      const result = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${configKey(companyId)}))`);
        const config = await read(companyId, tx);
        config.settings = parseWhatsAppSettings(req.body, data?.employees || [], config.settings);
        for (const field of secretFields) {
          if (req.body[field] !== undefined && (typeof req.body[field] !== 'string' || req.body[field].length > 4096)) throw new Error('بيانات سرية غير صالحة');
          if (req.body.clearSecrets === true) config.secrets[field] = '';
          if (req.body[field]?.trim()) config.secrets[field] = encryptWhatsAppSecret(req.body[field].trim(), encryptionKey(), companyId + ':' + field);
        }
        if (config.settings.enabled && !ready(config)) throw new Error('أكمل بيانات الربط والقوالب قبل التفعيل');
        if (config.settings.enabled) for (const field of secretFields) decode(config, field);
        // The same sender cannot be assigned to two tenants: webhook attribution must be unique.
        if (config.settings.phoneNumberId) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'whatsappSender:' + config.settings.phoneNumberId}))`);
          const duplicate = await tx.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE 'whatsappConfig:%' AND ${schema.systemData.key} <> ${configKey(companyId)} AND ${schema.systemData.value}->'settings'->>'phoneNumberId' = ${config.settings.phoneNumberId}`);
          if (duplicate.length) throw new Error('رقم الإرسال مرتبط بشركة أخرى');
        }
        await saveConfig(tx, config);
        const auth = (req as any).auth;
        await tx.insert(schema.auditLog).values({ companyId, actorId: String(auth.id || auth.username || auth.role), actorRole: auth.role, action: 'whatsapp.settings', entityId: companyId, details: { enabled: config.settings.enabled, mode: config.settings.mode, employeeIds: config.settings.employeeIds, secretsUpdated: secretFields.filter(field => !!req.body[field]?.trim()), contactsWithConsent: Object.values(config.settings.contacts).filter(c => c.consent).length } });
        return view(config);
      });
      res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message?.includes('authenticate') ? 'تعذر فك بيانات الربط؛ أعد إدخال البيانات السرية' : error.message || 'تعذر حفظ الإعدادات' }); }
  });
  app.get('/api/whatsapp/logs', admin, async (req, res) => {
    try { const companyId = (req as any).auth.companyId;
      const rows = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE ${logPrefix + '%'} AND ${schema.systemData.value}->>'companyId' = ${companyId}`).orderBy(sql`${schema.systemData.updatedAt} DESC`).limit(100);
      res.json(rows.map(row => row.value));
    } catch { res.status(503).json({ error: 'تعذر تحميل سجل الرسائل' }); }
  });
  const lastTest = new Map<string, number>();
  app.post('/api/whatsapp/test', admin, async (req, res) => {
    const companyId = (req as any).auth.companyId, employeeId = String(req.body?.employeeId || ''), kind = req.body?.kind;
    if (!['attendance', 'departure'].includes(kind)) return res.status(400).json({ error: 'نوع التذكير غير صالح' });
    if ((lastTest.get(companyId) || 0) > Date.now() - 60000) return res.status(429).json({ error: 'انتظر دقيقة قبل إعادة الاختبار' });
    lastTest.set(companyId, Date.now());
    try {
      const result = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${configKey(companyId)}))`);
        const config = await read(companyId, tx), data = await getMain(companyId);
        const employee = data?.employees?.find((e: any) => String(e.id) === employeeId), contact = config.settings.contacts[employeeId];
        if (!ready(config) || !employee || !contact?.consent || !contact.phone || !config.settings[kind === 'attendance' ? 'attendanceTemplate' : 'departureTemplate']) throw new Error('أكمل الربط وحدد موظفًا لديه رقم وموافقة وقالب مناسب');
        const key = logPrefix + crypto.randomUUID();
        await tx.insert(schema.systemData).values({ key, value: { companyId, employeeId, employeeName: employee.name, kind, test: true, status: 'sending', createdAt: new Date().toISOString() } });
        return { config, employee, contact, key };
      });
      const accepted = await dispatch(result.config, result.employee, result.contact.phone, kind, 'اختبار التذكير', result.key);
      res.json({ accepted, message: accepted ? 'قبل واتساب الطلب؛ التسليم غير مؤكد حتى وصول تحديث الحالة.' : 'فشل الطلب أو لم يتأكد قبوله؛ راجع سجل الرسائل.' });
    } catch (error: any) { res.status(400).json({ error: error.message || 'تعذر الاختبار' }); }
  });
  async function updateLog(key: string, patch: any) {
    await db.transaction(async tx => {
      const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key)).for('update');
      if (!row) return;
      const current = row.value as any;
      // A fast delivery webhook may arrive before the API response is persisted.
      if (patch.status && (statusRank[patch.status] ?? -1) < (statusRank[current.status] ?? -1)) return;
      await tx.update(schema.systemData).set({ value: { ...current, ...patch }, updatedAt: new Date() }).where(eq(schema.systemData.key, key));
    });
  }
  async function dispatch(config: Stored, employee: any, phone: string, kind: string, shift: string, key: string) {
    try {
      const messageId = await send(config.settings, decode(config, 'accessToken'), whatsappTemplatePayload(config.settings, phone, kind, employee.name, shift));
      await updateLog(key, { status: 'accepted', messageId });
      const [event] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, eventKey(config.companyId, messageId)));
      if (event) await updateLog(key, (event.value as any).patch);
      return true;
    } catch (error: any) {
      await updateLog(key, { status: /^META_\d+$/.test(error.message) ? 'failed' : 'unknown', error: /^META_\d+$/.test(error.message) ? error.message : 'لم يتأكد قبول الطلب؛ لا يُعاد تلقائيًا لتجنب التكرار' }); return false;
    }
  }
  // These public routes must be registered before the global JSON parser.
  app.get('/api/whatsapp-webhook/:id', async (req, res) => {
    try { const rows = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE 'whatsappConfig:%' AND ${schema.systemData.value}->>'webhookId' = ${req.params.id}`);
      const config = rows[0]?.value as Stored;
      if (!config || req.query['hub.mode'] !== 'subscribe' || !config.secrets.verifyToken || req.query['hub.verify_token'] !== decode(config, 'verifyToken')) return res.sendStatus(403);
      res.status(200).send(String(req.query['hub.challenge'] || ''));
    } catch { res.sendStatus(503); }
  });
  app.post('/api/whatsapp-webhook/:id', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    try {
      const rows = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE 'whatsappConfig:%' AND ${schema.systemData.value}->>'webhookId' = ${req.params.id}`);
      const config = rows[0]?.value as Stored;
      if (!config || !validWhatsAppSignature(req.body, req.headers['x-hub-signature-256'], decode(config, 'appSecret'))) return res.sendStatus(403);
      const payload = JSON.parse(req.body.toString('utf8'));
      if (payload.object !== 'whatsapp_business_account') return res.sendStatus(400);
      for (const entry of payload.entry || []) for (const change of entry.changes || []) {
        const value = change.value;
        if (String(value?.metadata?.phone_number_id) !== config.settings.phoneNumberId) continue;
        for (const status of value.statuses || []) {
          if (!['sent', 'delivered', 'read', 'failed'].includes(status.status) || typeof status.id !== 'string') continue;
          const patch = { status: status.status, error: status.status === 'failed' ? 'META_' + (Number(status.errors?.[0]?.code) || 'DELIVERY') : undefined };
          await db.transaction(async tx => {
            const key = eventKey(config.companyId, status.id);
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
            const [previous] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, key));
            if ((statusRank[(previous?.value as any)?.patch?.status] ?? -1) > statusRank[patch.status]) return;
            await tx.insert(schema.systemData).values({ key, value: { companyId: config.companyId, patch } }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: { companyId: config.companyId, patch }, updatedAt: new Date() } });
          });
          const logs = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE ${logPrefix + '%'} AND ${schema.systemData.value}->>'companyId' = ${config.companyId} AND ${schema.systemData.value}->>'messageId' = ${status.id}`);
          for (const row of logs) {
            await updateLog(row.key, patch);
          }
        }
      }
      res.sendStatus(200);
    } catch { res.sendStatus(503); }
  });
  const excusedForEmployee = (docs: any[], employeeId: string, from: string, to: string) => {
    const days: string[] = []; for (let date = from; date <= to; date = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)) days.push(date);
    return days.filter(date => docs.some(doc => { const f = doc.formData; return doc.employeeId === employeeId && f?.requestType === 'absence' && date >= f.absenceFrom && date <= f.absenceTo; })).map(date => ({ empId: employeeId, date, status: 'approved' }));
  };
  let running = false;
  const run = async () => {
    if (running) return; running = true;
    try {
      const configs = await db.select().from(schema.systemData).where(sql`${schema.systemData.key} LIKE 'whatsappConfig:%'`);
      for (const row of configs) {
        const initial = row.value as Stored, companyId = initial.companyId;
        if (!initial.settings.enabled || !ready(initial) || !await companyActive(companyId)) continue;
        const now = Date.now(), from = new Date(now + 3 * 3600000 - 2 * 86400000).toISOString().slice(0, 10), to = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
        const data = await getMain(companyId);
        const [leaves, absences] = await Promise.all([
          db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved'), sql`${schema.requests.date} BETWEEN ${from} AND ${to}`)),
          db.select().from(schema.electronicDocuments).where(and(eq(schema.electronicDocuments.companyId, companyId), eq(schema.electronicDocuments.status, 'approved'))),
        ]);
        for (const employee of data?.employees || []) {
          const employeeId = String(employee.id);
          const jobs = await db.transaction(async tx => {
            const jobs: any[] = [];
            // Serialize claims with configuration changes and other worker instances.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${configKey(companyId)}))`);
            const config = await read(companyId, tx); if (!config.settings.enabled || !ready(config)) return jobs;
            const records = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, employeeId), sql`${schema.attendance.date} BETWEEN ${from} AND ${to}`));
            const excused = [from, new Date(now + 3 * 3600000 - 86400000).toISOString().slice(0, 10), to].filter(date => absences.some(doc => { const f = doc.formData as any; return doc.employeeId === employeeId && f?.requestType === 'absence' && date >= f.absenceFrom && date <= f.absenceTo; })).map(date => ({ empId: employeeId, date, status: 'approved' }));
            for (const reminder of dueWhatsAppReminders(data, employeeId, records, [...leaves, ...excused], config.settings, Date.now())) {
              const key = logPrefix + crypto.createHash('sha256').update(JSON.stringify([companyId, employeeId, reminder.key])).digest('hex');
              const claimed = await tx.insert(schema.systemData).values({ key, value: { companyId, employeeId, employeeName: employee.name, kind: reminder.kind, date: reminder.date, period: reminder.period, status: 'sending', createdAt: new Date().toISOString() } }).onConflictDoNothing().returning();
              if (!claimed.length || Date.now() >= reminder.expiresAt) continue;
              jobs.push({ config, reminder, key });
            }
            return jobs;
          });
          // Claims commit before any external request: a crash never resends the same slot.
          for (const job of jobs) {
            const fresh = await read(companyId);
            if (!fresh.settings.enabled || !dueWhatsAppReminders(await getMain(companyId), employeeId, await db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, companyId), eq(schema.attendance.empId, employeeId), sql`${schema.attendance.date} BETWEEN ${from} AND ${to}`)), [...leaves, ...excusedForEmployee(absences, employeeId, from, to)], fresh.settings, Date.now()).some(r => r.key === job.reminder.key)) { await updateLog(job.key, { status: 'cancelled' }); continue; }
            await dispatch(fresh, employee, fresh.settings.contacts[employeeId].phone, job.reminder.kind, job.reminder.shiftName, job.key);
          }
        }
      }
      await db.execute(sql`UPDATE ${schema.systemData} SET value = jsonb_set(value, '{status}', '"unknown"'::jsonb), updated_at = NOW() WHERE key LIKE ${logPrefix + '%'} AND value->>'status' = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'`);
      await db.delete(schema.systemData).where(sql`(${schema.systemData.key} LIKE ${logPrefix + '%'} OR ${schema.systemData.key} LIKE 'whatsappEvent:%') AND ${schema.systemData.updatedAt} < NOW() - INTERVAL '30 days'`);
    } catch { console.warn('WhatsApp reminder worker temporarily unavailable'); }
    finally { running = false; }
  };
  return { run, start() { if (process.env.ATTENDANCE_WHATSAPP_ENABLED === 'false') return; const timer = setInterval(() => void run(), 60000); timer.unref(); void run(); } };
}
