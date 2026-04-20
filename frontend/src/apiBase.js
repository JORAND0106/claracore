/** URL base del API FastAPI. En `npm run dev`, '' hace que fetch vaya al origen de Vite y el proxy reenvíe a :8000 (evita fallos de conexión/CORS). */
const PROD_FALLBACK = 'https://claracore-backend.azurewebsites.net'

export const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_URL || PROD_FALLBACK)
