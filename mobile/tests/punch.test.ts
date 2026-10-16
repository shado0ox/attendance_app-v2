import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPunch } from "../src/lib/punch.ts";
import type { Attendance } from "../src/lib/types.ts";
const now = Date.parse("2026-10-15T09:00:00+03:00");
const row: Attendance = {
  id: 1,
  date: "2026-10-15",
  checkIn: "08:00",
  checkOut: null,
  checkIn2: null,
  checkOut2: null,
  checkInTs: String(now - 3600000),
  breaks: [],
};
test("punch actions cover single and double shifts without duplicate check-in", () => {
  assert.equal(nextPunch([], row.date, false, now)?.field, "checkIn");
  assert.equal(nextPunch([row], row.date, false, now)?.field, "checkOut");
  assert.equal(
    nextPunch([{ ...row, checkOut: "09:00" }], row.date, false, now),
    null,
  );
  assert.equal(
    nextPunch([{ ...row, checkOut: "09:00" }], row.date, true, now)?.field,
    "checkIn2",
  );
  assert.equal(
    nextPunch(
      [{ ...row, checkOut: "09:00", checkIn2: "10:00" }],
      row.date,
      true,
      now,
    )?.field,
    "checkOut2",
  );
});
test("overnight period uses the original record; stale open period cannot create a new punch", () => {
  const yesterday = { ...row, date: "2026-10-14" };
  assert.equal(nextPunch([yesterday], row.date, false, now)?.record?.id, 1);
  assert.equal(
    nextPunch(
      [{ ...yesterday, checkInTs: String(now - 25 * 3600000) }],
      row.date,
      false,
      now,
    ),
    null,
  );
});

test("an overnight second period keeps yesterday's record instead of creating today's first punch", () => {
  const at = Date.parse("2026-10-01T01:00:00+03:00");
  const original = { ...row, date: "2026-09-30", checkIn: "17:00", checkOut: "22:00", checkInTs: String(Date.parse("2026-09-30T17:00:00+03:00")) };
  const plans = [{ date: original.date, period: 2, start: Date.parse("2026-10-01T00:00:00+03:00"), end: Date.parse("2026-10-01T05:00:00+03:00") }];
  const action = nextPunch([original], "2026-10-01", false, at, plans);
  assert.equal(action?.field, "checkIn2");
  assert.equal(action?.record?.date, "2026-09-30");
  assert.equal(action?.record?.id, original.id);
  assert.equal(nextPunch([original], "2026-10-01", false, plans[0].end, plans)?.field, "checkIn");
});
test("an expired original record cannot accept an overnight second-period punch", () => {
  const at = Date.parse("2026-10-01T01:00:00+03:00");
  const original = { ...row, date: "2026-09-30", checkOut: "22:00", checkInTs: String(at - 25 * 3600000) };
  const plans = [{ date: original.date, period: 2, start: at - 3600000, end: at + 3600000 }];
  assert.equal(nextPunch([original], "2026-10-01", false, at, plans), null);
});
