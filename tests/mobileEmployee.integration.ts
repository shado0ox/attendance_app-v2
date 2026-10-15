import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import pg from "pg";
import jwt from "jsonwebtoken";
const origin = "http://127.0.0.1:3011",
  secret = "native-ci-only-secret",
  company = "native-ci";
const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: Number(process.env.SQL_PORT || 5432),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
});
const child = spawn(process.execPath, ["dist/server.cjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    JWT_SECRET: secret,
    BACKUP_ENABLED: "false",
    ATTENDANCE_PUSH_ENABLED: "false",
    NATIVE_PUSH_ENABLED: "true",
    APPLE_TEAM_ID: "ABCDE12345",
    ANDROID_APP_CERT_SHA256: Array(32).fill("AB").join(":"),
  },
  stdio: "inherit",
});
const headers = (id: string, role = "employee", companyId = company) => ({
  "Content-Type": "application/json",
  Authorization: "Bearer " + jwt.sign({ role, companyId, id }, secret),
});
const call = (
  path: string, method = "GET", body?: any, account = headers("e1"),
) => {
  const url = new URL(origin + path);
  const token = url.searchParams.get("token");
  url.searchParams.delete("token");
  return fetch(url, {
    method,
    headers: { ...account, ...(token ? { "X-Wafr-Push-Token": token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
};
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + "/api/health/live")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  const apple = await (
    await fetch(origin + "/.well-known/apple-app-site-association")
  ).json();
  assert.deepEqual(apple.webcredentials.apps, [
    "ABCDE12345.com.xshadox.wafrdawam",
  ]);
  const android = await (
    await fetch(origin + "/.well-known/assetlinks.json")
  ).json();
  assert.ok(
    android.some(
      (entry: any) =>
        entry.target.package_name === "com.xshadox.wafrdawam" &&
        entry.relation.includes("delegate_permission/common.get_login_creds"),
    ),
  );

  await pool.query(
    "INSERT INTO shift_app.companies(id,name,admin_username,admin_password) VALUES($1,$1,$1,$2)",
    [company, "ci-hash"],
  );
  const date = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const data = {
    employees: [
      {
        id: "e1",
        name: "One",
        password: "secret1",
        webauthnCredentials: ["SECRET"],
        status: "active",
      },
      { id: "e2", name: "Two", phone: "PRIVATE", status: "active" },
      { id: "inactive", name: "Inactive", status: "suspended" },
    ],
    departments: [],
    settings: { companyName: "Native", password: "SECRET" },
    schedule: { [date]: { e1: { shiftType: "DRAFT" } } },
    shiftTypes: [{ id: "DRAFT" }],
    _schedulePublication: {
      schedule: {
        [date]: { e1: { shiftType: "OFF" }, e2: { shiftType: "S" } },
      },
      shiftTypes: [
        { id: "OFF", name: "Rest" },
        { id: "S", name: "Other shift" },
      ],
    },
  };
  await pool.query(
    "INSERT INTO shift_app.system_data(key,value) VALUES ($1,$2)",
    ["mainData_" + company, JSON.stringify(data)],
  );
  await pool.query(
    "INSERT INTO shift_app.attendance(company_id,emp_id,emp_name,date,check_in,check_in_ts) VALUES($1,$2,$3,$4,$5,$6),($1,$7,$8,$4,$5,$6)",
    [company, "e1", "One", date, "08:00", String(Date.now()), "e2", "Two"],
  );
  const response = await call("/api/mobile/employee");
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.employee.id, "e1");
  assert.equal(value.records.length, 1);
  assert.equal(value.records[0].empId, "e1");
  assert.equal(value.schedule[0].shiftType, "OFF");
  assert.equal(value.workState.workStatus, "working");
  assert.ok(
    !/SECRET|secret1|PRIVATE|DRAFT|Other shift/.test(JSON.stringify(value)),
  );
  assert.equal(
    (await call("/api/mobile/employee?companyId=default")).status,
    403,
  );
  assert.equal(
    (await call("/api/mobile/employee?from=2026-02-30&to=2026-03-01")).status,
    400,
  );
  assert.equal(
    (await call("/api/mobile/employee?from=2025-01-01&to=2026-12-01")).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/mobile/employee",
        "GET",
        undefined,
        headers("e1", "admin"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/mobile/employee", "GET", undefined, headers("inactive")))
      .status,
    403,
  );
  assert.equal((await fetch(origin + "/api/mobile/employee")).status, 401);
  const opts = await (await call("/api/mobile/request-options")).json();
  assert.deepEqual(opts.colleagues, [{ id: "e2", name: "Two" }]);
  const token = "ExpoPushToken[" + "a".repeat(22) + "]";
  const subscription = { token, attendance: true, departure: false };
  assert.equal(
    (
      await call("/api/mobile/push/subscription", "POST", {
        ...subscription,
        token: "https://evil.test",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/mobile/push/subscription", "POST", {
        ...subscription,
        companyId: "default",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/mobile/push/subscription", "POST", subscription)).status,
    200,
  );
  const statusPath =
    "/api/mobile/push/status?token=" + encodeURIComponent(token);
  assert.equal((await (await call(statusPath)).json()).registered, true);
  assert.equal(
    (await (await call(statusPath, "GET", undefined, headers("e2"))).json())
      .registered,
    false,
  );
  assert.equal(
    (
      await call(
        "/api/mobile/push/subscription",
        "DELETE",
        { token },
        headers("e2"),
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await call(statusPath)).json()).registered,
    true,
    "another employee cannot delete device",
  );
  assert.equal(
    (
      await call(
        "/api/mobile/push/subscription",
        "POST",
        subscription,
        headers("e2"),
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await call(statusPath)).json()).registered,
    false,
    "account switch rebinds device",
  );
  assert.equal(
    (await (await call(statusPath, "GET", undefined, headers("e2"))).json())
      .registered,
    true,
  );
  assert.equal(
    (
      await call(
        "/api/mobile/push/subscription",
        "DELETE",
        { token },
        headers("e2"),
      )
    ).status,
    200,
  );
  console.log(
    "PASS: native employee projection, tenant and role isolation, published schedule, scoped push registration, account switch and revocation.",
  );
} finally {
  child.kill("SIGTERM");
  await pool.query(
    "DELETE FROM shift_app.system_data WHERE key=$1 OR key LIKE 'attendanceNativePush:%' AND value->>'companyId'=$2",
    ["mainData_" + company, company],
  );
  await pool.query("DELETE FROM shift_app.attendance WHERE company_id=$1", [
    company,
  ]);
  await pool.query("DELETE FROM shift_app.companies WHERE id=$1", [company]);
  await pool.end();
}
