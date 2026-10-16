import { test } from "node:test";
import assert from "node:assert/strict";
import { apiRequest } from "../src/lib/apiRequest.ts";
const session = {
  id: "e",
  companyId: "company",
  token: "private-token",
  name: "Employee",
};
const origin = "https://attendance.example.com";
test("profile PATCH preserves strict field allowlist while scoping company in the query", () => {
  const result = apiRequest(origin, session, "/api/employee-profile", "PATCH", {
    displayName: "Name",
  });
  assert.equal(new URL(result.url).searchParams.get("companyId"), "company");
  assert.deepEqual(JSON.parse(result.body!), { displayName: "Name" });
});
test("attendance writes derive company scope from session and do not accept another body company", () => {
  const result = apiRequest(
    origin,
    session,
    "/api/attendance?companyId=foreign",
    "POST",
    { checkIn: true, companyId: "foreign" },
  );
  assert.equal(new URL(result.url).searchParams.get("companyId"), "company");
  assert.equal(JSON.parse(result.body!).companyId, "company");
  assert.equal(result.headers.Authorization, "Bearer private-token");
});
test("credential transport cannot point to another origin or use traversal paths", () => {
  for (const path of [
    "https://evil.test/api/",
    "//evil.test/api/",
    "/api/../evil",
    "/api/\\evil",
    "/api/x?url=https://evil.test",
  ])
    assert.throws(() => apiRequest(origin, session, path, "GET"));
  assert.equal(
    apiRequest(origin, null, "/api/auth/employee-login", "POST", {}).headers
      .Authorization,
    undefined,
  );
});

test("a push device address stays out of request URLs and access logs", () => {
  const token = "ExpoPushToken[" + "a".repeat(22) + "]";
  const result = apiRequest(origin, session,
    "/api/mobile/push/status?token=" + encodeURIComponent(token), "GET");
  assert.equal(new URL(result.url).searchParams.has("token"), false);
  assert.equal(result.headers["X-Wafr-Push-Token"], token);
});
