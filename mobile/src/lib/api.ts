import { apiRequest } from "./apiRequest";
import Constants from "expo-constants";
import type { Session } from "./types";
import { ApiError } from "./apiError";
export { ApiError };
const configured =
  Constants.expoConfig?.extra?.apiUrl || "https://attendance.xshadox.com";
const parsed = new URL(configured);
if (
  parsed.protocol !== "https:" ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash ||
  parsed.pathname !== "/"
)
  throw new Error("API URL must be an HTTPS origin");
export const API_ORIGIN = parsed.origin;
export async function request<T>(
  session: Session | null,
  path: string,
  method = "GET",
  body?: object,
  signal?: AbortSignal,
): Promise<T> {
  const init = apiRequest(API_ORIGIN, session, path, method, body);
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(init.url, {
      ...init,
      method,
      redirect: "error",
      signal: controller.signal,
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        value?.error || `تعذر تنفيذ الطلب (${response.status})`,
        response.status,
      );
    if (value === null) throw new Error("رد السيرفر غير صالح؛ حدّث النظام");
    return value as T;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      !signal?.aborted
    )
      throw new Error("انتهت مهلة الاتصال. حدّث الحالة قبل إعادة التسجيل.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
