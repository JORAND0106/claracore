/**
 * Helpers de validación / etiquetas para solicitudes de almacén.
 */

import { fmtMetrosAbscisa, parseAbscisaMetros } from './almacenAbscisa'

export function solicitudTieneOrdenCompra(sol) {
  return Boolean(sol?.tiene_orden_compra || sol?.orden_compra?.id)
}

export function solicitudPuedeValidar(sol, permisos) {
  return Boolean(
    permisos?.validar
    && sol?.estado === 'enviada'
    && !solicitudTieneOrdenCompra(sol),
  )
}

export function itemPuedeValidar(item, sol, permisos) {
  return Boolean(
    solicitudPuedeValidar(sol, permisos)
    && item?.id
    && !item?.en_orden_compra
    && (item?.estado_validacion || 'pendiente') !== 'aprobado',
  )
}

export function labelPestañaInsumo(item, idx) {
  const codigo = (item?.insumo_codigo || '').trim()
  if (codigo) return codigo
  const num = item?.numero_linea ?? idx + 1
  return `Línea ${num}`
}

export function estadoValidacionItem(item, sol) {
  if (item?.en_orden_compra || item?.estado_validacion === 'aprobado') return 'aprobado'
  if (item?.estado_validacion) return item.estado_validacion
  if (sol?.estado === 'aprobada' || solicitudTieneOrdenCompra(sol)) return 'aprobado'
  if (sol?.estado === 'enviada') return 'pendiente'
  return null
}

/** Construye desglose por fila desde analisis_valor cuando el backend no envía filas. */
export function rentabilidadDesdeAnalisis(analisis, meta = {}) {
  if (!analisis) return null
  const fila = {
    cantidad: analisis.cantidad,
    valor_cobro_unitario: analisis.valor_cobro_unitario,
    valor_cobro_linea: analisis.valor_cobro_linea,
    costo_insumo_unitario: analisis.costo_insumo_unitario,
    costo_insumo_linea: analisis.costo_insumo_linea,
    utilidad_estimada_linea: analisis.utilidad_estimada_linea,
    rentabilidad_pct: analisis.rentabilidad_pct,
    numero_oc: meta.numeroOc ?? null,
    etiqueta_fila: meta.etiquetaFila ?? 'Esta solicitud',
    es_actual: true,
    solicitud_consecutivo: meta.consecutivo ?? null,
  }
  return { filas: [fila] }
}

function formatAbscisaValor(val) {
  if (val == null || val === '') return ''
  const s = String(val).trim()
  if (!s) return ''
  if (/^K?\d+\+/i.test(s)) return s.startsWith('K') ? s : `K${s}`
  const m = parseAbscisaMetros(val)
  if (m != null) return fmtMetrosAbscisa(m) || s
  return s
}

/** Abscisas diligenciadas en la línea (prioriza lo guardado en la solicitud). */
export function abscisasLineaSolicitud(item) {
  const ctx = item?.preview?.contexto_presupuesto || item?.contexto_presupuesto
  const inicial = formatAbscisaValor(
    item?.abscisa_inicial ?? item?.abs_inicio_display ?? ctx?.abs_inicio,
  )
  const final = formatAbscisaValor(
    item?.abscisa_final ?? item?.abs_final_display ?? ctx?.abs_final,
  )
  return { inicial, final }
}

export function fmtAbscisasLinea(item) {
  const { inicial, final } = abscisasLineaSolicitud(item)
  if (inicial && final && inicial !== final) return `${inicial} → ${final}`
  return inicial || final || '—'
}
