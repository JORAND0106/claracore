import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Escucha en todas las interfaces para acceso desde otros dispositivos en la misma WiFi.
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/_appinsights': {
        target: 'https://api.applicationinsights.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/_appinsights/, ''),
      },
      // Todas las rutas del backend (mismo origen en dev → login, SICOE, presupuesto, etc.)
      '^/(auth|cargos|roles|contratos|usuarios|categorias|funciones|admin|mantenimiento|healthz|listado-precios|subcontratistas|presupuesto|cobro|contabilidad|almacen|catalogo-insumos|exportar|cad-queue|claracad|cad/ejes|comentarios|logs|inicio|notificaciones|frase-del-dia|informes|actas|actas-tipos|sicoe-obra|guias|ayuda|sst|prog-obra|avi|topografia|filtros-plantillas|export-plantillas|presupuesto-versiones|seguimiento|test-telegram|internal)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Lote auditoría + IA: una sola petición puede durar muchos minutos; el proxy por defecto corta y el navegador muestra "Failed to fetch".
        timeout: 1_800_000,
        proxyTimeout: 1_800_000,
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
