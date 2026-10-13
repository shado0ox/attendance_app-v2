import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { emptyAppStoreLinks, parseAppStoreLinks } from '../lib/appInstallation';
export function registerAppInstallation(app: Express, requireAuth: any) {
  const key = 'appInstallation';
  app.get('/api/app-installation', async (_req, res) => {
    try { const [row] = await db.select().from(schema.systemData).where(eq(schema.systemData.key, key)); res.json(row ? parseAppStoreLinks(row.value) : emptyAppStoreLinks()); }
    catch { res.status(503).json({ error: 'تعذر تحميل روابط التطبيق' }); }
  });
  app.post('/api/app-installation', requireAuth(['superadmin'], false), async (req, res) => {
    try {
      const links = parseAppStoreLinks(req.body), auth = (req as any).auth;
      if (auth.companyId !== 'default') return res.status(403).json({ error: 'روابط التطبيق خاصة بمسؤول المنصة' });
      await db.transaction(async tx => {
        await tx.insert(schema.systemData).values({ key, value: links }).onConflictDoUpdate({ target: schema.systemData.key, set: { value: links, updatedAt: new Date() } });
        await tx.insert(schema.auditLog).values({ companyId: 'default', actorId: String(auth.username || auth.role), actorRole: auth.role, action: 'app.installation.links', details: links });
      });
      res.json(links);
    } catch (error: any) { res.status(400).json({ error: error.message?.includes('رابط') || error.message?.includes('المتاجر') ? error.message : 'تعذر حفظ روابط المتاجر' }); }
  });
}
