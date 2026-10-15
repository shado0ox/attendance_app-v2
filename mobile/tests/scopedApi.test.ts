import { test } from "node:test";
import assert from "node:assert/strict";
import { scopedApi } from "../src/lib/scopedApi.ts";
import { ApiError } from "../src/lib/apiError.ts";
import type { Session } from "../src/lib/types.ts";

const a: Session = { id: "a", companyId: "one", name: "A", token: "token-A" };
const b: Session = { id: "b", companyId: "two", name: "B", token: "token-B" };

test("a pending GPS/passkey operation cannot punch as a newly logged-in employee", async () => {
  let current: Session | null = a, calls = 0;
  const api = scopedApi(a, () => current, async <T>(used: Session) => {
    calls++; assert.equal(used.token, a.token); return {} as T;
  }, async () => {});
  await api("/api/attendance-passkey/options", "POST", { field: "checkIn" });
  current = b;
  await assert.rejects(api("/api/attendance", "POST", { checkIn: true }),
    (error: unknown) => error instanceof ApiError && error.status === 409);
  assert.equal(calls, 1, "the stale operation never reaches transport");
});

test("a late 401 from an old account cannot expire the current session", async () => {
  let current: Session | null = a, fail!: (error: Error) => void, expired = 0;
  const api = scopedApi(a, () => current,
    <T>() => new Promise<T>((_, reject) => { fail = reject; }),
    async () => { expired++; });
  const pending = api("/api/mobile/employee");
  current = b; fail(new ApiError("expired", 401));
  await assert.rejects(pending);
  assert.equal(expired, 0);
  assert.equal(current.token, b.token);
});

test("old data is discarded after switching accounts; the current account expires on its own 401", async () => {
  let current: Session | null = a, resolve!: (value: unknown) => void, expired = 0;
  const old = scopedApi(a, () => current,
    <T>() => new Promise<T>(done => { resolve = done as (value: unknown) => void; }),
    async () => { expired++; });
  const pending = old("/api/mobile/employee");
  current = b; resolve({ privateEmployee: "A" });
  await assert.rejects(pending,
    (error: unknown) => error instanceof ApiError && error.status === 409);
  const active = scopedApi(b, () => current,
    async () => { throw new ApiError("expired", 401); },
    async token => { assert.equal(token, b.token); expired++; current = null; });
  await assert.rejects(active("/api/mobile/employee"));
  assert.equal(expired, 1);
  assert.equal(current, null);
});
