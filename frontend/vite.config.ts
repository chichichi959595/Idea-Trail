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
})
