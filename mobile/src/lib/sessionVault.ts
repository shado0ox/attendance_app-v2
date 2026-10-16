import type { Session } from './types';
export const SESSION_KEY = 'wafr.native.session.v1';
export const BIOMETRIC_KEY = 'wafr.native.session.biometric.v1';
export const BIOMETRIC_FLAG = 'wafr.native.session.biometric.enabled.v1';
export type VaultStore = { get: (key: string, biometric?: boolean) => Promise<string | null>; set: (key: string, value: string, biometric?: boolean) => Promise<void>; remove: (key: string) => Promise<void> };
export function parseSession(value: string | null): Session | null {
  if (!value) return null;
  const saved = JSON.parse(value);
  return saved && typeof saved.token === 'string' && !!saved.token && typeof saved.id === 'string' && typeof saved.companyId === 'string' ? saved : null;
}
/** The enabled mode has no unprotected duplicate of the saved bearer token. */
export function sessionVault(store: VaultStore) {
  return {
    enabled: async () => await store.get(BIOMETRIC_FLAG) === '1',
    restore: async () => parseSession(await store.get(SESSION_KEY)),
    unlock: async () => parseSession(await store.get(BIOMETRIC_KEY, true)),
    async save(session: Session, biometric: boolean) {
      await store.set(biometric ? BIOMETRIC_KEY : SESSION_KEY, JSON.stringify(session), biometric);
      await store.remove(biometric ? SESSION_KEY : BIOMETRIC_KEY);
    },
    async enable(session: Session) {
      await store.set(BIOMETRIC_KEY, JSON.stringify(session), true);
      const checked = parseSession(await store.get(BIOMETRIC_KEY, true));
      if (checked?.token !== session.token) throw new Error('تعذر تأكيد بصمة الجهاز');
      await store.remove(SESSION_KEY);
      await store.set(BIOMETRIC_FLAG, '1');
    },
    async disable(session: Session) {
      await store.set(SESSION_KEY, JSON.stringify(session));
      await store.remove(BIOMETRIC_FLAG);
      await store.remove(BIOMETRIC_KEY);
    },
    async clear() {
      // Do not remove the flag first: failed deletion must never allow normal restore.
      await store.remove(SESSION_KEY);
      await store.remove(BIOMETRIC_KEY);
      await store.remove(BIOMETRIC_FLAG);
    },
  };
}
