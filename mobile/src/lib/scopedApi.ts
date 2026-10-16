import { ApiError } from "./apiError.ts";
import type { Session } from "./types";
type Transport = <T>(
  session: Session, path: string, method?: string, body?: object, signal?: AbortSignal
) => Promise<T>;

/** Keep an operation bound to the account that started it, including after GPS/passkey awaits. */
export function scopedApi(
  captured: Session | null,
  current: () => Session | null,
  transport: Transport,
  expired: (token: string) => Promise<void>,
) {
  return async function api<T>(path: string, method?: string, body?: object, signal?: AbortSignal): Promise<T> {
    if (!captured) throw new ApiError("سجل الدخول أولًا", 401);
    const assertCurrent = () => {
      if (current()?.token !== captured.token)
        throw new ApiError("تغير الحساب أثناء العملية؛ افتح العملية من حسابك الحالي وأعد المحاولة", 409);
    };
    assertCurrent();
    try {
      const result = await transport<T>(captured, path, method, body, signal);
      assertCurrent();
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && current()?.token === captured.token)
        await expired(captured.token);
      throw error;
    }
  };
}
