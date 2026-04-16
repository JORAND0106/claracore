import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Evita ERR_CONNECTION_REFUSED al abrir 127.0.0.1 mientras Vite solo escucha en "localhost" (IPv6).
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/informes': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/mapbox-gl')) return 'maps'
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) return 'charts'
          if (id.includes('node_modules/react-dom')) return 'react-dom'
          if (id.includes('node_modules/react/')) return 'react'
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  }
})
