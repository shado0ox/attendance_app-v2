import { employeeApprovalAccess, canReviewEmployeeRequest, approvalRequestView } from "./employeeApprovals";
import type { Express } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { mobileEmployeeData, mobileScheduleRange, mobilePunchPlans } from "../lib/mobileEmployee";
import { isActiveEmployee } from "../lib/employeeLifecycle";
import { employeeWorkState } from "../lib/attendanceBreaks";
export function registerMobileEmployee(
  app: Express,
  requireAuth: any,
  getMain: (company: string) => Promise<any>,
) {
  app.get("/api/mobile/approvals", requireAuth(["employee"], false), async (req: any, res) => {
    const { companyId, id } = req.auth;
    if ((req.query.companyId && req.query.companyId !== companyId)) return res.status(403).json({ error: "الحساب خارج الشركة" });
    res.set("Cache-Control", "no-store");
    try {
      const access = await employeeApprovalAccess(companyId, String(id));
      if (!access) return res.json({ canApproveRequests: false, requests: [], documents: [] });
      const data = await getMain(companyId);
      const requests = await db.select().from(schema.requests).where(and(eq(schema.requests.companyId, companyId), eq(schema.requests.status, 'pending'))).orderBy(desc(schema.requests.id));
      const documents = await db.select({ id: schema.electronicDocuments.id, employeeId: schema.electronicDocuments.employeeId, employeeName: schema.electronicDocuments.employeeName, formData: schema.electronicDocuments.formData, status: schema.electronicDocuments.status }).from(schema.electronicDocuments).where(and(eq(schema.electronicDocuments.companyId, companyId), eq(schema.electronicDocuments.status, 'pending_manager'))).orderBy(desc(schema.electronicDocuments.id));
      const visibleRequests = requests.filter(row => canReviewEmployeeRequest(access, data, String(id), row));
      const visibleDocs = documents.filter(row => canReviewEmployeeRequest(access, data, String(id), { empId: row.employeeId, date: (row.formData as any)?.date }));
      return res.json({ canApproveRequests: true, total: visibleRequests.length + visibleDocs.length,
        requests: visibleRequests.slice(0, 100).map(approvalRequestView),
        documents: visibleDocs.slice(0, 100).map(({ employeeId, ...row }) => row) });
    } catch { return res.status(503).json({ error: "تعذر تحميل طلبات الموافقة" }); }
  });
  app.get(
    "/api/mobile/request-options",
    requireAuth(["employee"], false),
    async (req: any, res) => {
      if (
        req.query.companyId != null &&
        req.query.companyId !== req.auth.companyId
      )
        return res.status(403).json({ error: "الحساب خارج الشركة" });
      try {
        const data = await getMain(req.auth.companyId);
        res.set("Cache-Control", "no-store");
        res.json({
          shifts: (data?.shiftTypes || []).map((s: any) => ({
            id: s.id,
            name: s.name,
          })),
          colleagues: (data?.employees || [])
            .filter(
              (e: any) =>
                String(e.id) !== String(req.auth.id) && isActiveEmployee(e),
            )
            .map((e: any) => ({ id: String(e.id), name: e.name })),
        });
      } catch {
        res.status(503).json({ error: "تعذر تحميل خيارات الطلب" });
      }
    },
  );
  app.get(
    "/api/mobile/employee",
    requireAuth(["employee"], false),
    async (req: any, res) => {
      if (
        req.query.companyId != null &&
        req.query.companyId !== req.auth.companyId
      )
        return res.status(403).json({ error: "الحساب خارج الشركة" });
      const now = Date.now();
      const range = mobileScheduleRange(now), { today, yesterday } = range;
      const from = req.query.from || range.from;
      const to = req.query.to || range.to;
      const validDate = (value: any) =>
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value;
      if (
        !validDate(from) ||
        !validDate(to) ||
        from > to ||
        Date.parse(to) - Date.parse(from) > 93 * 86400000
      )
        return res.status(400).json({ error: "حدد فترة لا تتجاوز 93 يومًا" });
      try {
        const data = mobileEmployeeData(
          await getMain(req.auth.companyId),
          String(req.auth.id),
          from,
          to,
        );
        if (!data) return res.status(404).json({ error: "الموظف غير موجود" });
        const records = await db
          .select()
          .from(schema.attendance)
          .where(
            and(
              eq(schema.attendance.companyId, req.auth.companyId),
              eq(schema.attendance.empId, String(req.auth.id)),
              sql`${schema.attendance.date} BETWEEN ${yesterday} AND ${today}`,
            ),
          )
          .orderBy(desc(schema.attendance.id));
        res.set("Cache-Control", "no-store");
        res.json({
          ...data,
          punchPlans: mobilePunchPlans(data.schedule),
          today,
          serverNow: now,
          records,
          workState: employeeWorkState(records, now),
        });
      } catch {
        res.status(500).json({ error: "تعذر تحميل بوابة الموظف" });
      }
    },
  );
}
