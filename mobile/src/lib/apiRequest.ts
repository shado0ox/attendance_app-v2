import type { Session } from "./types";
/** Scope travels in the query for every authenticated route; profile PATCH accepts only editable fields. */
export function apiRequest(
  origin: string,
  session: Session | null,
  path: string,
  method: string,
  body?: object,
) {
  if (
    !path.startsWith("/api/") ||
    path.includes("://") ||
    path.includes("..") ||
    path.includes("\\")
  )
    throw new Error("Invalid API path");
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Invalid API origin");
  if (session) url.searchParams.set("companyId", session.companyId);
  const profilePatch =
    url.pathname === "/api/employee-profile" && method === "PATCH";
  return {
    url: url.toString(),
    headers: {
      Accept: "application/json",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    ...(method !== "GET"
      ? {
          body: JSON.stringify({
            ...body,
            ...(session && !profilePatch
              ? { companyId: session.companyId }
              : {}),
          }),
        }
      : {}),
  };
}
