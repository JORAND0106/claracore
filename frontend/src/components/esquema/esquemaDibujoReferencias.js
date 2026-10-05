/**
 * Capas Mapbox de dibujos de referencia (otros reportes con mismos ítems).
 * Solo lectura: estilo distinto al dibujo en curso; clic → propiedades.
 * Preferimos geometría detallada desde dibujo_escena (forma real de entidades).
 */
import { esquemaEscenaToDetalleGeojson } from '../../modules/sicoe-obra/sicoeDibujoEscenaGeojson.js'
import { colorDibujoPorItems, SICOE_ITEM_COLOR_NEUTRO } from '../../modules/sicoe-obra/sicoeItemColores.js'

export const ESQUEMA_DIBUJO_REFS_SOURCE = 'esquema-dibujo-refs'
export const ESQUEMA_DIBUJO_REFS_FILL = 'esquema-dibujo-refs-fill'
export const ESQUEMA_DIBUJO_REFS_LINE = 'esquema-dibujo-refs-line'
export const ESQUEMA_DIBUJO_REFS_POINT = 'esquema-dibujo-refs-point'
export const ESQUEMA_DIBUJO_REFS_LABEL = 'esquema-dibujo-refs-label'

/** Color de referencia neutro (varios ítems o sin ítem). */
export const ESQUEMA_DIBUJO_REFS_COLOR = SICOE_ITEM_COLOR_NEUTRO
export const ESQUEMA_DIBUJO_REFS_FILL_OPACITY = 0.22
export const ESQUEMA_DIBUJO_REFS_LINE_OPACITY = 0.85

function featuresFromGeojson(dg) {
  if (dg == null) return []
  if (dg?.type === 'FeatureCollection') {
    return Array.isArray(dg.features) ? dg.features : []
  }
  if (dg?.type === 'Feature') return [dg]
  if (dg?.type && dg?.coordinates) {
    return [{ type: 'Feature', geometry: dg, properties: {} }]
  }
  return []
}

/**
 * GeoJSON de visualización para una referencia: escena detallada si existe,
 * si no el dibujo_geojson persistido.
 */
export function geojsonParaReferencia(ref) {
  if (!ref) return { type: 'FeatureCollection', features: [] }
  const escena = ref.dibujo_escena
  if (escena && typeof escena === 'object') {
    const detailed = esquemaEscenaToDetalleGeojson(escena, {
      reporteId: ref.reporte_id,
      dibujoTipo: escena.dibujo_tipo,
    })
    if (Array.isArray(detailed?.features) && detailed.features.length) {
      return detailed
    }
  }
  return {
    type: 'FeatureCollection',
    features: featuresFromGeojson(ref.dibujo_geojson),
  }
}

/**
 * Convierte la lista de referencias del API en un FeatureCollection
 * con propiedades de reporte en cada feature.
 * @param {Array<object>} referencias
 */
export function buildDibujoReferenciasFeatureCollection(referencias) {
  const features = []
  for (const ref of referencias || []) {
    if (!ref) continue
    const dg = geojsonParaReferencia(ref)
    const feats = featuresFromGeojson(dg)
    const regs = Array.isArray(ref.registros) ? ref.registros : []
    const items = Array.isArray(ref.items) && ref.items.length
      ? ref.items
      : regs.map((r) => r?.item_numero).filter(Boolean)
    const refColor = colorDibujoPorItems(items)
    const baseProps = {
      ref_reporte_id: ref.reporte_id,
      ref_numero_reporte: ref.numero_reporte ?? null,
      ref_items: Array.isArray(items) ? items.join(', ') : '',
      ref_item_color: refColor,
      ref_costo_directo: ref.costo_directo ?? 0,
      ref_registros_json: JSON.stringify(regs),
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

function parseRegistrosProp(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function infoFromReferenciaFeatureProps(p) {
  if (!p || p.ref_reporte_id == null || p.ref_reporte_id === '') return null
  return {
    reporte_id: Number(p.ref_reporte_id),
    numero_reporte: p.ref_numero_reporte,
    items: String(p.ref_items || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    costo_directo: Number(p.ref_costo_directo) || 0,
    registros: parseRegistrosProp(p.ref_registros_json),
  }
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
      'fill-color': ['coalesce', ['get', 'ref_item_color'], ESQUEMA_DIBUJO_REFS_COLOR],
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
      'line-color': ['coalesce', ['get', 'ref_item_color'], ESQUEMA_DIBUJO_REFS_COLOR],
      'line-width': 1.8,
      'line-opacity': ESQUEMA_DIBUJO_REFS_LINE_OPACITY,
      'line-dasharray': [2.2, 1.8],
    },
  })

  addIfMissing(ESQUEMA_DIBUJO_REFS_POINT, {
    id: ESQUEMA_DIBUJO_REFS_POINT,
    type: 'circle',
    source: ESQUEMA_DIBUJO_REFS_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5.5,
      'circle-color': ['coalesce', ['get', 'ref_item_color'], ESQUEMA_DIBUJO_REFS_COLOR],
      'circle-opacity': 0.7,
      'circle-stroke-width': 1.2,
      'circle-stroke-color': '#fff',
    },
  })

  addIfMissing(ESQUEMA_DIBUJO_REFS_LABEL, {
    id: ESQUEMA_DIBUJO_REFS_LABEL,
    type: 'symbol',
    source: ESQUEMA_DIBUJO_REFS_SOURCE,
    layout: {
      'text-field': ['concat', '#', ['to-string', ['get', 'ref_numero_reporte']]],
      'text-size': 10,
      'text-offset': [0, 1.15],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': ['coalesce', ['get', 'ref_item_color'], ESQUEMA_DIBUJO_REFS_COLOR],
      'text-halo-color': '#fff',
      'text-halo-width': 1.1,
      'text-opacity': 0.9,
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
  const pickAt = (point) => {
    const info = queryDibujoReferenciaAtPoint(map, point, { pad: 10 })
    if (info) onSelect(info)
  }
  const onClick = (e) => {
    // Preferir features del evento (capa) y, si no, consulta con tolerancia.
    const f = e?.features?.[0]
    if (f) {
      const info = infoFromReferenciaFeatureProps(f.properties || {})
      if (info) {
        onSelect(info)
        return
      }
    }
    const pt = e?.point
    if (pt) pickAt({ x: pt.x, y: pt.y })
  }
  const enter = () => {
    try { map.getCanvas().style.cursor = 'pointer' } catch { /* ignore */ }
  }
  const leave = () => {
    try { map.getCanvas().style.cursor = '' } catch { /* ignore */ }
  }
  // Clic general del mapa (cubre líneas finas vía query con pad).
  try { map.on('click', onClick) } catch { /* ignore */ }
  for (const id of REF_LAYER_IDS) {
    try {
      if (map.getLayer(id)) {
        map.on('mouseenter', id, enter)
        map.on('mouseleave', id, leave)
      }
    } catch { /* ignore */ }
  }
  return () => {
    try { map.off('click', onClick) } catch { /* ignore */ }
    for (const id of REF_LAYER_IDS) {
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
export function queryDibujoReferenciaAtPoint(map, point, { pad = 8 } = {}) {
  if (!map || !point) return null
  try {
    const layers = REF_LAYER_IDS.filter((id) => {
      try { return !!map.getLayer(id) } catch { return false }
    })
    if (!layers.length) return null
    const x = Number(point.x)
    const y = Number(point.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    const p = Math.max(0, Number(pad) || 0)
    const geometry = p > 0
      ? [
        [x - p, y - p],
        [x + p, y + p],
      ]
      : [x, y]
    const feats = map.queryRenderedFeatures(geometry, { layers })
    const f = feats?.[0]
    if (!f) return null
    return infoFromReferenciaFeatureProps(f.properties || {})
  } catch {
    return null
  }
}
