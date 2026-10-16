import { test } from "node:test";
import assert from "node:assert/strict";
import { displayDate, shiftMonth, today, validDate } from "../src/lib/dates.ts";
test("dates use Gregorian Riyadh calendar even at UTC midnight boundary", () => {
  assert.equal(today(Date.parse("2026-10-15T22:00:00Z")), "2026-10-16");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.ok(displayDate("2026-10-15").includes("15"));
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
});
