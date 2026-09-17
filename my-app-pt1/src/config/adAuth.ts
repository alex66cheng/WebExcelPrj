// ADAuthAPI is a separate C# service deployed under IIS with Windows
// Authentication enabled (see /ADAuthAPI). It resolves the browser's Windows
// identity against AD and hands back a short-lived signed token WebSideAPI
// can verify — see ADAuthAPI/Program.cs and WebSideAPI/index.js's auth
// middleware.
export const AD_AUTH_BASE = `http://${window.location.hostname}:5000`;
