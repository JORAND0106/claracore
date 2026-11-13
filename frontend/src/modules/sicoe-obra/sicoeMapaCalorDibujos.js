/**
 * Une puntos del mapa de calor (filtro activo) con huellas/dibujos del contrato.
 *
 * Preferencia de match:
 * 1) registro_id (huella por ítem)
 * 2) reporte_id (dibujo del botón Dibujar en la cabecera del reporte)
 *
 * ClaraGIS pinta el dibujo REAL (entidad / línea / polígono). No convierte
 * reportes con dibujo en marcadores LOD ni en puntos GPS.
 */

import { colorDibujoPorItems } from './sicoeItemColores.js'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

/** Radio visual (m) cuando el dibujo solo trae un Point sin polígono de entidad. */
const RADIO_PUNTO_DIBUJO_M = 5

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

function pointToCirclePolygon(coords, radiusM = RADIO_PUNTO_DIBUJO_M) {
  if (!Array.isArray(coords) || coords.length < 2) return null
  const lng = Number(coords[0])
  const lat = Number(coords[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const dLat = radiusM / 111320
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dLng = radiusM / (111320 * (Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat))
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
 * - Point: disco pequeño (nunca marcador LOD)
 */
export function geometriaDibujoParaPlano(geom, props = {}) {
  if (!geom || !geom.type) return null
  if (geom.type === 'Point') {
    const poly = pointToCirclePolygon(geom.coordinates)
    if (!poly) return null
    return {
      geometry: poly,
      propsExtra: {
        huella_tipo: props.huella_tipo || props.dibujo_tipo || 'nodo',
        dibujo_tipo: props.dibujo_tipo || props.huella_tipo || 'nodo',
        geometria_origen: 'point_expandido',
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

/**
 * @param {object} heatFc FeatureCollection de puntos del mapa de calor (ya filtrados)
 * @param {object[]} allHuellas features de analisis.dibujos (o /huellas)
 * @returns {{ dibujosFc, puntosSinDibujoFc, meta }}
 */
export function construirCalorSobreDibujos(heatFc, allHuellas) {
  const heatFeats = Array.isArray(heatFc?.features) ? heatFc.features : []
  if (!heatFeats.length) {
    return {
      dibujosFc: EMPTY_FC,
      puntosSinDibujoFc: EMPTY_FC,
      meta: {
        con_dibujo: 0,
        sin_dibujo: 0,
        reportes_filtrados: 0,
        total_filtrados: 0,
      },
    }
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
        if (weight >= prevR.weight) {
          prevR.weight = weight
          prevR.costo = Math.max(prevR.costo, costo)
          prevR.props = p
        } else {
          prevR.costo = Math.max(prevR.costo, costo)
        }
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

  // Primera pasada: detectar polígonos/líneas por reporte
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

    const matchByReg = rid && regIds.has(rid)
    const matchByRep = !matchByReg && repId && byReporte.has(repId)
    if (!matchByReg && !matchByRep) continue

    // Si el reporte ya trae entidad/línea/polígono, omitir Point GPS del mismo FC
    if (f.geometry.type === 'Point' && repId && repConGeomAreaOLinea.has(repId)) {
      if (matchByReg) matchedRegIds.add(rid)
      else if (matchByRep) {
        matchedRepIds.add(repId)
        const peers = byReporte.get(repId)?.registroIds
        if (peers) for (const peerId of peers) matchedRegIds.add(peerId)
      }
      continue
    }

    const info = matchByReg
      ? (byRegistro.get(rid) || { weight: 0.05, costo: 0, props: {} })
      : (byReporte.get(repId) || { weight: 0.05, costo: 0, props: {} })

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
    const weight = Number(p.weight) > 0 ? Number(p.weight) : info.weight
    const costo = Number(p.costo_directo) > 0 ? Number(p.costo_directo) : info.costo
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

  return {
    dibujosFc: { type: 'FeatureCollection', features: dibujos },
    puntosSinDibujoFc: { type: 'FeatureCollection', features: puntosSin },
    meta: {
      con_dibujo: dibujos.length,
      sin_dibujo: puntosSin.length,
      reportes_filtrados: repIds.size,
      total_filtrados: heatFeats.length,
    },
  }
}

export { weightColorExpr, EMPTY_FC as EMPTY_FC_CALOR, pointToCirclePolygon }
