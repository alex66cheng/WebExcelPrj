// ADAuthAPI is a separate C# service with Windows Authentication enabled (see
// /ADAuthAPI). It resolves the browser's Windows identity against AD and hands
// back a short-lived signed token WebSideAPI can verify — see
// ADAuthAPI/Program.cs and WebSideAPI/index.js's auth middleware.
//
// It's its own IIS application on the same site as the frontend (e.g.
// /WebExcelAuth, baked in at build time via VITE_AD_AUTH_PATH, see
// deploy/iis/build-packages.sh), so it's same-origin: no CORS, and Windows Auth
// applies only to that application. In dev, Vite proxies /adauth to it.
export const AD_AUTH_BASE = `${window.location.origin}${import.meta.env.VITE_AD_AUTH_PATH || '/adauth'}`;
