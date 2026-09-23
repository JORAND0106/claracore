/**
 * Helpers de vista rápida del tramo (Inicio/Fin) para planillas de tubería.
 */

/**
 * Bearing geodésico aproximado (grados 0–360) de `from` hacia `to`.
 * @param {{ lng: number, lat: number }} from
 * @param {{ lng: number, lat: number }} to
 */
export function bearingDegTramo(from, to) {
  const lat1 = (Number(from?.lat) * Math.PI) / 180
  const lat2 = (Number(to?.lat) * Math.PI) / 180
  const dLng = ((Number(to?.lng) - Number(from?.lng)) * Math.PI) / 180
  if (![lat1, lat2, dLng].every(Number.isFinite)) return 0
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function pickLngLat(raw) {
  if (!raw || typeof raw !== 'object') return null
  const lat = Number(raw.lat ?? raw.latitude)
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lng, lat }
}

/**
 * Resuelve Inicio/Fin WGS84 desde coords API o conversión GK (EPSG:3116).
 * @param {object} opts
 * @param {function} [opts.convertGk] (este, norte) => {lng,lat}|null
 */
export function resolverCoordsTramoWgs84({
  coordsWgs84Inicio = null,
  coordsWgs84Fin = null,
  norteIni,
  esteIni,
  norteFin,
  esteFin,
  convertGk = null,
} = {}) {
  let inicio = pickLngLat(coordsWgs84Inicio)
  let fin = pickLngLat(coordsWgs84Fin)

  if (!inicio && typeof convertGk === 'function') {
    const w = convertGk(Number(esteIni), Number(norteIni))
    if (w && Number.isFinite(w.lng) && Number.isFinite(w.lat)) {
      inicio = { lng: w.lng, lat: w.lat }
    }
  }
  if (!fin && typeof convertGk === 'function') {
    const w = convertGk(Number(esteFin), Number(norteFin))
    if (w && Number.isFinite(w.lng) && Number.isFinite(w.lat)) {
      fin = { lng: w.lng, lat: w.lat }
    }
  }

  if (!inicio || !fin) {
    return {
      ok: false,
      inicio: inicio || null,
      fin: fin || null,
      mensaje: 'Faltan coordenadas de inicio y/o fin del tramo.',
    }
  }
  return { ok: true, inicio, fin, mensaje: '' }
}

/** True si hay par Inicio/Fin utilizable (WGS84 o GK). */
export function puedeVerMapaTramo(opts = {}) {
  return !!resolverCoordsTramoWgs84(opts).ok
}
