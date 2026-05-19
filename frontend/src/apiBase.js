/** URL base del API FastAPI. En `npm run dev`, '' hace que fetch vaya al origen de Vite y el proxy reenvíe a :8000 (evita fallos de conexión/CORS). */
const PROD_FALLBACK = 'https://claracore-backend.azurewebsites.net'

/** Origen alternativo si falla la red contra `API_BASE` (p. ej. `fetchConFallback` en Informes). */
export const API_FALLBACK = PROD_FALLBACK

export const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_URL || PROD_FALLBACK)

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
/** Anon key: nombre canónico VITE_SUPABASE_ANON_KEY; VITE_SUPABASE_KEY se acepta por compatibilidad. */
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY

/** Más detalle en consola: variable de entorno o `localStorage.setItem('claracore_debug_api','1')` + recargar. */
export function apiDebugVerbose() {
  try {
    if (String(import.meta.env.VITE_DEBUG_API || '').toLowerCase() === 'true') return true
    if (typeof localStorage !== 'undefined' && localStorage.getItem('claracore_debug_api') === '1') return true
  } catch { /* ignore */ }
  return false
}

/** Registro en consola cuando falle la red o el API (muchas rutas usan catch vacío y no ves nada). */
export function logApiFailure(context, err) {
  const hint = apiDebugVerbose()
    ? err
    : (err && err.message) || err || 'sin detalle'
  console.warn(`[ClaraCore API · ${context}]`, hint)
  if (apiDebugVerbose() && err && err.stack) console.warn(err.stack)
}
