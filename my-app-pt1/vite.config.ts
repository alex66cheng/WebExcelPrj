import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // This is the engine that makes Tailwind work
  ],
  server: {
    allowedHosts: ['www.mygwsite.com', 'mygwsite.com'],
  },
})
