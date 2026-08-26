import mapboxgl from 'mapbox-gl'

export const MAPBOX_GEOLOCATE_FLAG = '__sicoeGeolocateAttached'

/** Opciones canónicas del marcador “mi ubicación” en todos los mapas Mapbox. */
export const MAPBOX_GEOLOCATE_CONTROL_OPTIONS = Object.freeze({
  positionOptions: Object.freeze({
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  }),
  trackUserLocation: true,
  showUserLocation: true,
  showAccuracyCircle: true,
  showUserHeading: true,
  // Punto azul sin recentrar el mapa (no interfiere con PK / planos del proyecto).
  followUserLocation: false,
})

/** Estilos para que el marcador GPS no capture clics sobre PK / polígonos. */
let _geolocatePointerCssInjected = false
export function ensureGeolocatePointerEventsNone(doc = typeof document !== 'undefined' ? document : null) {
  if (_geolocatePointerCssInjected || !doc?.head) return false
  _geolocatePointerCssInjected = true
  const style = doc.createElement('style')
  style.setAttribute('data-sicoe-geolocate', '1')
  style.textContent = [
    '.mapboxgl-user-location-dot,',
    '.mapboxgl-user-location-accuracy-circle,',
    '.mapboxgl-user-location-heading {',
    '  pointer-events: none !important;',
    '}',
  ].join('\n')
  doc.head.appendChild(style)
  return true
}

/** Reset interno solo para tests. */
export function __resetGeolocatePointerCssForTests() {
  _geolocatePointerCssInjected = false
}

/**
 * Añade el control de “mi ubicación” (GeolocateControl) de Mapbox.
 * - Muestra punto azul + círculo de precisión y actualiza al desplazarse.
 * - No mueve la cámara al activarse (no interfiere con PK / planos).
 * - Si no hay GPS o se deniega el permiso, falla en silencio.
 * Idempotente por instancia de mapa.
 *
 * @param {import('mapbox-gl').Map | null | undefined} map
 * @param {string} [position='top-right']
 * @param {{ GeolocateControl?: typeof mapboxgl.GeolocateControl }} [deps] — solo para tests
 * @returns {import('mapbox-gl').GeolocateControl | null}
 */
export function addMapboxGeolocateControl(map, position = 'top-right', deps = {}) {
  if (!map || typeof map.addControl !== 'function') return null
  if (map[MAPBOX_GEOLOCATE_FLAG]) return map[MAPBOX_GEOLOCATE_FLAG]

  const GeolocateControl = deps.GeolocateControl || mapboxgl.GeolocateControl

  try {
    ensureGeolocatePointerEventsNone()
    const geolocate = new GeolocateControl({ ...MAPBOX_GEOLOCATE_CONTROL_OPTIONS })
    geolocate.on('error', () => {
      /* permiso denegado / GPS off: sin toast ni bloqueo */
    })
    map.addControl(geolocate, position)
    map[MAPBOX_GEOLOCATE_FLAG] = geolocate

    const tryTrigger = () => {
      try {
        geolocate.trigger()
      } catch {
        /* ignore */
      }
    }
    if (typeof map.loaded === 'function' && map.loaded()) {
      try {
        if (typeof queueMicrotask === 'function') queueMicrotask(tryTrigger)
        else setTimeout(tryTrigger, 0)
      } catch {
        tryTrigger()
      }
    } else if (typeof map.once === 'function') {
      map.once('load', tryTrigger)
    } else {
      tryTrigger()
    }
    return geolocate
  } catch {
    return null
  }
}
