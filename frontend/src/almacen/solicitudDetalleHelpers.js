/**
 * Helpers de validación / etiquetas para solicitudes de almacén.
 */

import { fmtMetrosAbscisa, parseAbscisaMetros } from './almacenAbscisa'

export function solicitudTieneOrdenCompra(sol) {
  return Boolean(sol?.tiene_orden_compra || sol?.orden_compra?.id)
}

export function solicitudPuedeValidar(sol, permisos) {
  const esGerencial = Boolean(
    permisos?.esContratistaGerencial
    || permisos?.esDesarrollador,
  )
  return Boolean(
    permisos?.validar
    && esGerencial
    && sol?.estado === 'enviada'
    && !solicitudTieneOrdenCompra(sol),
  )
}

/** Modal de revisión de línea: solo Contratista Gerencial (o Desarrollador). */
export function puedeAbrirRevisionLinea(permisos) {
  return Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
}

export function itemPuedeValidar(item, sol, permisos) {
  return Boolean(
    solicitudPuedeValidar(sol, permisos)
    && item?.id
    && !item?.en_orden_compra
    && (item?.estado_validacion || 'pendiente') !== 'aprobado',
  )
}

/**
 * Excepción post-OC: Gerencial + editar puede corregir insumo si la OC no tiene entradas.
 */
export function itemPuedeCorregirInsumoPostOc(item, sol, permisos) {
  const esGerencial = Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
  if (!esGerencial || !permisos?.editar || !item?.id) return false
  if (!solicitudTieneOrdenCompra(sol)) return false
  if (sol?.puede_corregir_insumo_post_oc === false) return false
  if (sol?.orden_compra?.tiene_entradas) return false
  return true
}

export function labelPestañaInsumo(item, idx) {
  const codigo = (item?.insumo_codigo || '').trim()
  if (codigo) return codigo
  const desc = (item?.descripcion_solicitada || item?.material_descripcion || '').trim()
  if (desc) {
    const short = desc.length > 28 ? `${desc.slice(0, 28)}…` : desc
    return short
  }
  const num = item?.numero_linea ?? idx + 1
  return `Línea ${num}`
}

/** Texto libre del Contratista (solo lectura en revisión Gerencial). */
export function textoLibreSolicitudItem(item) {
  return String(item?.descripcion_solicitada || item?.material_descripcion || '').trim()
}

/** Descripción a mostrar en grilla: catálogo si ya mapeado, si no texto libre. */
export function descripcionGrillaItem(item) {
  if (item?.insumo_id && item?.material_descripcion) {
    return String(item.material_descripcion).trim()
  }
  return textoLibreSolicitudItem(item) || String(item?.material_descripcion || '').trim() || '—'
}

/** Saldo negociado residual (null si no hay pacto con proveedor). */
export function saldoNegociadoItem(item) {
  const ctx = item?.contexto_negociado || item?.preview?.contexto_negociado
  if (!ctx?.tiene_negociado) return null
  const v = ctx.saldo_negociado_despues ?? ctx.saldo_negociado
  return v == null ? null : Number(v)
}

/** Saldo presupuestado residual en el PK-ID. */
export function saldoPresupuestadoItem(item) {
  const ctx = item?.contexto_presupuesto || item?.preview?.contexto_presupuesto
  if (!ctx) return null
  const v = ctx.saldo_disponible_despues ?? ctx.saldo_disponible
  return v == null ? null : Number(v)
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

/**
 * Hermanos del mismo ítem de presupuesto dentro de la solicitud
 * (principal + asociados) para agregar rentabilidad.
 */
export function hermanosMismoPresupuestoItem(items, item) {
  if (!item || !Array.isArray(items) || !items.length) return item ? [item] : []
  const pid = item.presupuesto_id
  if (pid != null && pid !== '') {
    const same = items.filter((r) => Number(r.presupuesto_id) === Number(pid))
    return same.length ? same : [item]
  }
  const cap = String(item.capitulo || item.presupuesto_capitulo || '').trim()
  const itm = String(item.item || item.presupuesto_item || '').trim().replace(/\.+$/, '')
  if (!cap || !itm) return [item]
  const same = items.filter((r) => {
    const c = String(r.capitulo || r.presupuesto_capitulo || '').trim()
    const i = String(r.item || r.presupuesto_item || '').trim().replace(/\.+$/, '')
    return c === cap && i === itm
  })
  return same.length ? same : [item]
}

/**
 * Agrega cobro/costo de todas las líneas del mismo ítem (principal + asociados).
 * overrideDraft: valores de la línea abierta en el modal (cantidad/VU).
 */
export function agregarRentabilidadPorItem(hermanos, overrideDraft = null, meta = {}) {
  const rows = (hermanos || []).map((r) => ({ ...r }))
  if (overrideDraft && rows.length) {
    const oid = overrideDraft.id != null ? Number(overrideDraft.id) : null
    const idx = oid != null
      ? rows.findIndex((r) => Number(r.id) === oid)
      : 0
    const target = idx >= 0 ? idx : 0
    rows[target] = { ...rows[target], ...overrideDraft }
  } else if (overrideDraft && !rows.length) {
    rows.push(overrideDraft)
  }

  let cobroLinea = 0
  let costoLinea = 0
  let tieneCosto = false
  let cantCobro = 0
  for (const r of rows) {
    const cant = Number(r.cantidad)
    const vlr = Number(r.vlr_unitario_cobro)
    const vc = Number(r.valor_compra_unitario)
    if (cant > 0 && vlr > 0) {
      cobroLinea += cant * vlr
      cantCobro += cant
    }
    if (cant > 0 && vc > 0) {
      costoLinea += cant * vc
      tieneCosto = true
    }
  }
  if (!(cantCobro > 0)) {
    const principal = rows.find((r) => r.es_principal !== false) || rows[0]
    cantCobro = Number(principal?.cantidad) || 0
  }
  if (!(cantCobro > 0) && !(cobroLinea > 0) && !tieneCosto) return null

  const util = (cobroLinea > 0 || tieneCosto)
    ? (cobroLinea || 0) - (tieneCosto ? costoLinea : 0)
    : null
  const analisis = {
    cantidad: cantCobro,
    valor_cobro_unitario: cantCobro > 0 && cobroLinea > 0 ? cobroLinea / cantCobro : 0,
    valor_cobro_linea: cobroLinea || 0,
    costo_insumo_unitario: tieneCosto && cantCobro > 0 ? costoLinea / cantCobro : 0,
    costo_insumo_linea: tieneCosto ? costoLinea : 0,
    utilidad_estimada_linea: tieneCosto ? ((cobroLinea || 0) - costoLinea) : null,
    rentabilidad_pct: cobroLinea > 0 && tieneCosto
      ? (((cobroLinea - costoLinea) / cobroLinea) * 100)
      : null,
    tiene_precio_compra: tieneCosto,
  }
  return rentabilidadDesdeAnalisis(analisis, meta)
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

/** Descripción del ítem de cobro (actividad del presupuesto). */
export function descripcionItemPresupuesto(item) {
  const ctx = item?.contexto_presupuesto || item?.preview?.contexto_presupuesto
  return String(
    ctx?.descripcion
    || item?.item_descripcion
    || item?.descripcion_item
    || '',
  ).trim()
}

/** Nodos inicio/fin de la línea (presupuesto o guardados). */
export function nodosLineaSolicitud(item) {
  const ctx = item?.contexto_presupuesto || item?.preview?.contexto_presupuesto
  const inicio = String(item?.nodo_inicio || ctx?.nodo_inicio || '').trim()
  const final = String(item?.nodo_final || ctx?.nodo_final || '').trim()
  return { inicio, final }
}

export function fmtNodosLinea(item) {
  const { inicio, final } = nodosLineaSolicitud(item)
  if (inicio && final && inicio !== final) return `${inicio} → ${final}`
  return inicio || final || '—'
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
