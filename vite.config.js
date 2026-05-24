import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '^/(auth|cargos|roles|contratos|usuarios|categorias|funciones|admin|mantenimiento|healthz|listado-precios|presupuesto|filtros-plantillas|exportar|cad-queue|comentarios|logs|inicio|notificaciones|frase-del-dia|informes|actas|actas-tipos|sicoe-obra)': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
