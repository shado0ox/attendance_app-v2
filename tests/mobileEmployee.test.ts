import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mobileEmployeeData,
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
