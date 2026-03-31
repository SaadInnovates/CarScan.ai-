import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Must be listed BEFORE '/reports' so that API report routes
      // like POST /api/v1/reports/{id}/generate are not intercepted
      // by the static-file proxy below.
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
      // Static file proxy for report PDFs — only hits paths that are
      // NOT already matched by /api above (e.g. /reports/some-file.pdf)
      '/reports': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
