// Attaches the current session's bearer token to every /api/ request automatically.
//
// Passwords used to be compared entirely in the browser, so no auth headers were
// needed. Now that login happens on the server (see /api/auth/*) and most endpoints
// require a bearer token, this patches the one global `fetch` instead of editing every
// one of the ~30 call sites scattered across App.tsx / AdminPortal.tsx / EmployeePortal.tsx.
// It only ever adds a header — it never blocks or redirects a request.

let patched = false;

// Fired on window when an authenticated request comes back 401 — App.tsx listens for
// this to clear the stale session and send the person back to /login with a clear
// reason, instead of every single call site (punch in/out, save settings, etc.) having
// to guess whether a failure was a real network error or an expired/invalid token.
export const SESSION_EXPIRED_EVENT = 'app:session-expired';

export function installAuthFetch() {
  if (patched) return;
  patched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    const isApiCall = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

    if (!isApiCall) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    let hadToken = headers.has('Authorization');
    if (!hadToken) {
      try {
        const stored = localStorage.getItem('app_session');
        const session = stored ? JSON.parse(stored) : null;
        const token = session?.info?.token;
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
          hadToken = true;
        }
      } catch {
        // ignore malformed session, request proceeds without a token
      }
    }

    const response = await originalFetch(input, { ...init, headers });

    // Only treat this as "your session expired" if we actually sent a token —
    // a 401 on the login endpoints themselves just means wrong credentials.
    if (response.status === 401 && hadToken) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }

    return response;
  };
}
