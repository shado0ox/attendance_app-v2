const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
const encode = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function post(url: string, body: any) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'تعذر التحقق من Passkey');
  return data;
}
export async function punchWithPasskey(body: any) {
  const field = ['checkIn', 'checkOut', 'checkIn2', 'checkOut2'].find(field => body[field] != null);
  const config = await post('/api/attendance-passkey/options', { field, recordId: body.id });
  let passkeyProof: string | undefined;
  if (config.required) {
    if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('هذا الجهاز لا يدعم Passkey؛ تواصل مع الإدارة');
    const credential = await navigator.credentials.get({ publicKey: { ...config.options, challenge: decode(config.options.challenge), allowCredentials: config.options.allowCredentials.map((c: any) => ({ ...c, id: decode(c.id) })) } }) as PublicKeyCredential | null;
    if (!credential) throw new Error('لم يتم تأكيد الهوية');
    const response = credential.response as AuthenticatorAssertionResponse;
    const result = await post('/api/attendance-passkey/verify', { challengeId: config.challengeId, credential: { id: credential.id, rawId: encode(credential.rawId), type: credential.type, response: { clientDataJSON: encode(response.clientDataJSON), authenticatorData: encode(response.authenticatorData), signature: encode(response.signature), userHandle: response.userHandle ? encode(response.userHandle) : undefined }, clientExtensionResults: credential.getClientExtensionResults() } });
    passkeyProof = result.proof;
  }
  return fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, passkeyProof }) });
}
