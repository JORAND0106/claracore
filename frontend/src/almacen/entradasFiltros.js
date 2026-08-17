import { countActiveFilters, includesTxt, inDateRange } from './almacenFiltrosShared.js'

export const EMPTY_ENTRADAS_FILTROS = {
  fecha_desde: '',
  fecha_hasta: '',
  tipo: '', // '' | recibo | disposicion
  remision: '',
  numero_oc: '',
  insumo: '',
  proveedor: '',
  usuario: '',
  pk_id: '',
  alerta_saldo: '', // '' | normal | naranja | rojo
}

export function countEntradasFiltrosActivos(filtros) {
  return countActiveFilters(filtros, EMPTY_ENTRADAS_FILTROS)
}

export function matchEntradaFiltros(row, filtros) {
  if (!filtros) return true
  const f = { ...EMPTY_ENTRADAS_FILTROS, ...filtros }

  if (!inDateRange(row?.fecha_entrada || row?.created_at, f.fecha_desde, f.fecha_hasta)) {
    return false
  }

  if (f.tipo) {
    const tipo = String(row?.tipo || 'recibo').toLowerCase()
    if (tipo !== f.tipo) return false
  }

  if (f.remision) {
    const rem = row?.numero_documento
      || (row?.remision_nombre ? 'remision' : '')
      || ''
    if (!includesTxt(rem, f.remision)) return false
  }

  if (f.numero_oc) {
    const oc = row?.almacen_orden_compra?.numero_oc
    if (oc == null || !includesTxt(String(oc), f.numero_oc)) return false
  }

  if (f.insumo) {
    const mat = row?.material_descripcion || row?.insumo_label || ''
    if (!includesTxt(mat, f.insumo)) return false
  }

  if (f.proveedor && !includesTxt(row?.proveedor_nombre, f.proveedor)) return false

  if (f.usuario && !includesTxt(row?.usuario_nombre, f.usuario)) return false

  if (f.pk_id) {
    const pk = row?.pk_id || row?.sector || ''
    if (!includesTxt(pk, f.pk_id)) return false
  }

  if (f.alerta_saldo) {
    const alerta = String(row?.alerta_saldo || 'normal').toLowerCase()
    if (alerta !== f.alerta_saldo) return false
  }

  return true
}

export function filterEntradasLista(lista, filtros) {
  if (!Array.isArray(lista)) return []
  if (!countEntradasFiltrosActivos(filtros)) return lista
  return lista.filter((r) => matchEntradaFiltros(r, filtros))
}
