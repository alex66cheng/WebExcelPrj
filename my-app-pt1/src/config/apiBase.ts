// Derived from the browser's own location so the app keeps working whether it's
// opened via localhost, a LAN IP, a public IP, or the public domain — without
// needing env vars. When the page is loaded over HTTPS (i.e. via the Caddy
// reverse proxy in front of www.mygwsite.com), the API is reached over HTTPS/WSS
// too, on the :3443 site Caddy proxies to the API's plain-HTTP port 3000 — Google
// OAuth requires an https:// (or localhost) origin, which is why this matters.
const isSecure = window.location.protocol === 'https:';
const apiPort = isSecure ? 3443 : 3000;
export const API_BASE = `${isSecure ? 'https' : 'http'}://${window.location.hostname}:${apiPort}`;
export const WS_BASE = `${isSecure ? 'wss' : 'ws'}://${window.location.hostname}:${apiPort}`;

const TOKEN_STORAGE_KEY = 'webexcelprj_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage failures (e.g. private browsing)
  }
}

// Thin wrapper around fetch() that targets API_BASE and attaches the bearer
// token automatically, so pages don't each need to know how auth works.
export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
