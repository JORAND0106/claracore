/** Filtro Mapbox: abscisas en Point / MultiPoint con etiqueta no vacía. */
export const FILTER_MAPBOX_LABEL_ABSCISA = [
  'all',
  ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
  ['>', ['length', ['to-string', ['coalesce', ['get', 'etiqueta'], ['get', 'Etiqueta'], '']]], 0],
]

/** Etiquetas: fuente Regular y tamaño que escala con el zoom. */
export function mapboxPlanoSymbolLayout(textField, isMini = false) {
  const stops = isMini
    ? [10, 11, 12, 13, 15, 16, 18, 20]
    : [11, 14, 14, 20, 17, 28, 20, 36]
  return {
    'text-field': textField,
    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
    'text-size': ['interpolate', ['linear'], ['zoom'], ...stops],
    'text-anchor': 'center',
    'text-allow-overlap': false,
    'text-ignore-placement': false,
  }
}

export const MAPBOX_PLANO_PAINT_LABELS = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(0,0,0,0.75)',
  'text-halo-width': 1.5,
}

export const MAPBOX_ABSCISA_TEXT_FIELD = [
  'coalesce',
  ['get', 'etiqueta'],
  ['get', 'Etiqueta'],
  ['get', 'Layer'],
  ['get', 'Name'],
]
