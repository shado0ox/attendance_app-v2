import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { and, eq, sql, getTableColumns, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { mainDataVersion } from '../lib/mainDataVersion';
import { employeePhotoKey } from './employeeSelfService';
import { allIdentities, assertUnique, employeeIdentities, identityLock } from './companyIdentity';
import { backupDirectory } from './systemHealth';
import { openCompanyBackup, preserveCompanyLogin, sealCompanyBackup } from './companyBackupFormat';
const tables = { attendance: schema.attendance, requests: schema.requests, registrationRequests: schema.registrationRequests, electronicDocuments: schema.electronicDocuments, electronicDocumentAudit: schema.electronicDocumentAudit, attendanceMonths: schema.attendanceMonths, auditLog: schema.auditLog };
const mainKey = (companyId: string) => companyId === 'default' ? 'mainData' : 'mainData_' + companyId;
const stateKey = (companyId: string) => 'companyBackupState:' + companyId;
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
export function registerCompanyBackup(app: Express, requireAuth: any) {
  let key: string;
  const encryptionKey = async () => {
    if (process.env.COMPANY_BACKUP_KEY) return process.env.COMPANY_BACKUP_KEY;
    if (!key) {
      await db.insert(schema.systemData).values({ key: 'companyBackupEncryptionKey', value: crypto.randomBytes(32).toString('hex') }).onConflictDoNothing();
      const [row] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, 'companyBackupEncryptionKey')); key = row.value as string;
    }
    return key;
  };
  const folder = (companyId: string) => path.join(backupDirectory(), 'companies', crypto.createHash('sha256').update(companyId).digest('hex'));
  const storedPath = (companyId: string, id: string) => { if (!/^[a-f0-9-]{36}$/.test(id)) fail(400, 'معرف النسخة غير صالح'); return path.join(folder(companyId), id + '.wafr-backup'); };
  const saveFile = async (companyId: string, archive: ReturnType<typeof sealCompanyBackup>) => {
    await fs.mkdir(folder(companyId), { recursive: true, mode: 0o700 });
    const file = storedPath(companyId, archive.header.backupId), temp = file + '.tmp';
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(archive.file); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, file);
    const directory = await fs.open(folder(companyId), 'r'); try { await directory.sync(); } finally { await directory.close(); }
    return { id: archive.header.backupId, createdAt: archive.header.createdAt, bytes: Buffer.byteLength(archive.file) };
  };
  const cleanupFiles = async (companyId: string) => {
    const [state] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, stateKey(companyId)));
    const pinned = (state?.value as any)?.lastRestore?.rollback?.id;
    const names = (await fs.readdir(folder(companyId))).filter(name => /^[a-f0-9-]{36}\.wafr-backup$/.test(name));
    const files = await Promise.all(names.map(async name => ({ name, stat: await fs.stat(path.join(folder(companyId), name)) })));
    files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (const file of files.slice(10)) if (file.name !== pinned + '.wafr-backup') await fs.unlink(path.join(folder(companyId), file.name));
  };
  async function snapshot(companyId: string, tx: any) {
    const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, mainKey(companyId)));
    if (!row) fail(404, 'بيانات الشركة غير موجودة');
    const mainData = structuredClone(row.value as any);
    delete mainData.settings?.password;
    for (const employee of mainData.employees || []) delete employee.webauthnCredentials;
    const records: any = {};
    for (const [name, table] of Object.entries(tables)) records[name] = await tx.select().from(table).where(eq(table.companyId, companyId)).orderBy('id' in table ? (table as any).id : (table as any).key);
    const photos = [];
    for (const employee of mainData.employees || []) {
      const [photo] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, employeePhotoKey(companyId, String(employee.id))));
      if (photo) photos.push({ employeeId: String(employee.id), value: photo.value });
    }
    const [policy] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, 'attendanceBreakPolicy:' + companyId));
    return JSON.parse(JSON.stringify({ schemaVersion: 1, companyId, mainData, tables: records, photos, breakPolicy: policy?.value || null }));
  }
  const validate = (payload: any, companyId: string) => {
    if (new Set(payload.mainData.employees.map((e: any) => String(e.id))).size !== payload.mainData.employees.length || payload.mainData.employees.some((e: any) => !e?.id)) fail(400, 'معرفات الموظفين غير صحيحة');
    for (const name of Object.keys(tables)) {
      if (!Array.isArray(payload.tables[name]) || payload.tables[name].some((row: any) => !row || row.companyId !== companyId)) fail(400, 'سجلات النسخة لا تخص شركتك');
      const ids = payload.tables[name].map((r: any) => name === 'attendanceMonths' ? r.month : r.id);
      if (new Set(ids).size !== ids.length) fail(400, 'سجلات مكررة في النسخة');
    }
    const docs = new Set(payload.tables.electronicDocuments.map((r: any) => r.id));
    if (payload.tables.electronicDocumentAudit.some((r: any) => !docs.has(r.documentId))) fail(400, 'سجل مستند غير مرتبط');
    const employees = new Set(payload.mainData.employees.map((e: any) => String(e.id)));
    if (payload.photos.some((p: any) => !employees.has(p.employeeId))) fail(400, 'صورة موظف خارج النسخة');
  };
  const counts = (payload: any) => ({ employees: payload.mainData.employees.length, departments: payload.mainData.departments.length, photos: payload.photos.length, ...Object.fromEntries(Object.entries(payload.tables).map(([name, rows]: any) => [name, rows.length])) });
  const owner = (auth: any) => JSON.stringify([auth.role, auth.id ?? auth.username ?? 'master']);
  const putState = async (companyId: string, patch: any, tx: any = db) => {
    const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, stateKey(companyId))).for('update');
    const value = { ...(row?.value as any), companyId, ...patch };
    await tx.insert(schema.systemData).values({ key: stateKey(companyId), value }).onConflictDoUpdate({ target: schema.systemData.key, set: { value, updatedAt: new Date() } });
  };
  const audit = async (tx: any, auth: any, action: string, details: any) => tx.insert(schema.auditLog).values({ companyId: auth.companyId, actorId: String(auth.id || auth.username || auth.role), actorRole: auth.role, action, details });
  const wrap = (handler: any) => async (req: any, res: any) => { try { await handler(req, res); } catch (error: any) { if (req.auth?.companyId) await cleanupFiles(req.auth.companyId).catch(() => {}); res.status(error.status || 400).json({ error: error.status ? error.message : error.code === '40001' ? 'تغيرت البيانات أثناء العملية؛ أعد المعاينة والمحاولة' : /النسخة|ملف|حجم|بيانات الشركة/.test(error.message || '') ? error.message : 'تعذر تنفيذ العملية؛ لم يتم تأكيد الاسترجاع' }); } };
  const auth = [requireAuth(['admin', 'superadmin'], false), (req: any, res: any, next: any) => {
    const requested = req.body?.companyId ?? req.query.companyId;
    if (requested !== undefined && String(requested) !== req.auth.companyId) return res.status(403).json({ error: 'النسخة خارج شركتك' }); next();
  }];
  // Register before the global 10 MB parser; archived photos may exceed the normal edit limit.
  app.use('/api/company-backup', express.json({ limit: '65mb' }));
  app.get('/api/company-backup/status', auth, wrap(async (req: any, res: any) => {
    const [row] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, stateKey(req.auth.companyId)));
    res.json({ ...(row?.value as any), companyId: req.auth.companyId, portableAcrossServers: false, maxFileMB: 50 });
  }));
  app.post('/api/company-backup/download', auth, wrap(async (req: any, res: any) => {
    const companyId = req.auth.companyId;
    const data = await db.transaction(tx => snapshot(companyId, tx), { isolationLevel: 'repeatable read', accessMode: 'read only' });
    const archive = sealCompanyBackup(data, await encryptionKey()), stored = await saveFile(companyId, archive);
    await db.transaction(async tx => { await putState(companyId, { lastExport: stored }, tx); await audit(tx, req.auth, 'company.backup.download', { backupId: stored.id, counts: counts(data) }); });
    await cleanupFiles(companyId).catch(() => {});
    res.set('Content-Disposition', `attachment; filename="wafr-company-${new Date().toISOString().slice(0, 10)}.wafr-backup"`).type('application/octet-stream').send(archive.file);
  }));
  app.get('/api/company-backup/rollback/:id', auth, wrap(async (req: any, res: any) => {
    const [row] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, stateKey(req.auth.companyId)));
    if ((row?.value as any)?.lastRestore?.rollback?.id !== req.params.id) fail(404, 'نسخة الرجوع غير موجودة لشركتك');
    const file = await fs.readFile(storedPath(req.auth.companyId, req.params.id));
    res.set('Content-Disposition', 'attachment; filename="wafr-company-before-restore.wafr-backup"').type('application/octet-stream').send(file);
  }));
  app.post('/api/company-backup/preview', auth, wrap(async (req: any, res: any) => {
    const companyId = req.auth.companyId, opened = openCompanyBackup(req.body.file, companyId, await encryptionKey()); validate(opened.payload, companyId);
    const current = await db.transaction(tx => snapshot(companyId, tx), { isolationLevel: 'repeatable read', accessMode: 'read only' });
    await db.delete(schema.systemData).where(sql`${schema.systemData.key} LIKE 'companyBackupPreview:%' AND ((${schema.systemData.value}->>'expiresAt')::bigint < ${Date.now()} OR (${schema.systemData.value}->>'companyId' = ${companyId} AND ${schema.systemData.value}->>'owner' = ${owner(req.auth)}))`);
    const token = crypto.randomBytes(32).toString('hex'), key = 'companyBackupPreview:' + token;
    await db.insert(schema.systemData).values({ key, value: { companyId, owner: owner(req.auth), fileHash: mainDataVersion(req.body.file), currentRevision: mainDataVersion(current), expiresAt: Date.now() + 10 * 60000 } });
    res.json({ token, createdAt: opened.header.createdAt, companyName: opened.payload.mainData.settings?.companyName || companyId, incoming: counts(opened.payload), current: counts(current), replacesData: true });
  }));
  app.post('/api/company-backup/restore', auth, wrap(async (req: any, res: any) => {
    if (req.body.confirm !== 'استرجاع' || typeof req.body.token !== 'string' || !/^[a-f0-9]{64}$/.test(req.body.token)) fail(400, 'معاينة النسخة وتأكيد الاسترجاع مطلوبان');
    const companyId = req.auth.companyId, opened = openCompanyBackup(req.body.file, companyId, await encryptionKey()); validate(opened.payload, companyId);
    const result = await db.transaction(async tx => {
      await identityLock(tx);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'attendance-report:' + companyId}))`);
      // Locks cooperate with existing company data edits; serializable catches competing changes.
      await tx.select().from(schema.systemData).where(eq(schema.systemData.key, mainKey(companyId))).for('update');
      const previewKey = 'companyBackupPreview:' + req.body.token;
      const [row] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, previewKey)).for('update'); const preview = row?.value as any;
      if (!preview || preview.companyId !== companyId || preview.owner !== owner(req.auth) || preview.fileHash !== mainDataVersion(req.body.file) || preview.expiresAt < Date.now()) fail(409, 'المعاينة منتهية أو لا تطابق النسخة؛ أعد المعاينة');
      const current = await snapshot(companyId, tx);
      if (mainDataVersion(current) !== preview.currentRevision) fail(409, 'تغيرت بيانات الشركة منذ المعاينة؛ أعد المعاينة قبل الاسترجاع');
      const rollback = await saveFile(companyId, sealCompanyBackup(current, await encryptionKey()));
      const [main] = await tx.select().from(schema.systemData).where(eq(schema.systemData.key, mainKey(companyId)));
      const restored = preserveCompanyLogin(opened.payload.mainData, main.value);
      await assertUnique(tx, employeeIdentities(companyId, restored.employees), employeeIdentities(companyId, (main.value as any).employees || []));
      // Every DELETE and INSERT is forcibly scoped to the authenticated company.
      for (const [name, table] of Object.entries(tables)) if (name !== 'auditLog') await tx.delete(table).where(eq(table.companyId, companyId));
      const maps: Record<string, Map<number, number>> = {};
      const insertRows = async (name: keyof typeof tables, rows: any[]) => {
        const table = tables[name], columns = getTableColumns(table), mapping = new Map<number, number>(); maps[name] = mapping;
        for (let start = 0; start < rows.length; start += 200) {
          const batch = rows.slice(start, start + 200);
          const values = batch.map(original => {
            const value: any = {};
            for (const [field, column] of Object.entries<any>(columns)) if (field !== 'id' && original[field] !== undefined) value[field] = column.dataType === 'date' && original[field] !== null ? new Date(original[field]) : original[field];
            const remap = (item: any, field = ''): any => {
              if (Array.isArray(item)) return item.map(v => field === 'ids' && typeof v === 'number' ? maps.attendance?.get(v) ?? v : remap(v));
              if (item && typeof item === 'object' && !(item instanceof Date)) return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, ['recordId', 'attendanceId'].includes(k) && typeof v === 'number' ? maps.attendance?.get(v) ?? v : remap(v, k)]));
              return item;
            };
            for (const [field, column] of Object.entries<any>(columns)) if (column.dataType === 'json' && value[field]) value[field] = remap(value[field]);
            value.companyId = companyId;
            if (name === 'attendanceMonths') value.key = companyId + ':' + value.month;
            if (name === 'electronicDocumentAudit') value.documentId = maps.electronicDocuments.get(original.documentId);
            if (name === 'electronicDocuments') { value.parentDocumentId = null; value.shareTokenHash = null; value.shareTokenEncrypted = null; value.shareExpiresAt = null; value.shareUsedAt = null; }
            return value;
          });
          if (!values.length) continue;
          const inserted = await tx.insert(table as any).values(values).returning();
          if (name !== 'attendanceMonths') batch.forEach((row, index) => mapping.set(row.id, inserted[index].id));
        }
      };
      for (const name of ['attendance', 'requests', 'registrationRequests', 'electronicDocuments', 'electronicDocumentAudit', 'attendanceMonths'] as const) await insertRows(name, opened.payload.tables[name]);
      for (const original of opened.payload.tables.electronicDocuments) if (original.parentDocumentId) {
        const parent = maps.electronicDocuments.get(Number(original.parentDocumentId));
        if (parent) await tx.update(schema.electronicDocuments).set({ parentDocumentId: String(parent) }).where(and(eq(schema.electronicDocuments.companyId, companyId), eq(schema.electronicDocuments.id, maps.electronicDocuments.get(original.id)!)));
      }
      const photoKeys = new Set([...current.photos.map((p: any) => employeePhotoKey(companyId, p.employeeId)), ...opened.payload.photos.map((p: any) => employeePhotoKey(companyId, p.employeeId))]);
      if (photoKeys.size) await tx.delete(schema.systemData).where(inArray(schema.systemData.key, [...photoKeys]));
      for (const photo of opened.payload.photos) await tx.insert(schema.systemData).values({ key: employeePhotoKey(companyId, photo.employeeId), value: photo.value });
      if ('breakPolicy' in opened.payload) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'attendanceBreakPolicy:' + companyId}))`);
        await tx.insert(schema.systemData).values({ key: 'attendanceBreakPolicy:' + companyId, value: { companyId, rules: opened.payload.breakPolicy?.rules || [] } }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: { companyId, rules: opened.payload.breakPolicy?.rules || [] }, updatedAt: new Date() } });
      }
      await tx.update(schema.systemData).set({ value: restored, updatedAt: new Date() }).where(eq(schema.systemData.key, mainKey(companyId)));
      // Existing audit history stays append-only. Imported history is grouped with its original IDs.
      const existingAudit = new Set(current.tables.auditLog.map((row: any) => mainDataVersion({ ...row, id: undefined })));
      const importedAudit = opened.payload.tables.auditLog.filter((row: any) => !existingAudit.has(mainDataVersion({ ...row, id: undefined })));
      await insertRows('auditLog', importedAudit);
      await audit(tx, req.auth, 'company.backup.restore', { backupId: opened.header.backupId, rollbackId: rollback.id, counts: counts(opened.payload) });
      await putState(companyId, { lastRestore: { at: new Date().toISOString(), backupId: opened.header.backupId, rollback } }, tx);
      await tx.delete(schema.systemData).where(eq(schema.systemData.key, previewKey));
      return { success: true, rollback, message: 'تم استرجاع بيانات الشركة. أعد تحميل الصفحة قبل إجراء أي تعديل جديد.' };
    }, { isolationLevel: 'serializable' });
    await cleanupFiles(companyId).catch(() => {});
    res.json(result);
  }));
}
