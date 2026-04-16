import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/informes': 'http://localhost:8000',
      '/sicoe-obra': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/usuarios': 'http://localhost:8000',
      '/contratos': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/notificaciones': 'http://localhost:8000',
      '/frase-del-dia': 'http://localhost:8000',
    },
  },
})
