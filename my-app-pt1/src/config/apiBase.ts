// Derived from the browser's own location so the app keeps working whether it's
// opened via localhost, a LAN IP, or a public IP — without needing env vars.
export const API_BASE = `http://${window.location.hostname}:3000`;
export const WS_BASE = `ws://${window.location.hostname}:3000`;

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
