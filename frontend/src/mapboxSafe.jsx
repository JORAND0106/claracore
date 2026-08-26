import mapboxgl from 'mapbox-gl'
export {
  addMapboxGeolocateControl,
  MAPBOX_GEOLOCATE_CONTROL_OPTIONS,
  MAPBOX_GEOLOCATE_FLAG,
} from './mapboxGeolocate.js'

/** Comprueba si el navegador puede crear un contexto WebGL (requerido por Mapbox GL). */
export function webglDisponible() {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return !!gl
  } catch {
    return false
  }
}

/**
 * Crea un mapa Mapbox sin lanzar excepción si WebGL falla.
 * @returns {{ map: import('mapbox-gl').Map|null, error: string|null }}
 */
export function crearMapboxMapSeguro(container, options) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) {
    return { map: null, error: 'Mapa no configurado (falta token Mapbox).' }
  }
  if (!webglDisponible()) {
    return {
      map: null,
      error: 'WebGL no está disponible en este equipo o navegador. Activa la aceleración por hardware en Chrome o actualiza los controladores de video.',
    }
  }
  try {
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({ container, ...options })
    return { map, error: null }
  } catch (err) {
    const msg = err?.message || String(err)
    return {
      map: null,
      error: msg.includes('WebGL')
        ? 'No se pudo inicializar WebGL. Revisa aceleración por hardware, drivers de video o prueba otro navegador.'
        : msg || 'No se pudo cargar el mapa.',
    }
  }
}

/** Panel de sustitución cuando Mapbox no puede renderizar. */
export function MapaNoDisponible({ t, mensaje, minHeight = 340 }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        padding: '24px 20px',
        background: t?.bg || '#F8FAFC',
        borderRadius: '10px',
        border: `1px dashed ${t?.border || '#CBD5E1'}`,
        textAlign: 'center',
        gap: '10px',
      }}
    >
      <span style={{ fontSize: '32px' }}>🗺️</span>
      <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t?.text || '#0F172A' }}>
        Mapa no disponible en este equipo
      </div>
      <div style={{ fontSize: 'var(--cc-caption)', color: t?.textMuted || '#64748B', maxWidth: '420px', lineHeight: 1.5 }}>
        {mensaje}
      </div>
      <div style={{ fontSize: 'var(--cc-caption)', color: t?.textMuted || '#64748B', maxWidth: '420px', lineHeight: 1.45, marginTop: '4px' }}>
        Puedes seguir consultando y validando el reporte; solo la vista del plano queda deshabilitada.
      </div>
    </div>
  )
}
