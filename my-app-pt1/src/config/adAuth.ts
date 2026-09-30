// ADAuthAPI is a separate C# service with Windows Authentication enabled (see
// /ADAuthAPI). It resolves the browser's Windows identity against AD and hands
// back a short-lived signed token WebSideAPI can verify — see
// ADAuthAPI/Program.cs and WebSideAPI/index.js's auth middleware.
//
// It's hosted as the /adauth IIS application under the same site as the
// frontend (see deploy/iis/Deploy-Enterprise.ps1), so it's same-origin: no CORS,
// and Windows Auth applies only to that sub-application.
export const AD_AUTH_BASE = `${window.location.origin}/adauth`;
