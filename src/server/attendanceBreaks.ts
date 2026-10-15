import crypto from 'node:crypto';
import type { Express } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { breakMetrics, employeeBreakPlans, openBreak, parseBreakRules, type BreakEntry, type BreakRule } from '../lib/attendanceBreaks';
import { validAttendanceDate } from '../lib/attendanceMonths';
import { ownsDay, fullAdminAccess } from '../lib/adminAccess';
const policyKey = (company: string) => 'attendanceBreakPolicy:' + company;
const mainKey = (company: string) => company === 'default' ? 'mainData' : 'mainData_' + company;
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
export function registerAttendanceBreaks(app: Express, requireAuth: any, getMain: (id: string) => Promise<any>, now = () => Date.now()) {
  const readRules = async (company: string, tx: any = db): Promise<BreakRule[]> => { const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, policyKey(company))); return (row?.value as any)?.rules || []; };
  const auth = (roles: string[]) => [requireAuth(roles, false), (req: any, res: any, next: any) => { const company = req.query.companyId ?? req.body?.companyId; if (company !== undefined && String(company) !== req.auth.companyId) return res.status(403).json({ error: 'الاستراحة خارج شركتك' }); next(); }];
  const wrap = (handler: any) => async (req: any, res: any) => { try { await handler(req, res); } catch (e: any) { res.status(e.status || 400).json({ error: e.status || !e.code ? e.message || 'تعذر تنفيذ الاستراحة' : 'تعذر حفظ الاستراحة؛ حدّث الحالة قبل إعادة المحاولة' }); } };
  const audit = (tx: any, account: any, action: string, id: any, details: any) => tx.insert(schema.auditLog).values({ companyId: account.companyId, actorId: String(account.id ?? account.username ?? account.role), actorRole: account.role, action, entityId: String(id), details });
  app.get('/api/attendance-breaks/policy', auth(['admin', 'superadmin']), wrap(async (req: any, res: any) => {
    const data = await getMain(req.auth.companyId), employees = (data?.employees || []).map((e: any) => ({ id: String(e.id), name: e.name }));
    const shifts = [...new Map<string, any>([...(data?._schedulePublication?.shiftTypes || []), ...(data?.shiftTypes || [])].map((s: any) => [String(s.id), s])).values()];
    const employeeIds = new Set(employees.map((e: any) => e.id)), shiftIds = new Set(shifts.map(s => String(s.id)));
    const rules = (await readRules(req.auth.companyId)).map(rule => { const employeeIdsForRule = rule.employeeIds.filter(id => employeeIds.has(id)), shiftIdsForRule = rule.shiftIds.filter(id => shiftIds.has(id)); return { ...rule, employeeIds: employeeIdsForRule, shiftIds: shiftIdsForRule, enabled: rule.enabled && (rule.scope === 'employees' ? employeeIdsForRule.length > 0 : shiftIdsForRule.length > 0) }; });
    res.json({ rules, employees, shifts });
  }));
  app.post('/api/attendance-breaks/policy', auth(['admin', 'superadmin']), wrap(async (req: any, res: any) => {
    const company = req.auth.companyId;
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${policyKey(company)}))`);
      const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, mainKey(company)));
      const data = row?.value as any, shifts = [...new Map<string, any>([...(data?._schedulePublication?.shiftTypes || []), ...(data?.shiftTypes || [])].map((s: any) => [String(s.id), s])).values()];
      const rules = parseBreakRules(req.body?.rules, data?.employees || [], shifts), value = { companyId: company, rules };
      await tx.insert(schema.systemData).values({ key: policyKey(company), value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
      await audit(tx, req.auth, 'break.policy', company, { rules });
    }); res.json({ saved: true });
  }));
  const status = async (account: any) => {
    const company = account.companyId, employeeId = String(account.id), time = now();
    const today = new Date(time + 3 * 3600000).toISOString().slice(0, 10), yesterday = new Date(time + 3 * 3600000 - 86400000).toISOString().slice(0, 10);
    const [data, rules, records] = await Promise.all([getMain(company), readRules(company), db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, company), eq(schema.attendance.empId, employeeId), sql`(${schema.attendance.date} BETWEEN ${yesterday} AND ${today} OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(${schema.attendance.breaks}, '[]'::jsonb)) entry WHERE entry->>'endedAt' IS NULL))`)).orderBy(desc(schema.attendance.id))]);
    const plans = [yesterday, today].flatMap(date => employeeBreakPlans(data, rules, employeeId, date)).filter(plan => plan.date === today || (plan.window && plan.window.shiftEnd >= time));
    const entries = records.flatMap(record => (Array.isArray(record.breaks) ? record.breaks : []).map((entry: any) => ({ ...entry, recordId: record.id, date: record.date, ...breakMetrics(entry, time) })));
    const leaves = await db.select().from(schema.requests).where(and(eq(schema.requests.companyId, company), eq(schema.requests.empId, employeeId), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved')));
    const absences = await db.select().from(schema.electronicDocuments).where(and(eq(schema.electronicDocuments.companyId, company), eq(schema.electronicDocuments.employeeId, employeeId), eq(schema.electronicDocuments.status, 'approved')));
    const excused = (date: string) => leaves.some(r => r.date === date) || absences.some(doc => { const f = doc.formData as any; return f?.requestType === 'absence' && date >= f.absenceFrom && date <= f.absenceTo; });
    return { serverNow: time, entries, plans: plans.map(plan => { const record = records.find(record => record.date === plan.date && !!record[plan.period === 1 ? 'checkIn' : 'checkIn2'] && !record[plan.period === 1 ? 'checkOut' : 'checkOut2']); return { ...plan, rule: { id: plan.rule.id, name: plan.rule.name, durationMinutes: plan.rule.durationMinutes }, recordId: record?.id || null, eligible: !!record && !entries.some(e => !e.endedAt) && !(record.breaks as any[] || []).some(entry => entry.period === plan.period) && !excused(plan.date), canStart: !!record && !entries.some(e => !e.endedAt) && !(record.breaks as any[] || []).some(entry => entry.period === plan.period) && !!plan.window && !excused(plan.date) && time >= plan.window.start && time < plan.window.end }; }) };
  };
  app.get('/api/attendance-breaks/status', auth(['employee']), wrap(async (req: any, res: any) => res.json(await status(req.auth))));
  app.post('/api/attendance-breaks/action', auth(['employee']), wrap(async (req: any, res: any) => {
    const company = req.auth.companyId, employeeId = String(req.auth.id), body = req.body;
    if (!Number.isInteger(body?.recordId) || !['start', 'end'].includes(body?.action) || ![1, 2].includes(body?.period)) fail(400, 'حدد سجل الحضور والفترة والإجراء');
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${company + ':' + employeeId}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance-report:' + company}))`);
      const [record] = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.id, body.recordId), eq(schema.attendance.companyId, company), eq(schema.attendance.empId, employeeId))).for('update');
      if (!record) fail(404, 'سجل الحضور غير متاح');
      const [month] = await tx.select().from(schema.attendanceMonths).where(eq(schema.attendanceMonths.key, company + ':' + record.date.slice(0, 7)));
      if ((month?.value as any)?.status === 'approved') fail(409, 'الشهر معتمد؛ اطلب إعادة فتحه من الإدارة');
      const entries: BreakEntry[] = Array.isArray(record.breaks) ? structuredClone(record.breaks) : [], time = now(), running = openBreak(record);
      if (body.action === 'end') {
        const existing = entries.find(entry => entry.id === body.entryId && entry.period === body.period);
        if (!existing) fail(404, 'الاستراحة غير موجودة');
        if (existing.endedAt) return { entry: existing, duplicate: true };
        existing.endedAt = Math.max(time, existing.startedAt);
        await tx.update(schema.attendance).set({ breaks: entries }).where(eq(schema.attendance.id, record.id));
        await audit(tx, req.auth, 'break.end', record.id, { ...existing, empId: employeeId, ...breakMetrics(existing, time) }); return { entry: existing };
      }
      const existing = entries.find(entry => entry.period === body.period);
      if (existing) return { entry: existing, duplicate: true };
      const pending = await tx.select({ id: schema.attendance.id }).from(schema.attendance).where(and(eq(schema.attendance.companyId, company), eq(schema.attendance.empId, employeeId), sql`EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(${schema.attendance.breaks}, '[]'::jsonb)) entry WHERE entry->>'endedAt' IS NULL)`));
      if (running || pending.length) fail(409, 'أنهِ الاستراحة الحالية أولًا');
      if (!record[body.period === 1 ? 'checkIn' : 'checkIn2'] || record[body.period === 1 ? 'checkOut' : 'checkOut2']) fail(409, 'يلزم حضور مسجل وفترة عمل لم ينتهِ انصرافها');
      const [main] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, mainKey(company)));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${policyKey(company)}))`);
      const plan = employeeBreakPlans(main?.value, await readRules(company, tx), employeeId, record.date).find(plan => plan.period === body.period);
      if (!plan?.window || time < plan.window.start || time >= plan.window.end) fail(409, plan?.issue || 'الاستراحة غير مستحقة الآن أو موعدها انتهى');
      const leaves = await tx.select().from(schema.requests).where(and(eq(schema.requests.companyId, company), eq(schema.requests.empId, employeeId), eq(schema.requests.date, record.date), eq(schema.requests.type, 'leave'), eq(schema.requests.status, 'approved')));
      const absences = await tx.select().from(schema.electronicDocuments).where(and(eq(schema.electronicDocuments.companyId, company), eq(schema.electronicDocuments.employeeId, employeeId), eq(schema.electronicDocuments.status, 'approved')));
      if (leaves.length || absences.some(doc => { const form = doc.formData as any; return form?.requestType === 'absence' && record.date >= form.absenceFrom && record.date <= form.absenceTo; })) fail(409, 'اليوم إجازة أو غياب معتمد');
      const entry: BreakEntry = { id: crypto.randomUUID(), period: body.period, ruleId: plan.rule.id, name: plan.rule.name, plannedStart: plan.window.start, plannedEnd: plan.window.end, allowedMinutes: plan.rule.durationMinutes, startedAt: time, endedAt: null };
      entries.push(entry); await tx.update(schema.attendance).set({ breaks: entries }).where(eq(schema.attendance.id, record.id));
      await audit(tx, req.auth, 'break.start', record.id, { ...entry, empId: employeeId }); return { entry };
    }); res.json({ ...result, serverNow: now() });
  }));
  app.post('/api/attendance-breaks/close', auth(['admin', 'superadmin']), wrap(async (req: any, res: any) => {
    const { recordId, entryId, reason } = req.body || {}, company = req.auth.companyId;
    if (!Number.isInteger(recordId) || typeof entryId !== 'string' || typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 1000) fail(400, 'حدد الاستراحة واكتب سبب الإنهاء (5 أحرف على الأقل)');
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance-report:' + company}))`);
      const [record] = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.id, recordId), eq(schema.attendance.companyId, company))).for('update');
      if (!record) fail(404, 'السجل غير متاح');
      const [month] = await tx.select().from(schema.attendanceMonths).where(eq(schema.attendanceMonths.key, company + ':' + record.date.slice(0, 7)));
      if ((month?.value as any)?.status === 'approved') fail(409, 'الشهر معتمد؛ أعد فتحه أولًا');
      const entries: BreakEntry[] = Array.isArray(record.breaks) ? structuredClone(record.breaks) : [], entry = entries.find(e => e.id === entryId);
      if (!entry) fail(404, 'الاستراحة غير موجودة');
      if (entry.endedAt) return;
      entry.endedAt = Math.max(now(), entry.startedAt); (entry as any).closedByAdmin = true;
      await tx.update(schema.attendance).set({ breaks: entries }).where(eq(schema.attendance.id, recordId));
      await audit(tx, req.auth, 'break.admin-close', recordId, { ...entry, reason: reason.trim(), empId: record.empId, ...breakMetrics(entry, now()) });
    }); res.json({ saved: true });
  }));
  app.get('/api/attendance-breaks/report', auth(['admin', 'superadmin']), wrap(async (req: any, res: any) => {
    const { from, to, empId = '', page = '1' } = req.query;
    if (!validAttendanceDate(from) || !validAttendanceDate(to) || from > to || typeof empId !== 'string' || !/^\d+$/.test(page) || +page < 1 || +page > 10000 || Date.parse(to) - Date.parse(from) > 366 * 86400000) fail(400, 'اختر فترة صحيحة لا تتجاوز سنة');
    const access = req.adminAccess || fullAdminAccess(), data = await getMain(req.auth.companyId);
    const records = await db.select().from(schema.attendance).where(and(eq(schema.attendance.companyId, req.auth.companyId), sql`${schema.attendance.date} BETWEEN ${from} AND ${to}`, empId ? eq(schema.attendance.empId, empId) : undefined, sql`jsonb_array_length(COALESCE(${schema.attendance.breaks}, '[]'::jsonb)) > 0`)).orderBy(desc(schema.attendance.date), desc(schema.attendance.id));
    const items = records.filter(record => ownsDay(access, data, record)).flatMap(record => (record.breaks as BreakEntry[]).map(entry => ({ ...entry, empId: record.empId, empName: record.empName, date: record.date, recordId: record.id, ...breakMetrics(entry, now()) })));
    res.json({ items: items.slice((+page - 1) * 50, +page * 50), total: items.length, page: +page, pageCount: Math.max(1, Math.ceil(items.length / 50)), serverNow: now() });
  }));
}
