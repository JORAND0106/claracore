/**
 * Une puntos del mapa de calor (filtro activo) con huellas/dibujos del contrato.
 * Solo deja dibujos de registros filtrados; el resto aparece como punto sin dibujo.
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

/**
 * @param {object} heatFc FeatureCollection de puntos del mapa de calor (ya filtrados)
 * @param {object[]} allHuellas features de /huellas del contrato
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
  const repIds = new Set()

  for (const f of heatFeats) {
    const p = f?.properties || {}
    const rid = p.id != null ? String(p.id) : null
    const repId = p.reporte_id != null ? String(p.reporte_id) : null
    const w = Number(p.weight)
    const weight = Number.isFinite(w) ? w : 0.05
    const costo = Number(p.costo_directo) || 0
    if (repId) repIds.add(repId)
    if (!rid) continue
    const prev = byRegistro.get(rid)
    if (!prev || weight >= prev.weight) {
      byRegistro.set(rid, { weight, costo, props: p })
    }
  }

  const regIds = idSet([...byRegistro.keys()])
  const matchedRegIds = new Set()
  const dibujos = []

  for (const f of allHuellas || []) {
    if (!f?.geometry) continue
    const p = f.properties || {}
    if (p.is_lod_marker === 1) continue
    const rid = p.registro_id != null
      ? String(p.registro_id)
      : (p.id != null ? String(p.id) : '')
    if (!rid || !regIds.has(rid)) continue

    const info = byRegistro.get(rid) || { weight: 0.05, costo: 0, props: {} }
    matchedRegIds.add(rid)

    const ht = String(p.huella_tipo || p.dibujo_tipo || '').toLowerCase()
    const baseProps = {
      ...p,
      ...info.props,
      weight: info.weight,
      costo_directo: info.costo,
      tiene_dibujo: 1,
      is_lod_marker: 0,
      color_mode: 'calor',
      sin_dibujo: 0,
    }
    dibujos.push({
      ...f,
      properties: baseProps,
    })

    // Marcador LOD para nodos dibujados (mismo criterio que el mapa)
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
      dibujos[dibujos.length - 1] = {
        ...dibujos[dibujos.length - 1],
        properties: {
          ...dibujos[dibujos.length - 1].properties,
          is_lod_marker: 1,
        },
      }
    }
  }

  const puntosSin = []
  for (const f of heatFeats) {
    const p = f?.properties || {}
    const rid = p.id != null ? String(p.id) : ''
    if (rid && matchedRegIds.has(rid)) continue
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
