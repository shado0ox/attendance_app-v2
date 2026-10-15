import type {
  PasskeyCreateRequest,
  PasskeyGetRequest,
} from "react-native-passkey";
type Api = <T>(path: string, method?: string, body?: object) => Promise<T>;
async function nativePasskey() {
  const { Passkey } = await import("react-native-passkey");
  if (!Passkey.isSupported())
    throw new Error("الباس كي يحتاج جهازًا مدعومًا وقفل شاشة مفعّلًا");
  return Passkey;
}
export async function registerPasskey(api: Api, empId: string) {
  const passkey = await nativePasskey();
  const options = await api<PasskeyCreateRequest>(
    "/api/auth/webauthn-register-options",
    "POST",
    { empId },
  );
  const credential = await passkey.create(options);
  await api("/api/auth/webauthn-register-verify", "POST", {
    empId,
    credential: {
      ...credential,
      type: "public-key",
      clientExtensionResults: credential.clientExtensionResults || {},
    },
  });
}
export async function punchProof(api: Api, field: string, recordId?: number) {
  const challenge = await api<{
    required: boolean;
    challengeId: string;
    options: PasskeyGetRequest;
  }>("/api/attendance-passkey/options", "POST", { field, recordId });
  if (!challenge.required) return undefined;
  const credential = await (await nativePasskey()).get(challenge.options);
  const { proof } = await api<{ proof: string }>(
    "/api/attendance-passkey/verify",
    "POST",
    {
      challengeId: challenge.challengeId,
      credential: {
        ...credential,
        rawId: credential.rawId || credential.id,
        type: "public-key",
        clientExtensionResults: credential.clientExtensionResults || {},
      },
    },
  );
  return proof;
}
