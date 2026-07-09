/** Etiqueta de abscisa como string (properties del plano). */
const ETIQUETA_ABSCISA_EXPR = [
  'to-string',
  ['coalesce', ['get', 'etiqueta'], ['get', 'Etiqueta'], ''],
]

/** Point / MultiPoint con etiqueta no vacía. Solo expresiones básicas (fiables en filter). */
const FILTER_ABSCISA_BASE = [
  ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
  ['>', ['length', ETIQUETA_ABSCISA_EXPR], 0],
]

/**
 * Densidad por subcadena en «K+MMM.mm» (sin index-of/slice/% — tumba addLayer si falla).
 * 1 km  → …+000…
 * 200 m → …+000|200|400|600|800…
 * 50 m  → todas
 */
function filterAbscisaPorPaso(metros) {
  if (metros >= 1000) {
    return ['all', ...FILTER_ABSCISA_BASE, ['in', '+000', ETIQUETA_ABSCISA_EXPR]]
  }
  if (metros >= 200) {
    return [
      'all',
      ...FILTER_ABSCISA_BASE,
      [
        'any',
        ['in', '+000', ETIQUETA_ABSCISA_EXPR],
        ['in', '+200', ETIQUETA_ABSCISA_EXPR],
        ['in', '+400', ETIQUETA_ABSCISA_EXPR],
        ['in', '+600', ETIQUETA_ABSCISA_EXPR],
        ['in', '+800', ETIQUETA_ABSCISA_EXPR],
      ],
    ]
  }
  return ['all', ...FILTER_ABSCISA_BASE]
}

/** Compat: todas las abscisas con etiqueta. */
export const FILTER_MAPBOX_LABEL_ABSCISA = filterAbscisaPorPaso(50)

/**
 * Bandas de densidad (minzoom inclusivo, maxzoom exclusivo):
 *   z < 14  → 1000 m
 *   14–16   → 200 m
 *   z ≥ 16  → 50 m
 */
export const MAPBOX_ABSCISA_ZOOM_BANDS = [
  { suffix: '1km', minzoom: 0, maxzoom: 14, metros: 1000 },
  { suffix: '200m', minzoom: 14, maxzoom: 16, metros: 200 },
  { suffix: '50m', minzoom: 16, maxzoom: 24, metros: 50 },
]

/** Añade 3 capas symbol de abscisa con densidad progresiva. */
export function addMapboxAbscisaLabelLayers(map, { idPrefix, source, layout, paint }) {
  for (const band of MAPBOX_ABSCISA_ZOOM_BANDS) {
    const id = `${idPrefix}-${band.suffix}`
    if (map.getLayer(id)) continue
    map.addLayer({
      id,
      type: 'symbol',
      source,
      minzoom: band.minzoom,
      maxzoom: band.maxzoom,
      filter: filterAbscisaPorPaso(band.metros),
      layout,
      paint,
    })
  }
}

/** visibility de las 3 bandas de un idPrefix. */
export function setMapboxAbscisaLabelsVisibility(map, idPrefix, visible) {
  const v = visible ? 'visible' : 'none'
  for (const band of MAPBOX_ABSCISA_ZOOM_BANDS) {
    const id = `${idPrefix}-${band.suffix}`
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
  }
}

/** text-size: PK_ID y abscisado (legible sobre polígono claro). */
const TEXT_SIZE_POR_ZOOM = ['interpolate', ['linear'], ['zoom'], 12, 11, 14, 13, 16, 15, 18, 17]

/** Etiquetas: Bold + tamaño por zoom (PK y abscisa). */
export function mapboxPlanoSymbolLayout(textField, _isMini = false) {
  return {
    'text-field': textField,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-size': TEXT_SIZE_POR_ZOOM,
    'text-anchor': 'center',
    'text-allow-overlap': false,
    'text-ignore-placement': false,
  }
}

/** Texto oscuro + halo blanco grueso: contraste sobre fill azul claro / basemap light. */
export const MAPBOX_PLANO_PAINT_LABELS = {
  'text-color': '#0f172a',
  'text-halo-color': '#ffffff',
  'text-halo-width': 2.5,
  'text-halo-blur': 0.5,
}

export const MAPBOX_ABSCISA_TEXT_FIELD = [
  'coalesce',
  ['get', 'etiqueta'],
  ['get', 'Etiqueta'],
  ['get', 'Layer'],
  ['get', 'Name'],
]
