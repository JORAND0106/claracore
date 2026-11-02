import { countActiveFilters, includesTxt, inDateRange, normTxt } from './almacenFiltrosShared.js'

export const EMPTY_SALIDAS_FILTROS = {
  fecha_desde: '',
  fecha_hasta: '',
  pk_id: '',
  material: '',
  numero_oc: '',
  receptor: '',
  despachador: '',
  con_devolucion: '', // '' | 'si' | 'no'
  numero_salida: '',
  por_revisar: '', // '' | 'si' | 'no'
  q: '', // búsqueda por palabra clave (historial popup)
}

export function countSalidasFiltrosActivos(filtros) {
  return countActiveFilters(filtros, EMPTY_SALIDAS_FILTROS)
}

function textoNumeroSalida(row) {
  const parts = [
    row?.codigo,
    row?.numero_salida != null ? String(row.numero_salida) : '',
    row?.id != null ? String(row.id) : '',
  ]
  return parts.filter(Boolean).join(' ')
}

export function matchSalidaFiltros(row, filtros) {
  if (!filtros) return true
  const f = { ...EMPTY_SALIDAS_FILTROS, ...filtros }

  if (!inDateRange(row?.fecha_hora_salida || row?.created_at, f.fecha_desde, f.fecha_hasta)) {
    return false
  }

  if (f.pk_id && !includesTxt(row?.pk_id, f.pk_id)) return false

  if (f.material && !includesTxt(row?.material_descripcion, f.material)) return false

  if (f.numero_oc) {
    if (row?.numero_oc == null || !includesTxt(String(row.numero_oc), f.numero_oc)) return false
  }

  if (f.receptor && !includesTxt(row?.receptor_nombre, f.receptor)) return false

  if (f.despachador && !includesTxt(row?.despachador_nombre, f.despachador)) return false

  const devuelta = Number(row?.cantidad_devuelta) || 0
  const tieneDev = devuelta > 1e-9
  if (f.con_devolucion === 'si' && !tieneDev) return false
  if (f.con_devolucion === 'no' && tieneDev) return false

  if (f.numero_salida && !includesTxt(textoNumeroSalida(row), f.numero_salida)) return false

  if (f.por_revisar === 'si') {
    if (!row?.por_revisar) return false
  } else if (f.por_revisar === 'no') {
    if (row?.por_revisar) return false
  }

  if (f.q) {
    const blob = normTxt([
      textoNumeroSalida(row),
      row?.pk_id,
      row?.material_descripcion,
      row?.numero_oc,
      row?.receptor_nombre,
      row?.despachador_nombre,
      row?.por_revisar_motivos,
      row?.observaciones,
    ].filter(Boolean).join(' '))
    const terms = normTxt(f.q).split(/\s+/).filter(Boolean)
    if (terms.some((t) => !blob.includes(t))) return false
  }

  return true
}

export function filterSalidasLista(lista, filtros) {
  if (!Array.isArray(lista)) return []
  if (!countSalidasFiltrosActivos(filtros)) return lista
  return lista.filter((r) => matchSalidaFiltros(r, filtros))
}
