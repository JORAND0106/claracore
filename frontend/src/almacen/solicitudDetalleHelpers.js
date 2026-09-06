/**
 * Helpers de validación / etiquetas para solicitudes de almacén.
 */

import { fmtMetrosAbscisa, parseAbscisaMetros } from './almacenAbscisa'

export function solicitudTieneOrdenCompra(sol) {
  return Boolean(sol?.tiene_orden_compra || sol?.orden_compra?.id)
}

/** Líneas nuevas post-OC aún no incluidas en la orden (pendientes o listas para sumar). */
export function solicitudTieneLineasPendientesPostOc(sol) {
  if (!solicitudTieneOrdenCompra(sol)) return false
  const items = sol?.items || []
  if (!items.length) return false
  return items.some((it) => {
    if (it?.en_orden_compra) return false
    const ev = it?.estado_validacion || 'pendiente'
    return ev !== 'rechazado'
  })
}

/**
 * Gerencial puede validar:
 * - solicitud enviada sin OC, o
 * - solicitud con OC que tiene líneas nuevas (pendientes o aprobadas aún no sumadas).
 */
export function solicitudPuedeValidar(sol, permisos) {
  const esGerencial = Boolean(
    permisos?.esContratistaGerencial
    || permisos?.esDesarrollador,
  )
  if (!permisos?.validar || !esGerencial) return false
  if (sol?.estado === 'enviada' && !solicitudTieneOrdenCompra(sol)) return true
  if (
    sol?.estado === 'aprobada'
    && solicitudTieneOrdenCompra(sol)
    && solicitudTieneLineasPendientesPostOc(sol)
  ) {
    return true
  }
  return false
}

/** Rechazo completo de la solicitud: solo antes de generar OC. */
export function solicitudPuedeRechazarCompleta(sol, permisos) {
  return Boolean(
    solicitudPuedeValidar(sol, permisos)
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

/** Puede reabrir OC para agregar insumos adicionales. */
export function solicitudPuedeReabrirOc(sol, permisos) {
  return Boolean(
    permisos?.editar
    && sol?.estado === 'aprobada'
    && solicitudTieneOrdenCompra(sol),
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
  if (item?.en_orden_compra) return 'aprobado'
  if (item?.estado_validacion) return item.estado_validacion
  // Líneas nuevas post-OC (aún no en la orden): pendientes de revisión.
  if (solicitudTieneOrdenCompra(sol) && !item?.en_orden_compra) {
    return 'pendiente'
  }
  if (sol?.estado === 'aprobada') return 'aprobado'
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
    utilidad_estimada_linea: null,
    rentabilidad_pct: null,
    numero_oc: meta.numeroOc ?? null,
    etiqueta_fila: meta.etiquetaFila ?? (meta.material || 'Insumo'),
    es_actual: true,
    es_principal: true,
    es_total: false,
    solicitud_consecutivo: meta.consecutivo ?? null,
  }
  const cobro = Number(analisis.valor_cobro_linea)
  const costo = Number(analisis.costo_insumo_linea)
  const util = (Number.isFinite(cobro) && Number.isFinite(costo))
    ? cobro - costo
    : null
  const pct = (util != null && cobro > 0) ? (util / cobro) * 100 : null
  const total = {
    etiqueta_fila: 'Total ítem',
    numero_oc: meta.numeroOc ?? null,
    solicitud_consecutivo: meta.consecutivo ?? null,
    es_actual: true,
    es_total: true,
    es_principal: null,
    cantidad: null,
    valor_cobro_unitario: analisis.valor_cobro_unitario,
    valor_cobro_linea: Number.isFinite(cobro) ? cobro : null,
    costo_insumo_unitario: null,
    costo_insumo_linea: Number.isFinite(costo) ? costo : null,
    utilidad_estimada_linea: util,
    rentabilidad_pct: pct,
  }
  return { filas: [fila, total], modo: 'por_insumo' }
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

function etiquetaInsumoRentabilidad(r) {
  const mat = String(r?.material_descripcion || r?.insumo?.label || '').trim()
  if (mat) return mat
  const cod = String(r?.insumo_codigo || '').trim()
  if (cod) return cod
  return r?.es_principal === false ? 'Insumo asociado' : 'Insumo principal'
}

/**
 * Una fila por insumo (principal + asociados) + fila Total del ítem.
 * Cobro solo del principal; utilidad/% solo en Total.
 */
export function construirRentabilidadPorInsumos(hermanos, overrideDraft = null, meta = {}) {
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

  rows.sort((a, b) => {
    const pa = a.es_principal === false ? 1 : 0
    const pb = b.es_principal === false ? 1 : 0
    if (pa !== pb) return pa - pb
    return (Number(a.numero_linea) || 0) - (Number(b.numero_linea) || 0)
  })

  const filas = []
  let sumCosto = 0
  let tieneCosto = false
  let cobroTotal = null
  let vuCobroTotal = null
  let cantPrincipal = null

  for (const r of rows) {
    const cant = Number(r.cantidad)
    const vc = Number(r.valor_compra_unitario)
    const esPrincipal = r.es_principal !== false
    const costoLinea = (cant > 0 && vc > 0) ? cant * vc : null
    if (costoLinea != null) {
      sumCosto += costoLinea
      tieneCosto = true
    }

    let vuCobro = null
    let cobroLinea = null
    if (esPrincipal) {
      const vlr = Number(r.vlr_unitario_cobro)
      if (vlr > 0 && cant > 0) {
        vuCobro = vlr
        cobroLinea = cant * vlr
        cobroTotal = cobroLinea
        vuCobroTotal = vuCobro
        cantPrincipal = cant
      } else if (cant > 0) {
        cantPrincipal = cant
      }
    }

    filas.push({
      etiqueta_fila: etiquetaInsumoRentabilidad(r),
      numero_oc: meta.numeroOc ?? null,
      solicitud_consecutivo: meta.consecutivo ?? null,
      solicitud_item_id: r.id,
      insumo_id: r.insumo_id,
      es_principal: esPrincipal,
      es_actual: true,
      es_total: false,
      cantidad: cant > 0 ? cant : null,
      valor_cobro_unitario: vuCobro,
      valor_cobro_linea: cobroLinea,
      costo_insumo_unitario: vc > 0 ? vc : null,
      costo_insumo_linea: costoLinea,
      utilidad_estimada_linea: null,
      rentabilidad_pct: null,
    })
  }

  if (!filas.length) return null

  const costoTotal = tieneCosto ? sumCosto : null
  const util = (cobroTotal != null && costoTotal != null) ? cobroTotal - costoTotal : null
  const pct = (util != null && cobroTotal > 0) ? (util / cobroTotal) * 100 : null

  filas.push({
    etiqueta_fila: 'Total ítem',
    numero_oc: meta.numeroOc ?? null,
    solicitud_consecutivo: meta.consecutivo ?? null,
    es_principal: null,
    es_actual: true,
    es_total: true,
    cantidad: cantPrincipal,
    valor_cobro_unitario: vuCobroTotal,
    valor_cobro_linea: cobroTotal,
    costo_insumo_unitario: null,
    costo_insumo_linea: costoTotal,
    utilidad_estimada_linea: util,
    rentabilidad_pct: pct,
  })

  return { filas, modo: 'por_insumo' }
}

/** @deprecated Usar construirRentabilidadPorInsumos */
export function agregarRentabilidadPorItem(hermanos, overrideDraft = null, meta = {}) {
  return construirRentabilidadPorInsumos(hermanos, overrideDraft, meta)
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
