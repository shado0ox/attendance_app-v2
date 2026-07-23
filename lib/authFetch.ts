// Attaches the current session's bearer token to every /api/ request automatically.
//
// Passwords used to be compared entirely in the browser, so no auth headers were
// needed. Now that login happens on the server (see /api/auth/*) and most endpoints
// require a bearer token, this patches the one global `fetch` instead of editing every
// one of the ~30 call sites scattered across App.tsx / AdminPortal.tsx / EmployeePortal.tsx.
// It only ever adds a header — it never blocks or redirects a request.

let patched = false;

export function installAuthFetch() {
  if (patched) return;
  patched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    const isApiCall = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

    if (!isApiCall) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) {
      try {
        const stored = localStorage.getItem('app_session');
        const session = stored ? JSON.parse(stored) : null;
        const token = session?.info?.token;
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch {
        // ignore malformed session, request proceeds without a token
      }
    }

    return originalFetch(input, { ...init, headers });
  };
}
