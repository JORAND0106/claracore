import { countActiveFilters, includesTxt, inDateRange, normTxt } from './almacenFiltrosShared.js'

export const EMPTY_SOLICITUDES_FILTROS = {
  fecha_desde: '',
  fecha_hasta: '',
  estado: '',
  solicitante: '',
  titulo: '',
  con_oc: '', // '' | 'si' | 'no'
  numero_oc: '',
}

function solicitudTieneOc(sol) {
  return Boolean(sol?.tiene_orden_compra || sol?.orden_compra?.id)
}

export function countSolicitudesFiltrosActivos(filtros) {
  return countActiveFilters(filtros, EMPTY_SOLICITUDES_FILTROS)
}

export function matchSolicitudFiltros(sol, filtros) {
  if (!filtros) return true
  const f = { ...EMPTY_SOLICITUDES_FILTROS, ...filtros }

  if (!inDateRange(sol?.created_at, f.fecha_desde, f.fecha_hasta)) return false

  if (f.estado && String(sol?.estado || '') !== f.estado) return false

  if (f.solicitante && !includesTxt(sol?.solicitante_nombre, f.solicitante)) return false

  const titulo = sol?.titulo?.trim() || `Solicitud #${sol?.consecutivo ?? ''}`
  if (f.titulo && !includesTxt(titulo, f.titulo)) return false

  const tieneOc = solicitudTieneOc(sol)
  if (f.con_oc === 'si' && !tieneOc) return false
  if (f.con_oc === 'no' && tieneOc) return false

  if (f.numero_oc) {
    const num = sol?.orden_compra?.numero_oc
    if (num == null || !includesTxt(String(num), f.numero_oc)) return false
  }

  return true
}

export function filterSolicitudesLista(lista, filtros) {
  if (!Array.isArray(lista)) return []
  if (!countSolicitudesFiltrosActivos(filtros)) return lista
  return lista.filter((s) => matchSolicitudFiltros(s, filtros))
}

export function opcionesEstadoSolicitud() {
  return [
    { value: '', label: 'Todos' },
    { value: 'borrador', label: 'Borrador' },
    { value: 'enviada', label: 'Enviada' },
    { value: 'aprobada', label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
  ]
}

export { normTxt }
