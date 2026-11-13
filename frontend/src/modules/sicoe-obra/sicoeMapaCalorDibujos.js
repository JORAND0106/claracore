/**
 * Une puntos del mapa de calor (filtro activo) con huellas/dibujos del contrato.
 *
 * Preferencia de match:
 * 1) registro_id (huella por ítem)
 * 2) reporte_id (dibujo del botón Dibujar en la cabecera del reporte)
 *
 * Solo deja dibujos de registros/reportes filtrados; el resto aparece como punto sin dibujo.
 */

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

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

function centroidePolygon(geom) {
  const ring = geom?.coordinates?.[0]
  if (!Array.isArray(ring) || !ring.length) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    sx += Number(pt[0])
    sy += Number(pt[1])
    n += 1
  }
  if (!n) return null
  return [sx / n, sy / n]
}

function pushLodSiNodo(dibujos, f, baseProps) {
  const ht = String(baseProps.huella_tipo || baseProps.dibujo_tipo || '').toLowerCase()
  if ((ht === 'nodo' || ht === 'punto') && f.geometry?.type === 'Polygon') {
    const center = centroidePolygon(f.geometry)
    if (center) {
      dibujos.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: center },
        properties: {
          ...baseProps,
          is_lod_marker: 1,
        },
      })
    }
  } else if ((ht === 'nodo' || ht === 'punto') && f.geometry?.type === 'Point') {
    const last = dibujos[dibujos.length - 1]
    if (last) {
      dibujos[dibujos.length - 1] = {
        ...last,
        properties: {
          ...last.properties,
          is_lod_marker: 1,
        },
      }
    }
  }
}

/**
 * @param {object} heatFc FeatureCollection de puntos del mapa de calor (ya filtrados)
 * @param {object[]} allHuellas features de /huellas o de analisis.dibujos
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

    // Evitar duplicar la misma geometría del reporte si llega por huella + dibujo
    const geomKey = `${repId || rid}|${p.dibujo_parte ?? ''}|${f.geometry?.type}|${JSON.stringify(f.geometry?.coordinates)?.slice(0, 80)}`
    if (dibujosSeen.has(geomKey)) continue
    dibujosSeen.add(geomKey)

    const baseProps = {
      ...p,
      ...info.props,
      weight: Number(p.weight) > 0 ? Number(p.weight) : info.weight,
      costo_directo: Number(p.costo_directo) > 0 ? Number(p.costo_directo) : info.costo,
      reporte_id: p.reporte_id ?? info.props?.reporte_id,
      // Conservar tipo original (número) del huella/dibujo cuando exista
      registro_id: matchByReg
        ? (p.registro_id != null ? p.registro_id : (p.id != null ? p.id : rid))
        : (p.registro_id ?? info.props?.id),
      tiene_dibujo: 1,
      is_lod_marker: 0,
      color_mode: 'calor',
      sin_dibujo: 0,
    }
    dibujos.push({
      ...f,
      properties: baseProps,
    })
    pushLodSiNodo(dibujos, f, baseProps)
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

  // Contar dibujos “reales” (sin LOD markers)
  const nDibujos = dibujos.filter((f) => f?.properties?.is_lod_marker !== 1).length

  return {
    dibujosFc: { type: 'FeatureCollection', features: dibujos },
    puntosSinDibujoFc: { type: 'FeatureCollection', features: puntosSin },
    meta: {
      con_dibujo: nDibujos,
      sin_dibujo: puntosSin.length,
      reportes_filtrados: repIds.size,
      total_filtrados: heatFeats.length,
    },
  }
}

export { weightColorExpr, EMPTY_FC as EMPTY_FC_CALOR }
