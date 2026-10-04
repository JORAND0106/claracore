/**
 * Origen geográfico del dibujo de reporte (huella).
 * El lienzo ancla mundo (0,0) al primer punto Gauss (EPSG:3116);
 * al reabrir Editar dibujo debe restaurarse ese ancla — no el centro del mapa.
 */
import { PX_PER_METER } from '../../components/esquema/esquemaGeometry.js'
import { gkBogotaToWgs84 } from '../../utils/epsg3116.js'
import { originFromDibujoEscena } from './sicoeDibujoEscenaGeojson.js'

/**
 * Origen Magna GK implícito en la escena: invierte topo→mundo
 * (este0 = este − x/ppm, norte0 = norte + y/ppm) del nodo más cercano a (0,0).
 * @param {Array<object>|null|undefined} objects
 * @returns {{ este0: number, norte0: number }|null}
 */
export function gkOriginFromObjects(objects) {
  const nodos = (objects || []).filter((o) => (
    o
    && o.type === 'nodo'
    && Number.isFinite(Number(o.norte))
    && Number.isFinite(Number(o.este))
  ))
  if (!nodos.length) return null
  let best = nodos[0]
  let bestD = Infinity
  for (const n of nodos) {
    const d = Math.hypot(Number(n.x) || 0, Number(n.y) || 0)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  const x = Number(best.x) || 0
  const y = Number(best.y) || 0
  const este = Number(best.este)
  const norte = Number(best.norte)
  return {
    este0: este - x / PX_PER_METER,
    norte0: norte + y / PX_PER_METER,
  }
}

/**
 * Origen GK desde la primera fila válida de la tabla de coordenadas.
 * @param {Array<{norte?:any,este?:any}>|null|undefined} rows
 * @returns {{ este0: number, norte0: number }|null}
 */
export function gkOriginFromCoordRows(rows) {
  const first = (rows || []).find((r) => {
    if (r == null) return false
    if (r.norte === '' || r.este === '') return false
    return Number.isFinite(Number(r.norte)) && Number.isFinite(Number(r.este))
  })
  if (!first) return null
  return {
    este0: Number(first.este),
    norte0: Number(first.norte),
  }
}

/**
 * Resuelve el origen WGS84 del mapa para huella.
 * Prioridad: Gauss de escena/tabla (alineado al lienzo) → origin_lnglat guardado → fallback.
 *
 * @param {{
 *   objects?: Array<object>|null,
 *   coordRows?: Array<object>|null,
 *   escena?: object|null,
 *   fallbackLngLat?: { lng: number, lat: number }|null,
 * }} [opts]
 * @returns {{
 *   lngLat: { lng: number, lat: number },
 *   gk: { este0: number, norte0: number }|null,
 *   source: 'gauss'|'escena'|'fallback',
 * }|null}
 */
export function resolveHuellaMapOrigin(opts = {}) {
  const { objects, coordRows, escena, fallbackLngLat } = opts
  const gk = gkOriginFromObjects(objects) || gkOriginFromCoordRows(coordRows)
  if (gk && Number.isFinite(gk.este0) && Number.isFinite(gk.norte0)) {
    const ll = gkBogotaToWgs84(gk.este0, gk.norte0)
    if (ll && Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) {
      return { lngLat: { lng: ll.lng, lat: ll.lat }, gk, source: 'gauss' }
    }
  }
  const saved = originFromDibujoEscena(escena)
  if (saved) {
    return { lngLat: saved, gk: null, source: 'escena' }
  }
  const fbLng = Number(fallbackLngLat?.lng)
  const fbLat = Number(fallbackLngLat?.lat)
  if (Number.isFinite(fbLng) && Number.isFinite(fbLat)) {
    return { lngLat: { lng: fbLng, lat: fbLat }, gk: null, source: 'fallback' }
  }
  return null
}
