import crypto from "node:crypto";
import type { Express } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { dueNativeReminders, validNativeToken } from "../lib/nativeReminders";
const PREFIX = "attendanceNativePush:";
const keyFor = (token: string) =>
  PREFIX + crypto.createHash("sha256").update(token).digest("hex");
type Stored = {
  companyId: string;
  employeeId: string;
  token: string;
  attendance: boolean;
  departure: boolean;
  sent: string[];
  expiresAt: number;
  tickets: string[];
};
const enabled = () => process.env.NATIVE_PUSH_ENABLED === "true";
async function expoRequest(endpoint: "send" | "getReceipts", body: object) {
  const response = await fetch(`https://exp.host/--/api/v2/push/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Expo transport unavailable");
  const value = (await response.json()) as any;
  if (value.errors?.length || !value.data)
    throw new Error("Expo rejected request");
  return value.data;
}
export function registerNativePush(
  app: Express,
  requireAuth: any,
  getMain: any,
  companyActive: (company: string) => Promise<boolean>,
) {
  const auth = [
    requireAuth(["employee"], false),
    (req: any, res: any, next: any) => {
      const company = req.query.companyId ?? req.body?.companyId;
      if (company != null && company !== req.auth.companyId)
        return res.status(403).json({ error: "الاشتراك خارج الشركة" });
      next();
    },
  ];
  const owner = (account: any) =>
    sql`${schema.systemData.value}->>'companyId' = ${account.companyId} AND ${schema.systemData.value}->>'employeeId' = ${String(account.id)}`;
  app.get("/api/mobile/push/status", auth, async (req: any, res) => {
    res.set("Cache-Control", "no-store");
    const token = req.get("X-Wafr-Push-Token");
    try {
      const [row] = validNativeToken(token)
        ? await db
            .select()
            .from(schema.systemData)
            .where(
              and(eq(schema.systemData.key, keyFor(token)), owner(req.auth)),
            )
        : [];
      const value = row?.value as Stored | undefined;
      res.json({
        configured: enabled(),
        registered: !!value && value.expiresAt > Date.now(),
        attendance: value?.attendance ?? true,
        departure: value?.departure ?? true,
      });
    } catch {
      res.status(503).json({ error: "تعذر قراءة حالة الإشعارات" });
    }
  });
  app.post("/api/mobile/push/subscription", auth, async (req: any, res) => {
    if (!enabled())
      return res
        .status(503)
        .json({ error: "إشعارات الجوال لم تُجهز على السيرفر بعد" });
    const { token, attendance, departure } = req.body;
    if (
      !validNativeToken(token) ||
      typeof attendance !== "boolean" ||
      typeof departure !== "boolean"
    )
      return res.status(400).json({ error: "اشتراك غير صالح" });
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${PREFIX + req.auth.companyId + ":" + req.auth.id}))`,
        );
        const rows = await tx
          .select()
          .from(schema.systemData)
          .where(
            sql`${schema.systemData.key} LIKE ${PREFIX + "%"} AND ${owner(req.auth)}`,
          );
        const key = keyFor(token);
        if (
          rows.filter(
            (row) =>
              row.key !== key && (row.value as Stored).expiresAt > Date.now(),
          ).length >= 5
        )
          throw new Error("device_limit");
        const [previous] = await tx
          .select()
          .from(schema.systemData)
          .where(eq(schema.systemData.key, key))
          .for("update");
        const before = previous?.value as Stored | undefined,
          same =
            before?.companyId === req.auth.companyId &&
            before?.employeeId === String(req.auth.id);
        const value: Stored = {
          companyId: req.auth.companyId,
          employeeId: String(req.auth.id),
          token,
          attendance,
          departure,
          sent: same ? before.sent || [] : [],
          tickets: same ? before.tickets || [] : [],
          expiresAt: Date.now() + 30 * 86400000,
        };
        await tx
          .insert(schema.systemData)
          .values({ key, value })
          .onConflictDoUpdate({
            target: schema.systemData.key,
            set: { value, updatedAt: new Date() },
          });
      });
      res.json({ registered: true });
    } catch (error: any) {
      res
        .status(error.message === "device_limit" ? 409 : 503)
        .json({
          error:
            error.message === "device_limit"
              ? "الحد الأقصى خمسة أجهزة للحساب"
              : "تعذر حفظ اشتراك الجوال",
        });
    }
  });
  app.delete("/api/mobile/push/subscription", auth, async (req: any, res) => {
    if (!validNativeToken(req.body.token))
      return res.status(400).json({ error: "اشتراك غير صالح" });
    try {
      await db
        .delete(schema.systemData)
        .where(
          and(
            eq(schema.systemData.key, keyFor(req.body.token)),
            owner(req.auth),
          ),
        );
      res.json({ registered: false });
    } catch {
      res.status(503).json({ error: "تعذر إيقاف إشعارات الجهاز" });
    }
  });
  let running = false;
  const run = async () => {
    if (!enabled() || running) return;
    running = true;
    try {
      await db
        .delete(schema.systemData)
        .where(
          sql`${schema.systemData.key} LIKE ${PREFIX + "%"} AND (${schema.systemData.value}->>'expiresAt')::bigint <= ${Date.now()}`,
        );
      const rows = await db
        .select()
        .from(schema.systemData)
        .where(sql`${schema.systemData.key} LIKE ${PREFIX + "%"}`);
      for (const row of rows) {
        const stored = row.value as Stored;
        if (
          !validNativeToken(stored.token) ||
          !(await companyActive(stored.companyId))
        )
          continue;
        try {
          if (stored.tickets?.length) {
            const receipts = await expoRequest("getReceipts", {
              ids: stored.tickets,
            });
            if (
              Object.values(receipts).some(
                (r: any) => r.details?.error === "DeviceNotRegistered",
              )
            ) {
              await db
                .delete(schema.systemData)
                .where(
                  and(
                    eq(schema.systemData.key, row.key),
                    owner({
                      companyId: stored.companyId,
                      id: stored.employeeId,
                    }),
                  ),
                );
              continue;
            }
            const tickets = stored.tickets.filter((id) => !receipts[id]);
            await db.transaction(async (tx) => {
              const [fresh] = await tx
                .select()
                .from(schema.systemData)
                .where(eq(schema.systemData.key, row.key))
                .for("update");
              const value = fresh?.value as Stored;
              if (
                value?.employeeId === stored.employeeId &&
                value.companyId === stored.companyId
              )
                await tx
                  .update(schema.systemData)
                  .set({ value: { ...value, tickets } })
                  .where(eq(schema.systemData.key, row.key));
            });
          }
          const now = Date.now(),
            to = new Date(now + 3 * 3600000).toISOString().slice(0, 10),
            from = new Date(now + 3 * 3600000 - 2 * 86400000)
              .toISOString()
              .slice(0, 10);
          const [data, records, leaves, docs] = await Promise.all([
            getMain(stored.companyId),
            db
              .select()
              .from(schema.attendance)
              .where(
                and(
                  eq(schema.attendance.companyId, stored.companyId),
                  eq(schema.attendance.empId, stored.employeeId),
                  sql`${schema.attendance.date} BETWEEN ${from} AND ${to}`,
                ),
              ),
            db
              .select()
              .from(schema.requests)
              .where(
                and(
                  eq(schema.requests.companyId, stored.companyId),
                  eq(schema.requests.empId, stored.employeeId),
                  eq(schema.requests.type, "leave"),
                  eq(schema.requests.status, "approved"),
                ),
              ),
            db
              .select()
              .from(schema.electronicDocuments)
              .where(
                and(
                  eq(schema.electronicDocuments.companyId, stored.companyId),
                  eq(schema.electronicDocuments.employeeId, stored.employeeId),
                  eq(schema.electronicDocuments.status, "approved"),
                ),
              ),
          ]);
          const absent = [
            from,
            new Date(Date.parse(from) + 86400000).toISOString().slice(0, 10),
            to,
          ]
            .filter((date) =>
              docs.some((doc) => {
                const form = doc.formData as any;
                return (
                  form?.requestType === "absence" &&
                  date >= form.absenceFrom &&
                  date <= form.absenceTo
                );
              }),
            )
            .map((date) => ({
              empId: stored.employeeId,
              date,
              status: "approved",
            }));
          for (const reminder of dueNativeReminders(
            data,
            stored.employeeId,
            records,
            [...leaves, ...absent],
            now,
          )) {
            const claimed = await db.transaction(async (tx) => {
              const [fresh] = await tx
                .select()
                .from(schema.systemData)
                .where(eq(schema.systemData.key, row.key))
                .for("update");
              const value = fresh?.value as Stored;
              if (
                !value ||
                value.companyId !== stored.companyId ||
                value.employeeId !== stored.employeeId ||
                !value[reminder.kind] ||
                value.expiresAt <= Date.now() ||
                value.sent.includes(reminder.key) ||
                Date.now() >= reminder.expiresAt
              )
                return false;
              const latest = await tx
                .select()
                .from(schema.attendance)
                .where(
                  and(
                    eq(schema.attendance.companyId, stored.companyId),
                    eq(schema.attendance.empId, stored.employeeId),
                    eq(schema.attendance.date, reminder.date),
                  ),
                );
              const field =
                reminder.kind === "attendance"
                  ? reminder.period === 1
                    ? "checkIn"
                    : "checkIn2"
                  : reminder.period === 1
                    ? "checkOut"
                    : "checkOut2";
              if (latest.some((record) => record[field])) return false;
              await tx
                .update(schema.systemData)
                .set({
                  value: {
                    ...value,
                    sent: [...value.sent, reminder.key].slice(-48),
                  },
                })
                .where(eq(schema.systemData.key, row.key));
              return true;
            });
            if (!claimed) continue;
            const ticket = await expoRequest("send", {
              to: stored.token,
              title:
                reminder.kind === "attendance"
                  ? "لم تسجل حضورك"
                  : "تذكير بتسجيل الانصراف",
              body: "افتح وفر دوام لمراجعة دوامك وتسجيل البصمة.",
              sound: "default",
              channelId: "attendance",
              ttl: 60,
              data: { screen: "home" },
            });
            if (ticket.details?.error === "DeviceNotRegistered") {
              await db
                .delete(schema.systemData)
                .where(
                  and(
                    eq(schema.systemData.key, row.key),
                    owner({
                      companyId: stored.companyId,
                      id: stored.employeeId,
                    }),
                  ),
                );
              break;
            }
            if (ticket.status === "error")
              throw new Error("Expo rejected push ticket");
            if (ticket.id)
              await db.transaction(async (tx) => {
                const [fresh] = await tx
                  .select()
                  .from(schema.systemData)
                  .where(eq(schema.systemData.key, row.key))
                  .for("update");
                const value = fresh?.value as Stored;
                if (
                  value?.companyId === stored.companyId &&
                  value.employeeId === stored.employeeId
                )
                  await tx
                    .update(schema.systemData)
                    .set({
                      value: {
                        ...value,
                        tickets: [...(value.tickets || []), ticket.id].slice(
                          -100,
                        ),
                      },
                    })
                    .where(eq(schema.systemData.key, row.key));
              });
          }
        } catch {
          console.warn("Native reminder device transport unavailable");
        }
      }
    } catch {
      console.warn("Native reminder worker unavailable");
    } finally {
      running = false;
    }
  };
  return {
    run,
    start: () => {
      if (!enabled()) return;
      const timer = setInterval(() => {
        void run();
      }, 60000);
      timer.unref();
      void run();
    },
  };
}
