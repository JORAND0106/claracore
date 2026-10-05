/**
 * Selección por tramo / PK-ID / registro y partición en una línea por PK-ID.
 */
import { repartirCantidadProporcional, roundCant, toNum } from './presupuestoReparto.js'

export function claveTramo(tramo) {
  return String(tramo ?? '').trim()
}

export function clavePk(tramo, pkId) {
  return `${claveTramo(tramo)}||${String(pkId ?? '').trim()}`
}

export function etiquetaTramo(tramo) {
  const t = claveTramo(tramo)
  return t || 'Sin tramo'
}

export function etiquetaGrupo(tramos, material) {
  const uniq = []
  const seen = new Set()
  for (const t of tramos || []) {
    const label = etiquetaTramo(t)
    if (seen.has(label)) continue
    seen.add(label)
    uniq.push(label)
  }
  const base = uniq.length <= 1
    ? `Tramo ${uniq[0] || 'Sin tramo'}`
    : `Tramos ${uniq.join(', ')}`
  const mat = String(material || '').trim()
  if (!mat) return base
  const short = mat.length > 42 ? `${mat.slice(0, 42)}…` : mat
  return `${base} · ${short}`
}

export function nuevoGrupoId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Saldo disponible de lo marcado, sin contar dos veces un PK que ya entra en su tramo.
 */
export function saldoSeleccion({ tramos = [], pks = [], registros = [] } = {}) {
  const tramoSet = new Set((tramos || []).map((t) => claveTramo(t.tramo)))
  const pkSet = new Set((pks || []).map((p) => clavePk(p.tramo, p.pk_id)))
  let total = 0
  for (const t of tramos || []) total += Math.max(0, toNum(t.saldo_disponible))
  for (const p of pks || []) {
    if (tramoSet.has(claveTramo(p.tramo))) continue
    total += Math.max(0, toNum(p.saldo_disponible))
  }
  for (const r of registros || []) {
    if (tramoSet.has(claveTramo(r.tramo))) continue
    if (pkSet.has(clavePk(r.tramo, r.pk_id))) continue
    total += Math.max(0, toNum(r.saldo_disponible))
  }
  return roundCant(total)
}

function saldoGrupo(g) {
  const regs = g?.registros || []
  if (regs.length) {
    return regs.reduce((a, r) => a + Math.max(0, toNum(r.saldo_disponible)), 0)
  }
  return Math.max(0, toNum(g?.saldo_disponible))
}

/**
 * Una línea de solicitud por PK-ID. La cantidad se reparte según el saldo de cada PK
 * y, dentro del PK, según el saldo de cada registro (mismo criterio que la grilla actual).
 */
export function crearLineasPorPk({
  cantidad,
  gruposPk,
  plantilla = {},
  grupoId,
  grupoEtiqueta,
}) {
  const grupos = (gruposPk || [])
    .filter((g) => g && String(g.pk_id || '').trim())
    .map((g) => ({ ...g, _saldo: saldoGrupo(g) }))
    .filter((g) => g._saldo > 0)
  const cant = toNum(cantidad)
  if (!grupos.length || !(cant > 0)) return []

  const shares = repartirCantidadProporcional(
    cant,
    grupos.map((g, i) => ({
      presupuesto_id: i + 1,
      saldo_disponible: g._saldo,
    })),
  )

  return grupos.map((g, i) => {
    const share = shares[i]?.cantidad ?? 0
    const regs = g.registros || []
    const reparto = repartirCantidadProporcional(
      share,
      regs.map((r) => ({
        presupuesto_id: r.presupuesto_id,
        saldo_disponible: r.saldo_disponible,
      })),
    )
    const byId = new Map(reparto.map((r) => [Number(r.presupuesto_id), r]))
    const registros = regs
      .map((r) => ({
        ...r,
        cantidad: byId.get(Number(r.presupuesto_id))?.cantidad ?? 0,
      }))
      .filter((r) => toNum(r.cantidad) > 0)
    const primary = registros[0] || regs[0] || {}
    const iniNums = regs.map((r) => toNum(r.abscisa_inicial)).filter((n) => n > 0)
    const finNums = regs.map((r) => toNum(r.abscisa_final)).filter((n) => n > 0)
    const ultimo = regs[regs.length - 1] || primary
    return {
      descripcion_solicitada: '',
      es_principal: true,
      es_recurrente: false,
      observacion_residente: '',
      insumo: null,
      preview: null,
      valor_compra_unitario: '',
      ...plantilla,
      presupuesto_id: primary.presupuesto_id ?? null,
      presupuesto_ids: registros.map((r) => Number(r.presupuesto_id)),
      registros_presupuesto: registros,
      pk_id: String(g.pk_id).trim(),
      pk_label: String(g.pk_id).trim(),
      pk_id_id: g.pk_id_id || null,
      tramo: claveTramo(g.tramo || primary.tramo),
      costado: g.costado || primary.calzada || primary.costado || '',
      abscisa_inicial: iniNums.length ? Math.min(...iniNums) : (primary.abscisa_inicial ?? ''),
      abscisa_final: finNums.length ? Math.max(...finNums) : (primary.abscisa_final ?? ''),
      abs_inicio_display: primary.abs_inicio || '',
      abs_final_display: ultimo.abs_final || primary.abs_final || '',
      nodo_inicio: primary.nodo_inicio || '',
      nodo_final: ultimo.nodo_final || primary.nodo_final || '',
      cantidad: share,
      unidad: primary.unidad || plantilla.unidad || '',
      grupo_seleccion: grupoId || '',
      grupo_etiqueta: grupoEtiqueta || '',
    }
  }).filter((ln) => toNum(ln.cantidad) > 0)
}

/** Grupos automáticos presentes en una solicitud (orden de aparición). */
export function gruposDeLineas(items) {
  const map = new Map()
  const orden = []
  for (const it of items || []) {
    const id = String(it?.grupo_seleccion || '').trim()
    if (!id) continue
    if (!map.has(id)) {
      map.set(id, {
        id,
        etiqueta: String(it.grupo_etiqueta || '').trim() || 'Grupo',
        items: [],
      })
      orden.push(id)
    }
    map.get(id).items.push(it)
  }
  return orden.map((id) => map.get(id))
}

/**
 * Texto de las líneas que no se pudieron asignar o aprobar en bloque.
 * Vacío si todas quedaron bien.
 */
export function resumenAccionBloque(resultados, accion) {
  const rows = resultados || []
  const ok = rows.filter((r) => r?.ok)
  const fail = rows.filter((r) => r && !r.ok)
  if (!fail.length) return ''
  const detalle = fail.map((r) => {
    const n = r.numero_linea != null ? `#${r.numero_linea}` : `id ${r.item_id ?? '—'}`
    return `• Línea ${n}: ${r.error || 'No se pudo aplicar.'}`
  }).join('\n')
  const hecho = ok.length ? `${accion}: ${ok.length} línea(s).\n` : ''
  return `${hecho}No se aplicó a ${fail.length} línea(s):\n${detalle}`
}
