import { stopArrivalReminders } from "./backgroundLocation";
import { scopedApi } from "./scopedApi";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { AppState } from "react-native";
import { request, ApiError } from "./api";
import type { Session } from "./types";
import { sessionVault } from './sessionVault';
const biometricOptions = { requireAuthentication: true, authenticationPrompt: 'افتح حسابك في وفر دوام ببصمة جهازك', keychainService: 'wafr.employee.biometric', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const vault = sessionVault({
  get: (key, biometric) => SecureStore.getItemAsync(key, biometric ? biometricOptions : undefined),
  set: (key, value, biometric) => SecureStore.setItemAsync(key, value, biometric ? biometricOptions : { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key, key === 'wafr.native.session.biometric.v1' ? { keychainService: biometricOptions.keychainService } : undefined),
});
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(
          error instanceof ApiError && [401, 403, 404].includes(error.status)
        ) && count < 1,
      staleTime: 30000,
    },
    mutations: { retry: false },
  },
});
type Context = {
  session: Session | null;
  ready: boolean;
  storageError: string;
  locked: boolean;
  biometricEnabled: boolean;
  isCurrentAccount: (scope: string) => boolean;
  unlock: () => Promise<void>;
  setBiometric: (enabled: boolean) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  api: <T>(
    path: string,
    method?: string,
    body?: object,
    signal?: AbortSignal,
  ) => Promise<T>;
  refresh: () => Promise<void>;
};
const SessionContext = createContext<Context | null>(null);
export function SessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState("");
  const [locked, setLocked] = useState(false), [biometricEnabled, setBiometricEnabled] = useState(false);
  const biometricRef = useRef(false), authEpoch = useRef(0);
  const current = useRef<Session | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const enabled = await vault.enabled();
      if (!live) return;
      biometricRef.current = enabled;
      setBiometricEnabled(enabled);
      if (enabled) { setLocked(true); return; }
      const saved = await vault.restore();
      if (live && saved) { current.current = saved; setSession(saved); }
    })()
      .catch(() => {
        if (live)
          setStorageError("تعذر استعادة الجلسة الآمنة؛ سجل الدخول من جديد");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const transition = useCallback(
    (expectedToken: string | null, next: Session | null, clearPush = false) => {
      const job = storageQueue.current.then(async () => {
        if ((current.current?.token || null) !== expectedToken) return false;
        // Serialize writes: an old logout must not erase a newer account's credential.
        await queryClient.cancelQueries();
        queryClient.clear();
        if (!next || current.current?.id !== next.id || current.current?.companyId !== next.companyId) {
          try { await stopArrivalReminders(); } catch { /* Cache deletion is attempted first; it must not prevent credential deletion. */ }
        }
        if (clearPush) {
          try { await SecureStore.deleteItemAsync("wafr.native.push.v1"); }
          catch { /* Device metadata must not block deletion of the login credential. */ }
        }
        if (next && biometricRef.current && !current.current) {
          await vault.disable(next);
          biometricRef.current = false;
          setBiometricEnabled(false);
        } else if (next) await vault.save(next, biometricRef.current);
        else {
          await vault.clear();
          biometricRef.current = false;
          setBiometricEnabled(false);
        }
        authEpoch.current++;
        setLocked(false);
        current.current = next;
        setSession(next);
        if (next) setStorageError("");
        return true;
      });
      storageQueue.current = job.then(() => undefined, () => undefined);
      return job;
    },
    [],
  );
  const unlock = async () => {
    const epoch = authEpoch.current;
    let saved: Session | null;
    try { saved = await vault.unlock(); }
    catch { throw new Error('لم يتم فتح الحساب. أعد المحاولة بالبصمة أو سجل الدخول بكلمة المرور.'); }
    if (!saved) throw new Error('بصمة الجهاز تغيّرت أو الجلسة غير متاحة. سجل الدخول بكلمة المرور من جديد.');
    if (epoch !== authEpoch.current) return;
    current.current = saved;
    setSession(saved);
    setLocked(false);
    setStorageError('');
  };
  const setBiometric = async (enabled: boolean) => {
    const used = current.current;
    if (!used) throw new Error('سجل الدخول أولًا');
    const job = storageQueue.current.then(async () => {
      if (current.current?.token !== used.token) throw new Error('تغير الحساب؛ أعد المحاولة');
      if (enabled) {
        if (!SecureStore.canUseBiometricAuthentication()) throw new Error('فعّل Face ID أو بصمة الإصبع وقفل الشاشة من إعدادات الهاتف أولًا');
        await vault.enable(used);
      } else {
        const verified = await vault.unlock();
        if (verified?.token !== used.token) throw new Error('تعذر تأكيد بصمتك لإيقاف حماية الدخول');
        await vault.disable(used);
      }
      biometricRef.current = enabled;
      setBiometricEnabled(enabled);
      if (enabled && AppState.currentState === 'background') {
        authEpoch.current++;
        current.current = null;
        setSession(null);
        setLocked(true);
        void queryClient.cancelQueries();
        queryClient.clear();
      }
    });
    storageQueue.current = job.then(() => undefined, () => undefined);
    await job;
  };
  const sessionGeneration = authEpoch.current;
  const api = useCallback(
    <T,>(path: string, method?: string, body?: object, signal?: AbortSignal): Promise<T> =>
      scopedApi(session, () => current.current, request, async (token) => {
        await transition(token, null);
      }, { captured: sessionGeneration, current: () => authEpoch.current })<T>(path, method, body, signal),
    [session, transition, sessionGeneration],
  );
  const logout = useCallback(async () => {
    const used = session;
    if (!used) return;
    if (current.current?.token !== used.token)
      throw new ApiError("تغير الحساب؛ أعد المحاولة من حسابك الحالي", 409);
    let token: string | null = null, revokeFailed = false;
    try { token = await SecureStore.getItemAsync("wafr.native.push.v1"); }
    catch { revokeFailed = true; }
    if (token) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        await request(used, "/api/mobile/push/subscription", "DELETE", { token }, controller.signal);
      } catch { revokeFailed = true; }
      finally { clearTimeout(timeout); }
    }
    const changed = await transition(used.token, null, true);
    if (!changed && current.current)
      throw new ApiError("تغير الحساب أثناء تسجيل الخروج", 409);
    if (revokeFailed && !current.current)
      setStorageError("تم الخروج من الحساب على هذا الجهاز. تعذر تأكيد إيقاف إشعاراته على السيرفر؛ يمكنك إيقاف إشعارات التطبيق من إعدادات الهاتف.");
  }, [session, transition]);
  const login = async (username: string, password: string) => {
    const expectedToken = current.current?.token || null;
    const loginEpoch = authEpoch.current;
    const value = await request<Session>(
      null, "/api/auth/employee-login", "POST", { username: username.trim(), password },
    );
    if (!value.token || !value.id || !value.companyId)
      throw new Error("بيانات الجلسة ناقصة");
    const saved = {
      token: value.token, id: String(value.id), companyId: value.companyId, name: value.name,
    };
    if (authEpoch.current !== loginEpoch) throw new ApiError('تغير الحساب أثناء الدخول؛ أعد المحاولة', 409);
    if (!await transition(expectedToken, saved))
      throw new ApiError("تغير الحساب أثناء الدخول؛ أعد المحاولة", 409);
  };
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === 'background' && biometricRef.current && current.current) {
        authEpoch.current++;
        current.current = null;
        setSession(null);
        setLocked(true);
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      if (state === "active" && current.current) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider
        value={{ session, ready, storageError, locked, biometricEnabled, isCurrentAccount: (scope) => !!current.current && `${current.current.companyId}:${current.current.id}` === scope, unlock, setBiometric, login, logout, api, refresh }}
      >
        {children}
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("Missing SessionProvider");
  return context;
}
export function useApiQuery<T>(path: string) {
  const { session, api } = useSession();
  return useQuery({
    queryKey: [session?.companyId, session?.id, path],
    queryFn: ({ signal }) => api<T>(path, "GET", undefined, signal),
    enabled: !!session,
  });
}
