import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueNativeReminders,
  validNativeToken,
} from "../src/lib/nativeReminders";
const data = {
  employees: [{ id: "e", name: "Employee", status: "active" }],
  schedule: { "2026-10-15": { e: { shiftType: "S" } } },
  shiftTypes: [{ id: "S", name: "Morning", start: "08:00", end: "16:00" }],
};
const time = (clock: string) => Date.parse("2026-10-15T" + clock + ":00+03:00");
test("native reminders stop on saved punches and after sixty minutes", () => {
  assert.equal(dueNativeReminders(data, "e", [], [], time("08:00")).length, 1);
  assert.equal(dueNativeReminders(data, "e", [], [], time("08:59")).length, 1);
  assert.equal(dueNativeReminders(data, "e", [], [], time("09:00")).length, 0);
  const records = [{ empId: "e", date: "2026-10-15", checkIn: "08:00" }];
  assert.equal(
    dueNativeReminders(data, "e", records, [], time("08:10")).length,
    0,
  );
  assert.equal(
    dueNativeReminders(data, "e", records, [], time("16:00"))[0]?.kind,
    "departure",
  );
  assert.equal(
    dueNativeReminders(data, "e", records, [], time("17:00")).length,
    0,
  );
  assert.equal(
    dueNativeReminders(
      data,
      "e",
      [{ ...records[0], checkOut: "16:00" }],
      [],
      time("16:01"),
    ).length,
    0,
  );
  assert.equal(
    dueNativeReminders(data, "other", records, [], time("16:00")).length,
    0,
  );
  assert.equal(
    dueNativeReminders(
      data,
      "e",
      [],
      [{ empId: "e", date: "2026-10-15", status: "approved" }],
      time("08:00"),
    ).length,
    0,
  );
});
test("push token rejects arbitrary URLs and unbounded or malformed payloads", () => {
  assert.ok(validNativeToken("ExpoPushToken[" + "a".repeat(22) + "]"));
  for (const value of [
    "https://evil.test",
    "ExpoPushToken[a]",
    null,
    "ExpoPushToken[" + "x".repeat(201) + "]",
  ])
    assert.ok(!validNativeToken(value));
});
