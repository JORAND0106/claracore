/**
 * ClaraGIS / plano: la geometría del reporte sale de dibujo_escena (canónica).
 * Reemplaza features stale de dibujo_geojson cuando hay escena disponible.
 */
import { geojsonCanonicoDesdeReporte } from './sicoeDibujoEscenaGeojson.js'

/**
 * @param {object[]} features Features ya construidas (mapa de calor / huellas)
 * @param {Record<string, object>|Map|null} escenasPorReporte
 * @returns {object[]}
 */
export function reconciliarDibujosConEscenas(features, escenasPorReporte) {
  const list = Array.isArray(features) ? features : []
  if (!escenasPorReporte || (escenasPorReporte instanceof Map
    ? escenasPorReporte.size === 0
    : !Object.keys(escenasPorReporte).length)) {
    return list
  }
  const getEscena = (rid) => {
    if (rid == null) return null
    const key = String(rid)
    if (escenasPorReporte instanceof Map) return escenasPorReporte.get(key) || null
    return escenasPorReporte[key] || escenasPorReporte[rid] || null
  }

  const byRep = new Map()
  for (const f of list) {
    const rid = f?.properties?.reporte_id
    if (rid == null) continue
    const key = String(rid)
    if (!byRep.has(key)) byRep.set(key, [])
    byRep.get(key).push(f)
  }

  const out = []
  const done = new Set()
  for (const f of list) {
    const rid = f?.properties?.reporte_id
    const key = rid != null ? String(rid) : null
    if (!key || done.has(key)) {
      if (!key) out.push(f)
      continue
    }
    const escena = getEscena(rid)
    if (!escena) {
      out.push(f)
      continue
    }
    done.add(key)
    const peers = byRep.get(key) || [f]
    const anchor = peers[0]?.properties || {}
    const canon = geojsonCanonicoDesdeReporte({
      id: rid,
      reporte_id: rid,
      dibujo_escena: escena,
      dibujo_geojson: null,
    })
    const canonFeats = Array.isArray(canon.features) ? canon.features : []
    if (!canonFeats.length) {
      out.push(...peers)
      continue
    }
    canonFeats.forEach((cf, i) => {
      if (!cf?.geometry) return
      out.push({
        type: 'Feature',
        geometry: cf.geometry,
        properties: {
          ...anchor,
          ...(cf.properties || {}),
          origen: 'reporte_dibujo',
          reporte_id: rid,
          dibujo_parte: i,
          geometria_origen: 'escena_canonica',
          weight: anchor.weight,
          costo_directo: anchor.costo_directo,
          tiene_dibujo: 1,
          color_mode: anchor.color_mode || 'calor',
          sin_dibujo: 0,
          registro_id: anchor.registro_id,
          id: anchor.id,
          numero_registro: anchor.numero_registro,
          calor_agregado: anchor.calor_agregado,
          item_numero: anchor.item_numero,
          placeholder_escena: undefined,
        },
      })
    })
  }
  // Nunca pintar placeholders (0,0) si la regeneración falló.
  return out.filter((f) => !f?.properties?.placeholder_escena)
}

/**
 * ¿La geometría persistida (dibujo_geojson) difiere de la escena canónica?
 * Usado para listar reportes afectados sin tocar datos.
 */
export function reporteGeometriaDesfasada(reporte, { tolM = 0.5 } = {}) {
  const escena = reporte?.dibujo_escena
  const stored = reporte?.dibujo_geojson || reporte?.perimetro_geojson
  if (!escena || !stored) return { desfasada: false, reason: 'sin_par' }
  const canon = geojsonCanonicoDesdeReporte(reporte)
  if (canon.origen_geometria !== 'escena' || !canon.features?.length) {
    return { desfasada: false, reason: 'sin_canon' }
  }
  const storedFeats = stored?.type === 'FeatureCollection'
    ? (stored.features || [])
    : (stored?.type === 'Feature' ? [stored] : [])
  const polyCanon = canon.features.find((f) => f?.geometry?.type === 'Polygon')
  const polyStored = storedFeats.find((f) => f?.geometry?.type === 'Polygon')
  if (!polyCanon || !polyStored) {
    return { desfasada: false, reason: 'sin_poligono' }
  }
  const a = polyCanon.geometry.coordinates?.[0] || []
  const b = polyStored.geometry.coordinates?.[0] || []
  if (a.length < 4 || b.length < 4) return { desfasada: false, reason: 'pocos_vertices' }
  let maxDiffM = 0
  const n = Math.min(a.length - 1, b.length - 1)
  for (let i = 0; i < n; i += 1) {
    const [lng0, lat0] = a[i]
    const [lng1, lat1] = b[i]
    const midLat = ((lat0 + lat1) / 2) * Math.PI / 180
    const dx = (lng1 - lng0) * 111320 * Math.cos(midLat)
    const dy = (lat1 - lat0) * 111320
    const d = Math.hypot(dx, dy)
    if (d > maxDiffM) maxDiffM = d
  }
  return {
    desfasada: maxDiffM > tolM,
    maxDiffM,
    reason: maxDiffM > tolM ? 'vertices' : 'ok',
  }
}
