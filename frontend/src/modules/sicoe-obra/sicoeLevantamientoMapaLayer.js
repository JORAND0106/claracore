/**
 * Capas Mapbox: puntos de levantamiento + geometría en dibujo.
 */
export const LEV_SRC = 'sicoe-levantamiento'
export const LEV_CIRCLE = 'sicoe-levantamiento-circle'
export const LEV_LABEL = 'sicoe-levantamiento-label'
export const LEV_DRAW_SRC = 'sicoe-levantamiento-draw'
export const LEV_DRAW_FILL = 'sicoe-levantamiento-draw-fill'
export const LEV_DRAW_LINE = 'sicoe-levantamiento-draw-line'
export const LEV_DRAW_PTS = 'sicoe-levantamiento-draw-pts'

const EMPTY = { type: 'FeatureCollection', features: [] }

export function removeLevantamientoLayers(map) {
  if (!map) return
  for (const id of [LEV_LABEL, LEV_CIRCLE, LEV_DRAW_FILL, LEV_DRAW_LINE, LEV_DRAW_PTS]) {
    try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* ignore */ }
  }
  for (const id of [LEV_SRC, LEV_DRAW_SRC]) {
    try { if (map.getSource(id)) map.removeSource(id) } catch { /* ignore */ }
  }
}

export function syncLevantamientoPuntosLayer(map, fc, visible) {
  if (!map) return
  if (!visible) {
    try {
      if (map.getLayer(LEV_LABEL)) map.removeLayer(LEV_LABEL)
      if (map.getLayer(LEV_CIRCLE)) map.removeLayer(LEV_CIRCLE)
      if (map.getSource(LEV_SRC)) map.removeSource(LEV_SRC)
    } catch { /* ignore */ }
    return
  }
  const data = fc?.type === 'FeatureCollection' ? fc : EMPTY
  try {
    const src = map.getSource(LEV_SRC)
    if (src) src.setData(data)
    else map.addSource(LEV_SRC, { type: 'geojson', data })

    if (!map.getLayer(LEV_CIRCLE)) {
      map.addLayer({
        id: LEV_CIRCLE,
        type: 'circle',
        source: LEV_SRC,
        paint: {
          'circle-radius': 5,
          'circle-color': '#C2410C',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
    if (!map.getLayer(LEV_LABEL)) {
      map.addLayer({
        id: LEV_LABEL,
        type: 'symbol',
        source: LEV_SRC,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-offset': [0, 1.05],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#9a3412',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      })
    }
  } catch { /* estilo aún no listo */ }
}

/**
 * @param {object} draft — { vertices: [{lng,lat}], geometriaTipo, lineStyle }
 */
export function draftToFeatureCollection(draft) {
  const verts = Array.isArray(draft?.vertices) ? draft.vertices : []
  const tipo = String(draft?.geometriaTipo || '').toLowerCase()
  const features = []
  if (verts.length) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'MultiPoint',
        coordinates: verts.map((v) => [v.lng, v.lat]),
      },
      properties: { role: 'vertices' },
    })
  }
  if (tipo === 'area' && verts.length >= 3) {
    const ring = verts.map((v) => [v.lng, v.lat])
    const a = ring[0]
    const b = ring[ring.length - 1]
    if (a[0] !== b[0] || a[1] !== b[1]) ring.push([...a])
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { role: 'shape', line_style: draft?.lineStyle || 'continua' },
    })
  } else if ((tipo === 'linea' || tipo === 'unir') && verts.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: verts.map((v) => [v.lng, v.lat]),
      },
      properties: { role: 'shape', line_style: draft?.lineStyle || 'continua' },
    })
  } else if (tipo === 'punto' && verts.length >= 1) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [verts[0].lng, verts[0].lat] },
      properties: { role: 'shape' },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function syncLevantamientoDrawLayer(map, draft, visible) {
  if (!map) return
  if (!visible) {
    try {
      if (map.getLayer(LEV_DRAW_FILL)) map.removeLayer(LEV_DRAW_FILL)
      if (map.getLayer(LEV_DRAW_LINE)) map.removeLayer(LEV_DRAW_LINE)
      if (map.getLayer(LEV_DRAW_PTS)) map.removeLayer(LEV_DRAW_PTS)
      if (map.getSource(LEV_DRAW_SRC)) map.removeSource(LEV_DRAW_SRC)
    } catch { /* ignore */ }
    return
  }
  const data = draftToFeatureCollection(draft)
  try {
    const src = map.getSource(LEV_DRAW_SRC)
    if (src) src.setData(data)
    else map.addSource(LEV_DRAW_SRC, { type: 'geojson', data })

    if (!map.getLayer(LEV_DRAW_FILL)) {
      map.addLayer({
        id: LEV_DRAW_FILL,
        type: 'fill',
        source: LEV_DRAW_SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': '#ea580c',
          'fill-opacity': 0.22,
        },
      })
    }
    if (!map.getLayer(LEV_DRAW_LINE)) {
      map.addLayer({
        id: LEV_DRAW_LINE,
        type: 'line',
        source: LEV_DRAW_SRC,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
        paint: {
          'line-color': '#c2410c',
          'line-width': 2.5,
        },
      })
    }
    if (!map.getLayer(LEV_DRAW_PTS)) {
      map.addLayer({
        id: LEV_DRAW_PTS,
        type: 'circle',
        source: LEV_DRAW_SRC,
        filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
        paint: {
          'circle-radius': 4,
          'circle-color': '#fff7ed',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#c2410c',
        },
      })
    }
  } catch { /* ignore */ }
}
