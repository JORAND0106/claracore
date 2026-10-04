/**
 * Capas Mapbox de dibujos de referencia (otros reportes con mismos ítems).
 * Solo lectura: estilo distinto al dibujo en curso; clic → propiedades.
 */
export const ESQUEMA_DIBUJO_REFS_SOURCE = 'esquema-dibujo-refs'
export const ESQUEMA_DIBUJO_REFS_FILL = 'esquema-dibujo-refs-fill'
export const ESQUEMA_DIBUJO_REFS_LINE = 'esquema-dibujo-refs-line'
export const ESQUEMA_DIBUJO_REFS_POINT = 'esquema-dibujo-refs-point'
export const ESQUEMA_DIBUJO_REFS_LABEL = 'esquema-dibujo-refs-label'

/** Color de referencia: pizarra / índigo suave, distinto del dibujo editable. */
export const ESQUEMA_DIBUJO_REFS_COLOR = '#64748b'
export const ESQUEMA_DIBUJO_REFS_FILL_OPACITY = 0.22
export const ESQUEMA_DIBUJO_REFS_LINE_OPACITY = 0.85

/**
 * Convierte la lista de referencias del API en un FeatureCollection
 * con propiedades de reporte en cada feature.
 * @param {Array<{reporte_id:number, numero_reporte?:any, items?:string[], costo_directo?:number, dibujo_geojson?:object}>} referencias
 */
export function buildDibujoReferenciasFeatureCollection(referencias) {
  const features = []
  for (const ref of referencias || []) {
    if (!ref || ref.dibujo_geojson == null) continue
    const dg = ref.dibujo_geojson
    let feats = []
    if (dg?.type === 'FeatureCollection') {
      feats = Array.isArray(dg.features) ? dg.features : []
    } else if (dg?.type === 'Feature') {
      feats = [dg]
    } else if (dg?.type && dg?.coordinates) {
      feats = [{ type: 'Feature', geometry: dg, properties: {} }]
    }
    const baseProps = {
      ref_reporte_id: ref.reporte_id,
      ref_numero_reporte: ref.numero_reporte ?? null,
      ref_items: Array.isArray(ref.items) ? ref.items.join(', ') : '',
      ref_costo_directo: ref.costo_directo ?? 0,
      ref_readonly: 1,
    }
    for (const f of feats) {
      if (!f || !f.geometry) continue
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          ...(f.properties && typeof f.properties === 'object' ? f.properties : {}),
          ...baseProps,
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

/**
 * @param {import('mapbox-gl').Map} map
 * @param {GeoJSON.FeatureCollection} fc
 */
export function ensureEsquemaDibujoReferenciasLayers(map, fc) {
  if (!map) return
  const data = fc && fc.type === 'FeatureCollection'
    ? fc
    : { type: 'FeatureCollection', features: [] }
  try {
    const src = map.getSource(ESQUEMA_DIBUJO_REFS_SOURCE)
    if (src) {
      src.setData(data)
    } else {
      map.addSource(ESQUEMA_DIBUJO_REFS_SOURCE, { type: 'geojson', data })
    }
  } catch {
    return
  }

  const addIfMissing = (id, layer) => {
    try {
      if (!map.getLayer(id)) map.addLayer(layer)
    } catch { /* ignore */ }
  }

  addIfMissing(ESQUEMA_DIBUJO_REFS_FILL, {
    id: ESQUEMA_DIBUJO_REFS_FILL,
    type: 'fill',
    source: ESQUEMA_DIBUJO_REFS_SOURCE,
    filter: [
      'any',
      ['==', ['geometry-type'], 'Polygon'],
      ['==', ['geometry-type'], 'MultiPolygon'],
    ],
    paint: {
      'fill-color': ESQUEMA_DIBUJO_REFS_COLOR,
      'fill-opacity': ESQUEMA_DIBUJO_REFS_FILL_OPACITY,
    },
  })

  addIfMissing(ESQUEMA_DIBUJO_REFS_LINE, {
    id: ESQUEMA_DIBUJO_REFS_LINE,
    type: 'line',
    source: ESQUEMA_DIBUJO_REFS_SOURCE,
    filter: [
      'any',
      ['==', ['geometry-type'], 'LineString'],
      ['==', ['geometry-type'], 'MultiLineString'],
      ['==', ['geometry-type'], 'Polygon'],
      ['==', ['geometry-type'], 'MultiPolygon'],
    ],
    paint: {
      'line-color': ESQUEMA_DIBUJO_REFS_COLOR,
      'line-width': 2.2,
      'line-opacity': ESQUEMA_DIBUJO_REFS_LINE_OPACITY,
      'line-dasharray': [2, 1.5],
    },
  })

  addIfMissing(ESQUEMA_DIBUJO_REFS_POINT, {
    id: ESQUEMA_DIBUJO_REFS_POINT,
    type: 'circle',
    source: ESQUEMA_DIBUJO_REFS_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': ESQUEMA_DIBUJO_REFS_COLOR,
      'circle-opacity': 0.75,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  })

  addIfMissing(ESQUEMA_DIBUJO_REFS_LABEL, {
    id: ESQUEMA_DIBUJO_REFS_LABEL,
    type: 'symbol',
    source: ESQUEMA_DIBUJO_REFS_SOURCE,
    layout: {
      'text-field': ['concat', '#', ['to-string', ['get', 'ref_numero_reporte']]],
      'text-size': 11,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': ESQUEMA_DIBUJO_REFS_COLOR,
      'text-halo-color': '#fff',
      'text-halo-width': 1.2,
    },
  })
}

const REF_LAYER_IDS = [
  ESQUEMA_DIBUJO_REFS_FILL,
  ESQUEMA_DIBUJO_REFS_LINE,
  ESQUEMA_DIBUJO_REFS_POINT,
]

/**
 * @param {import('mapbox-gl').Map} map
 * @param {(info: object|null) => void} onSelect
 * @returns {() => void} unbind
 */
export function bindEsquemaDibujoReferenciasClick(map, onSelect) {
  if (!map || typeof onSelect !== 'function') return () => {}
  const pick = (e) => {
    const f = e?.features?.[0]
    if (!f) return
    const p = f.properties || {}
    const rid = p.ref_reporte_id
    if (rid == null || rid === '') return
    onSelect({
      reporte_id: Number(rid),
      numero_reporte: p.ref_numero_reporte,
      items: String(p.ref_items || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      costo_directo: Number(p.ref_costo_directo) || 0,
    })
  }
  const enter = () => {
    try { map.getCanvas().style.cursor = 'pointer' } catch { /* ignore */ }
  }
  const leave = () => {
    try { map.getCanvas().style.cursor = '' } catch { /* ignore */ }
  }
  for (const id of REF_LAYER_IDS) {
    try {
      if (map.getLayer(id)) {
        map.on('click', id, pick)
        map.on('mouseenter', id, enter)
        map.on('mouseleave', id, leave)
      }
    } catch { /* ignore */ }
  }
  return () => {
    for (const id of REF_LAYER_IDS) {
      try { map.off('click', id, pick) } catch { /* ignore */ }
      try { map.off('mouseenter', id, enter) } catch { /* ignore */ }
      try { map.off('mouseleave', id, leave) } catch { /* ignore */ }
    }
  }
}

/**
 * Consulta referencias bajo un punto de pantalla (p. ej. clic en canvas vacío).
 * @param {import('mapbox-gl').Map} map
 * @param {{x:number,y:number}} point
 */
export function queryDibujoReferenciaAtPoint(map, point) {
  if (!map || !point) return null
  try {
    const layers = REF_LAYER_IDS.filter((id) => {
      try { return !!map.getLayer(id) } catch { return false }
    })
    if (!layers.length) return null
    const feats = map.queryRenderedFeatures([point.x, point.y], { layers })
    const f = feats?.[0]
    if (!f) return null
    const p = f.properties || {}
    if (p.ref_reporte_id == null || p.ref_reporte_id === '') return null
    return {
      reporte_id: Number(p.ref_reporte_id),
      numero_reporte: p.ref_numero_reporte,
      items: String(p.ref_items || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      costo_directo: Number(p.ref_costo_directo) || 0,
    }
  } catch {
    return null
  }
}
