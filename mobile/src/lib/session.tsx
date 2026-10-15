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
const KEY = "wafr.native.session.v1";
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
  const current = useRef<Session | null>(null);
  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(KEY)
      .then((value) => {
        if (!live || !value) return;
        const saved = JSON.parse(value);
        if (
          typeof saved.token === "string" &&
          typeof saved.id === "string" &&
          typeof saved.companyId === "string"
        ) {
          current.current = saved;
          setSession(saved);
        }
      })
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
  const logout = useCallback(async () => {
    // Delete first: do not claim logout succeeded if the persisted token could return on restart.
    const token = await SecureStore.getItemAsync("wafr.native.push.v1");
    if (token && current.current) {
      await request(
        current.current,
        "/api/mobile/push/subscription",
        "DELETE",
        { token },
      );
      await SecureStore.deleteItemAsync("wafr.native.push.v1");
    }
    await SecureStore.deleteItemAsync(KEY);
    current.current = null;
    setSession(null);
    await queryClient.cancelQueries();
    queryClient.clear();
  }, []);
  const api = useCallback(
    async <T,>(
      path: string,
      method?: string,
      body?: object,
      signal?: AbortSignal,
    ): Promise<T> => {
      const used = current.current;
      if (!used) throw new ApiError("سجل الدخول أولًا", 401);
      try {
        return await request<T>(used, path, method, body, signal);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          used.token === current.current?.token
        ) {
          await SecureStore.deleteItemAsync(KEY);
          current.current = null;
          setSession(null);
          await queryClient.cancelQueries();
          queryClient.clear();
        }
        throw error;
      }
    },
    [],
  );
  const login = async (username: string, password: string) => {
    const value = await request<Session>(
      null,
      "/api/auth/employee-login",
      "POST",
      { username: username.trim(), password },
    );
    if (!value.token || !value.id || !value.companyId)
      throw new Error("بيانات الجلسة ناقصة");
    const saved = {
      token: value.token,
      id: String(value.id),
      companyId: value.companyId,
      name: value.name,
    };
    await SecureStore.setItemAsync(KEY, JSON.stringify(saved), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await queryClient.cancelQueries();
    queryClient.clear();
    current.current = saved;
    setSession(saved);
  };
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && current.current) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider
        value={{ session, ready, storageError, login, logout, api, refresh }}
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
