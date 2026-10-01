import { getCurrentLang } from '../i18n/lang';

// Enterprise build: everything is same-origin. In production the frontend is an
// IIS application under a sub-path (e.g. /WebExcelApp, set by `vite build --base`,
// see deploy/iis/build-packages.sh) that reverse-proxies <base>/api/* and the
// <base>/excel-room-* WebSockets to WebSideAPI on 127.0.0.1:3000 (see
// deploy/iis/package/1-frontend/web.config); in development the base is "/" and
// the Vite dev server does the same proxying (see vite.config.ts).
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');
export const API_BASE = `${window.location.origin}${BASE_PATH}`;
export const WS_BASE = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${BASE_PATH}`;

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
  // Lets the backend answer with messages in the UI language (see WebSideAPI/i18n.js)
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', getCurrentLang());
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
