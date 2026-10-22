import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // shadcn/ui and prompt-kit components are published against the `@/`
      // convention, so the alias is what lets them be dropped in unedited.
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // One origin for the whole app. A phone in 多人接龍 can't reach the
    // backend's 127.0.0.1:8000, and a second ngrok tunnel would mean two URLs
    // that both change on every restart plus CORS between them — so the
    // backend is reached through this server instead, under /api.
    proxy: {
      '/api': {
        // Overridable so a second copy of the app (a test run, say) can sit
        // beside the one in use without the two sharing a backend.
        target: process.env.IDEATRAIL_API ?? 'http://127.0.0.1:8000',
        rewrite: (p) => p.replace(/^\/api/, ''),
        // Appends the caller's address to X-Forwarded-For. The backend uses
        // that to serve only the participant routes to anything that isn't
        // this machine (backend/app/access.py) — without it, every proxied
        // request would look like it came from localhost.
        xfwd: true,
      },
    },
    // LAN IPs are always allowed; tunnel hostnames have to be named.
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev', '.ngrok.io'],
  },
})
