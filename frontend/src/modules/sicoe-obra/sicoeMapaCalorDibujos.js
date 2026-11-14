/**
 * Une puntos del mapa de calor (filtro activo) con huellas/dibujos del contrato
 * y densifica geometrías a muestras ponderadas para el heatmap de Mapbox.
 *
 * Preferencia de match:
 * 1) registro_id (huella por ítem)
 * 2) reporte_id (dibujo del botón Dibujar en la cabecera del reporte)
 *
 * El CD del reporte se reparte de forma uniforme en las muestras (línea/área/punto).
 * Donde se superponen, Mapbox heatmap suma densidades.
 */

import { colorDibujoPorItems } from './sicoeItemColores.js'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

/** Radio visual (m) cuando el dibujo solo trae un Point sin polígono de entidad. */
const RADIO_PUNTO_DIBUJO_M = 5

/** Espaciado métrico de muestreo a lo largo / en área. */
export const CALOR_SAMPLE_SPACING_M = 10
/** Tope de muestras por feature (rendimiento). */
export const CALOR_MAX_SAMPLES_PER_FEATURE = 72
/** Tope global de muestras densificadas. */
export const CALOR_MAX_SAMPLES_TOTAL = 14000

function idSet(values) {
  const s = new Set()
  for (const v of values || []) {
    if (v == null || v === '') continue
    s.add(String(v))
  }
  return s
}

function weightColorExpr() {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 0.05],
    0, '#94a3b8',
    0.25, '#2166ac',
    0.55, '#fdae61',
    1, '#b2182b',
  ]
}

function metersPerDegLat() {
  return 111320
}

function metersPerDegLng(lat) {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return 111320 * (Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat)
}

function distM(a, b) {
  const lat = ((a[1] + b[1]) / 2)
  const dx = (b[0] - a[0]) * metersPerDegLng(lat)
  const dy = (b[1] - a[1]) * metersPerDegLat()
  return Math.hypot(dx, dy)
}

function pointToCirclePolygon(coords, radiusM = RADIO_PUNTO_DIBUJO_M) {
  if (!Array.isArray(coords) || coords.length < 2) return null
  const lng = Number(coords[0])
  const lat = Number(coords[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const dLat = radiusM / metersPerDegLat()
  const dLng = radiusM / metersPerDegLng(lat)
  const ring = []
  const steps = 20
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * Normaliza geometría para pintar fill+line en Mapbox:
 * - Polygon / MultiPolygon / LineString / MultiLineString: intactos
 * - Point: disco pequeño (nunca marcador LOD); guarda centro en propsExtra
 */
export function geometriaDibujoParaPlano(geom, props = {}) {
  if (!geom || !geom.type) return null
  if (geom.type === 'Point') {
    const poly = pointToCirclePolygon(geom.coordinates)
    if (!poly) return null
    const lng = Number(geom.coordinates[0])
    const lat = Number(geom.coordinates[1])
    return {
      geometry: poly,
      propsExtra: {
        huella_tipo: props.huella_tipo || props.dibujo_tipo || 'nodo',
        dibujo_tipo: props.dibujo_tipo || props.huella_tipo || 'nodo',
        geometria_origen: 'point_expandido',
        punto_nodo_lng: lng,
        punto_nodo_lat: lat,
      },
    }
  }
  if (
    geom.type === 'Polygon'
    || geom.type === 'MultiPolygon'
    || geom.type === 'LineString'
    || geom.type === 'MultiLineString'
  ) {
    return { geometry: geom, propsExtra: {} }
  }
  return null
}

function pointInRing(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0])
    const yi = Number(ring[i][1])
    const xj = Number(ring[j][0])
    const yj = Number(ring[j][1])
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) continue
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lng, lat, geom) {
  if (!geom) return false
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates || []
    if (!rings.length || !pointInRing(lng, lat, rings[0])) return false
    for (let i = 1; i < rings.length; i += 1) {
      if (pointInRing(lng, lat, rings[i])) return false
    }
    return true
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates || []) {
      if (pointInPolygon(lng, lat, { type: 'Polygon', coordinates: poly })) return true
    }
  }
  return false
}

function sampleLineCoords(coords, spacingM, maxSamples) {
  const out = []
  if (!Array.isArray(coords) || coords.length < 2) return out
  out.push([Number(coords[0][0]), Number(coords[0][1])])
  let carry = 0
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1]
    const b = coords[i]
    const seg = distM(a, b)
    if (!(seg > 0)) continue
    let d = spacingM - carry
    while (d <= seg && out.length < maxSamples) {
      const t = d / seg
      out.push([
        Number(a[0]) + (Number(b[0]) - Number(a[0])) * t,
        Number(a[1]) + (Number(b[1]) - Number(a[1])) * t,
      ])
      d += spacingM
    }
    carry = (carry + seg) % spacingM
  }
  const last = coords[coords.length - 1]
  const tip = [Number(last[0]), Number(last[1])]
  const prev = out[out.length - 1]
  if (!prev || prev[0] !== tip[0] || prev[1] !== tip[1]) {
    if (out.length < maxSamples) out.push(tip)
  }
  return out
}

function samplePolygon(geom, spacingM, maxSamples) {
  const out = []
  const polys = geom.type === 'MultiPolygon'
    ? (geom.coordinates || [])
    : [geom.coordinates]
  for (const rings of polys) {
    const outer = rings?.[0]
    if (!Array.isArray(outer) || outer.length < 3) continue
    let minLng = Infinity
    let maxLng = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity
    for (const c of outer) {
      const lng = Number(c[0])
      const lat = Number(c[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    if (!Number.isFinite(minLng)) continue
    const midLat = (minLat + maxLat) / 2
    const dLng = spacingM / metersPerDegLng(midLat)
    const dLat = spacingM / metersPerDegLat()
    // Semilla con centroide aproximado del anillo
    let sx = 0
    let sy = 0
    let n = 0
    for (const c of outer) {
      const lng = Number(c[0])
      const lat = Number(c[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      sx += lng
      sy += lat
      n += 1
    }
    if (n && pointInPolygon(sx / n, sy / n, { type: 'Polygon', coordinates: rings })) {
      out.push([sx / n, sy / n])
    }
    for (let lat = minLat; lat <= maxLat + 1e-12 && out.length < maxSamples; lat += dLat) {
      for (let lng = minLng; lng <= maxLng + 1e-12 && out.length < maxSamples; lng += dLng) {
        if (pointInPolygon(lng, lat, { type: 'Polygon', coordinates: rings })) {
          out.push([lng, lat])
        }
      }
    }
    if (out.length >= maxSamples) break
  }
  return out.slice(0, maxSamples)
}

/**
 * Densifica un dibujo a puntos ponderados (weight total ≈ weight del feature).
 * @param {object} feature
 * @param {{ spacingM?: number, maxSamples?: number }} [opts]
 * @returns {object[]} Point features
 */
export function densificarDibujoAPuntosCalor(feature, opts = {}) {
  const spacingM = Math.max(2, Number(opts.spacingM) || CALOR_SAMPLE_SPACING_M)
  const maxSamples = Math.max(1, Number(opts.maxSamples) || CALOR_MAX_SAMPLES_PER_FEATURE)
  const p = feature?.properties || {}
  const geom = feature?.geometry
  const weight = Number(p.weight)
  const wFeat = Number.isFinite(weight) && weight > 0 ? weight : 0.05
  const costo = Number(p.costo_directo) || 0

  let coords = []
  // Nodo solo-punto: todo el CD en el centro (no esparcir en el disco visual).
  if (
    p.geometria_origen === 'point_expandido'
    && Number.isFinite(Number(p.punto_nodo_lng))
    && Number.isFinite(Number(p.punto_nodo_lat))
  ) {
    coords = [[Number(p.punto_nodo_lng), Number(p.punto_nodo_lat)]]
  } else if (geom?.type === 'LineString') {
    coords = sampleLineCoords(geom.coordinates, spacingM, maxSamples)
  } else if (geom?.type === 'MultiLineString') {
    for (const line of geom.coordinates || []) {
      const part = sampleLineCoords(line, spacingM, maxSamples - coords.length)
      coords.push(...part)
      if (coords.length >= maxSamples) break
    }
  } else if (geom?.type === 'Polygon' || geom?.type === 'MultiPolygon') {
    coords = samplePolygon(geom, spacingM, maxSamples)
  } else if (geom?.type === 'Point') {
    coords = [[Number(geom.coordinates[0]), Number(geom.coordinates[1])]]
  }

  if (!coords.length) return []
  const n = coords.length
  const wEach = wFeat / n
  const cEach = costo / n
  return coords.map(([lng, lat], i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      weight: wEach,
      costo_directo: cEach,
      reporte_id: p.reporte_id,
      registro_id: p.registro_id ?? p.id,
      id: p.registro_id ?? p.id,
      numero_reporte: p.numero_reporte,
      item_numero: p.item_numero,
      color_mode: 'calor',
      tiene_dibujo: 1,
      sample_i: i,
      sample_n: n,
      origen_calor: 'dibujo_densificado',
    },
  }))
}

/**
 * @param {object[]} dibujosFeatures
 * @param {object[]} puntosSinDibujo
 * @param {{ spacingM?: number, maxSamples?: number, maxTotal?: number }} [opts]
 */
export function construirCalorSamplesFc(dibujosFeatures = [], puntosSinDibujo = [], opts = {}) {
  const maxTotal = Math.max(1, Number(opts.maxTotal) || CALOR_MAX_SAMPLES_TOTAL)
  const samples = []
  for (const f of dibujosFeatures || []) {
    if (samples.length >= maxTotal) break
    const part = densificarDibujoAPuntosCalor(f, {
      spacingM: opts.spacingM,
      maxSamples: Math.min(
        opts.maxSamples || CALOR_MAX_SAMPLES_PER_FEATURE,
        maxTotal - samples.length,
      ),
    })
    samples.push(...part)
  }
  for (const f of puntosSinDibujo || []) {
    if (samples.length >= maxTotal) break
    const p = f?.properties || {}
    const coords = f?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const w = Number(p.weight)
    samples.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(coords[0]), Number(coords[1])] },
      properties: {
        weight: Number.isFinite(w) && w > 0 ? w : 0.05,
        costo_directo: Number(p.costo_directo) || 0,
        reporte_id: p.reporte_id,
        registro_id: p.id,
        id: p.id,
        numero_reporte: p.numero_reporte,
        item_numero: p.item_numero,
        color_mode: 'calor',
        tiene_dibujo: 0,
        sin_dibujo: 1,
        origen_calor: 'punto_sin_dibujo',
      },
    })
  }
  return { type: 'FeatureCollection', features: samples }
}

/**
 * @param {object} heatFc FeatureCollection de puntos del mapa de calor (ya filtrados)
 * @param {object[]} allHuellas features de analisis.dibujos (o /huellas)
 * @returns {{ dibujosFc, puntosSinDibujoFc, calorSamplesFc, meta }}
 */
export function construirCalorSobreDibujos(heatFc, allHuellas) {
  const heatFeats = Array.isArray(heatFc?.features) ? heatFc.features : []
  if (!heatFeats.length) {
    return {
      dibujosFc: EMPTY_FC,
      puntosSinDibujoFc: EMPTY_FC,
      calorSamplesFc: EMPTY_FC,
      meta: {
        con_dibujo: 0,
        sin_dibujo: 0,
        reportes_filtrados: 0,
        total_filtrados: 0,
        samples: 0,
      },
    }
  }

  let maxCostoFiltro = 0
  for (const f of heatFeats) {
    const c = Number(f?.properties?.costo_directo) || 0
    if (c > maxCostoFiltro) maxCostoFiltro = c
  }

  const byRegistro = new Map()
  /** @type {Map<string, { weight: number, costo: number, props: object, registroIds: Set<string> }>} */
  const byReporte = new Map()
  const repIds = new Set()

  for (const f of heatFeats) {
    const p = f?.properties || {}
    const rid = p.id != null ? String(p.id) : null
    const repId = p.reporte_id != null ? String(p.reporte_id) : null
    const w = Number(p.weight)
    const weight = Number.isFinite(w) ? w : 0.05
    const costo = Number(p.costo_directo) || 0
    if (repId) repIds.add(repId)
    if (rid) {
      const prev = byRegistro.get(rid)
      if (!prev || weight >= prev.weight) {
        byRegistro.set(rid, { weight, costo, props: p })
      }
    }
    if (repId) {
      const prevR = byReporte.get(repId)
      if (!prevR) {
        byReporte.set(repId, {
          weight,
          costo,
          props: p,
          registroIds: new Set(rid ? [rid] : []),
        })
      } else {
        // Contenedor / varios registros del mismo reporte: sumar aportes.
        prevR.costo += costo
        prevR.weight = maxCostoFiltro > 0
          ? Math.min(1, prevR.costo / maxCostoFiltro)
          : Math.max(prevR.weight, weight)
        if (weight >= (Number(prevR.props?.weight) || 0)) prevR.props = p
        if (rid) prevR.registroIds.add(rid)
      }
    }
  }

  const regIds = idSet([...byRegistro.keys()])
  const matchedRegIds = new Set()
  const matchedRepIds = new Set()
  const dibujos = []
  const dibujosSeen = new Set()
  /** Reportes que ya tienen polígono/línea real → no expandir Point redundante */
  const repConGeomAreaOLinea = new Set()

  for (const f of allHuellas || []) {
    if (!f?.geometry) continue
    const p = f.properties || {}
    if (p.is_lod_marker === 1) continue
    const repId = p.reporte_id != null ? String(p.reporte_id) : ''
    const gt = f.geometry.type
    if (
      repId
      && (gt === 'Polygon' || gt === 'MultiPolygon' || gt === 'LineString' || gt === 'MultiLineString')
    ) {
      repConGeomAreaOLinea.add(repId)
    }
  }

  for (const f of allHuellas || []) {
    if (!f?.geometry) continue
    const p = f.properties || {}
    if (p.is_lod_marker === 1) continue

    const rid = p.registro_id != null
      ? String(p.registro_id)
      : (p.id != null ? String(p.id) : '')
    const repId = p.reporte_id != null ? String(p.reporte_id) : ''

    // Dibujo de cabecera del reporte: agregar por reporte (suma CD filtrado), no por un solo registro ancla.
    const esDibujoReporte = (p.origen === 'reporte_dibujo') || p.calor_agregado === 'suma_registros_filtrados'
    const matchByRep = repId && byReporte.has(repId) && (esDibujoReporte || !(rid && regIds.has(rid)))
    const matchByReg = !matchByRep && rid && regIds.has(rid)
    if (!matchByReg && !matchByRep) continue

    if (f.geometry.type === 'Point' && repId && repConGeomAreaOLinea.has(repId)) {
      if (matchByReg) matchedRegIds.add(rid)
      else if (matchByRep) {
        matchedRepIds.add(repId)
        const peers = byReporte.get(repId)?.registroIds
        if (peers) for (const peerId of peers) matchedRegIds.add(peerId)
      }
      continue
    }

    const info = matchByRep
      ? (byReporte.get(repId) || { weight: 0.05, costo: 0, props: {} })
      : (byRegistro.get(rid) || { weight: 0.05, costo: 0, props: {} })

    if (matchByReg) {
      matchedRegIds.add(rid)
    } else if (matchByRep) {
      matchedRepIds.add(repId)
      const peers = byReporte.get(repId)?.registroIds
      if (peers) {
        for (const peerId of peers) matchedRegIds.add(peerId)
      }
    }

    const norm = geometriaDibujoParaPlano(f.geometry, p)
    if (!norm) continue

    const geomKey = `${repId || rid}|${p.dibujo_parte ?? ''}|${norm.geometry.type}|${JSON.stringify(norm.geometry.coordinates)?.slice(0, 80)}`
    if (dibujosSeen.has(geomKey)) continue
    dibujosSeen.add(geomKey)

    const itemNumero = p.item_numero ?? info.props?.item_numero
    // Preferir suma agregada del conjunto filtrado (backend o byReporte) sobre un ancla suelto.
    const weight = matchByRep
      ? (Number(info.weight) > 0 ? Number(info.weight) : (Number(p.weight) > 0 ? Number(p.weight) : 0.05))
      : (Number(p.weight) > 0 ? Number(p.weight) : info.weight)
    const costo = matchByRep
      ? (Number(info.costo) > 0 ? Number(info.costo) : (Number(p.costo_directo) || 0))
      : (Number(p.costo_directo) > 0 ? Number(p.costo_directo) : info.costo)
    const colorItem = colorDibujoPorItems(itemNumero)

    const baseProps = {
      ...p,
      ...info.props,
      ...norm.propsExtra,
      weight,
      costo_directo: costo,
      item_numero: itemNumero,
      color: colorItem,
      color_item: colorItem,
      reporte_id: p.reporte_id ?? info.props?.reporte_id,
      registro_id: matchByReg
        ? (p.registro_id != null ? p.registro_id : (p.id != null ? p.id : rid))
        : (p.registro_id ?? info.props?.id),
      tiene_dibujo: 1,
      is_lod_marker: 0,
      color_mode: 'calor',
      sin_dibujo: 0,
    }
    dibujos.push({
      type: 'Feature',
      geometry: norm.geometry,
      properties: baseProps,
    })
  }

  const puntosSin = []
  for (const f of heatFeats) {
    const p = f?.properties || {}
    const rid = p.id != null ? String(p.id) : ''
    const repId = p.reporte_id != null ? String(p.reporte_id) : ''
    if (rid && matchedRegIds.has(rid)) continue
    if (repId && matchedRepIds.has(repId)) continue
    puntosSin.push({
      ...f,
      properties: {
        ...p,
        tiene_dibujo: 0,
        sin_dibujo: 1,
      },
    })
  }

  const calorSamplesFc = construirCalorSamplesFc(dibujos, puntosSin)

  return {
    dibujosFc: { type: 'FeatureCollection', features: dibujos },
    puntosSinDibujoFc: { type: 'FeatureCollection', features: puntosSin },
    calorSamplesFc,
    meta: {
      con_dibujo: dibujos.length,
      sin_dibujo: puntosSin.length,
      reportes_filtrados: repIds.size,
      total_filtrados: heatFeats.length,
      samples: calorSamplesFc.features.length,
    },
  }
}

export { weightColorExpr, EMPTY_FC as EMPTY_FC_CALOR, pointToCirclePolygon }
