import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mobileEmployeeData,
  mobileScheduleRange,
  mobilePunchPlans,
  webauthnExpectedOrigins,
} from "../src/lib/mobileEmployee";
test("native bootstrap exposes own published schedule without credentials, drafts or colleague data", () => {
  const data = {
    employees: [
      {
        id: "a",
        name: "A",
        password: "SECRET",
        webauthnCredentials: ["SECRET"],
        phone: "secret",
      },
      { id: "b", name: "B" },
    ],
    settings: { password: "SECRET", companyName: "Company" },
    schedule: { "2026-10-15": { a: { shiftType: "draft" } } },
    _schedulePublication: {
      schedule: {
        "2026-10-15": { a: { shiftType: "S" }, b: { shiftType: "E" } },
        "2026-09-01": { a: { shiftType: "S" } },
      },
      shiftTypes: [
        { id: "S", name: "Morning" },
        { id: "E", name: "Evening" },
      ],
    },
  };
  const result = mobileEmployeeData(data, "a", "2026-10-01", "2026-10-31")!;
  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0].shiftType, "S");
  for (const forbidden of [
    "SECRET",
    "Evening",
    "draft",
    "phone",
    "password",
    "webauthnCredentials",
  ])
    assert.ok(!JSON.stringify(result).includes(forbidden));
  assert.equal(
    mobileEmployeeData(data, "unknown", "2026-10-01", "2026-10-31"),
    null,
  );
});
test("native passkey origins require exact certificate hashes and retain the HTTPS origin", () => {
  const origin = "android:apk-key-hash:" + "a".repeat(43);
  assert.deepEqual(
    webauthnExpectedOrigins("https://example.com", `${origin},${origin}`),
    ["https://example.com", origin],
  );
  assert.deepEqual(webauthnExpectedOrigins("https://example.com"), [
    "https://example.com",
  ]);
  for (const invalid of [
    "*",
    "https://evil.test",
    "android:apk-key-hash:short",
  ])
    assert.throws(() =>
      webauthnExpectedOrigins("https://example.com", invalid),
    );
});

test("mobile bootstrap retains the previous schedule day across Riyadh month and year boundaries", () => {
  const october = mobileScheduleRange(Date.parse("2026-09-30T22:00:00Z"));
  assert.equal(october.today, "2026-10-01");
  assert.equal(october.from, "2026-09-30");
  assert.equal(october.yesterday, "2026-09-30");
  const january = mobileScheduleRange(Date.parse("2025-12-31T22:00:00Z"));
  assert.equal(january.today, "2026-01-01");
  assert.equal(january.from, "2025-12-31");
});
test("native punch plans use published server period windows for overnight double shifts", () => {
  const plans = mobilePunchPlans([{ date: "2026-09-30", shiftType: "N", shift: { id: "N", type: "double", start: "17:00", end: "22:00", start2: "00:00", end2: "05:00" } }]);
  assert.equal(plans.length, 2);
  assert.equal(plans[1].date, "2026-09-30");
  assert.equal(plans[1].period, 2);
  assert.equal(plans[1].start, Date.parse("2026-10-01T00:00:00+03:00"));
  assert.equal(plans[1].end, Date.parse("2026-10-01T05:00:00+03:00"));
  assert.deepEqual(mobilePunchPlans([{ date: "2026-09-30", shiftType: "OFF", shift: null }]), []);
});
