import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // This is the engine that makes Tailwind work
  ],
  // Mirrors the IIS reverse proxy (deploy/iis/web.config) so the frontend can use
  // same-origin URLs in dev too: API + collaboration WebSockets → WebSideAPI,
  // /adauth → ADAuthAPI (only reachable when it's running, i.e. on Windows).
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '^/excel-room-': { target: 'ws://localhost:3000', ws: true },
      '/adauth': { target: 'http://localhost:5000', rewrite: (p) => p.replace(/^\/adauth/, '') },
    },
  },
})
