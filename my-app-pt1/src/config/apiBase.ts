// Derived from the browser's own location so the app keeps working whether it's
// opened via localhost, a LAN IP, or a public IP — without needing env vars.
export const API_BASE = `http://${window.location.hostname}:3000`;
export const WS_BASE = `ws://${window.location.hostname}:3000`;
