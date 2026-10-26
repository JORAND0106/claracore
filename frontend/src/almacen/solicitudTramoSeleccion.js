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

function textoVacio(v) {
  return v == null || String(v).trim() === ''
}

/** Solo el insumo principal descuenta presupuesto y se compara con el saldo. */
export function compararCantidadConSaldo(esPrincipal) {
  return esPrincipal !== false
}

/**
 * Reparte `total` según los pesos. El último absorbe el residuo para que
 * la suma de las partes sea exactamente `total`, sin redondear.
 */
export function repartirExacto(total, pesos) {
  const t = toNum(total)
  const lista = (pesos || []).map((p) => Math.max(0, toNum(p)))
  if (!lista.length || !(t > 0)) return lista.map(() => 0)
  const sumaPesos = lista.reduce((a, b) => a + b, 0)
  const base = sumaPesos > 0 ? lista : lista.map(() => 1)
  const sumaBase = base.reduce((a, b) => a + b, 0)
  let acumulado = 0
  return base.map((peso, i) => {
    if (i === base.length - 1) return t - acumulado
    const parte = t * (peso / sumaBase)
    acumulado += parte
    return parte
  })
}

function sumaNumeros(valores) {
  return (valores || []).reduce((a, b) => a + toNum(b), 0)
}

function resolverRegistros(regs, objetivo, manualReg) {
  const fijos = []
  const libres = []
  for (const reg of regs || []) {
    if (textoVacio(manualReg[reg.key])) libres.push(reg)
    else fijos.push(reg)
  }
  const sumaFijos = sumaNumeros(fijos.map((r) => manualReg[r.key]))
  const pedir = {}
  if (!(regs || []).length) {
    return { pedir, total: objetivo, ajustado: false }
  }
  if (objetivo == null) {
    if (!fijos.length) return { pedir, total: null, ajustado: false }
    fijos.forEach((r) => { pedir[r.key] = toNum(manualReg[r.key]) })
    libres.forEach((r) => { pedir[r.key] = 0 })
    return { pedir, total: sumaFijos, ajustado: true }
  }
  if (!libres.length) {
    fijos.forEach((r) => { pedir[r.key] = toNum(manualReg[r.key]) })
    return { pedir, total: sumaFijos, ajustado: Math.abs(sumaFijos - objetivo) > 1e-9 }
  }
  const resto = objetivo - sumaFijos
  if (resto < -1e-9) {
    fijos.forEach((r) => { pedir[r.key] = toNum(manualReg[r.key]) })
    libres.forEach((r) => { pedir[r.key] = 0 })
    return { pedir, total: sumaFijos, ajustado: true }
  }
  const partes = repartirExacto(resto, libres.map((r) => r.saldo))
  fijos.forEach((r) => { pedir[r.key] = toNum(manualReg[r.key]) })
  libres.forEach((r, i) => { pedir[r.key] = partes[i] || 0 })
  return { pedir, total: objetivo, ajustado: false }
}

function asignarPk(pks, objetivoTramo, manualPk, manualReg) {
  const fijos = pks.filter((pk) => !textoVacio(manualPk[pk.key]))
  const libres = pks.filter((pk) => textoVacio(manualPk[pk.key]))
  const sumaFijos = sumaNumeros(fijos.map((pk) => manualPk[pk.key]))
  const pkTarget = {}
  fijos.forEach((pk) => { pkTarget[pk.key] = toNum(manualPk[pk.key]) })
  if (objetivoTramo != null && libres.length) {
    const resto = objetivoTramo - sumaFijos
    const partes = resto < -1e-9
      ? libres.map(() => 0)
      : repartirExacto(resto, libres.map((pk) => pk.saldo))
    libres.forEach((pk, i) => { pkTarget[pk.key] = partes[i] || 0 })
  }
  const resueltos = {}
  for (const pk of pks) {
    const tiene = Object.prototype.hasOwnProperty.call(pkTarget, pk.key)
    resueltos[pk.key] = resolverRegistros(
      pk.regs || [],
      tiene ? pkTarget[pk.key] : null,
      manualReg,
    )
  }
  return resueltos
}

/**
 * Cantidad escrita a mano en tramo, PK-ID o registro.
 * Lo fijado a mano no se vuelve a repartir. El sobrante del nivel superior
 * se reparte solo entre lo que sigue libre, en proporción al saldo.
 * Si lo fijado en un nivel inferior cambia el total, ese nivel queda fijo
 * y los hermanos libres se recalculan. Si no caben, el total de arriba es la suma.
 */
export function calcularRepartoManual(arbol, manual = {}) {
  const pedir = { tramo: {}, pk: {}, reg: {} }
  const excede = { tramo: {}, pk: {}, reg: {} }
  const manualTramo = manual.tramo || {}
  const manualPk = manual.pk || {}
  const manualReg = manual.reg || {}

  for (const tramo of arbol || []) {
    const pks = tramo.pks || []
    const escrito = !textoVacio(manualTramo[tramo.key])
    const objetivo = escrito ? toNum(manualTramo[tramo.key]) : null
    let resueltos = asignarPk(pks, objetivo, manualPk, manualReg)

    if (objetivo != null) {
      let guard = 0
      while (guard < pks.length + 2) {
        guard += 1
        const bloqueados = new Set(
          pks
            .filter((pk) => !textoVacio(manualPk[pk.key]) || resueltos[pk.key]?.ajustado)
            .map((pk) => pk.key),
        )
        const libres = pks.filter((pk) => !bloqueados.has(pk.key))
        if (!libres.length) break
        const sumaBloqueados = sumaNumeros(
          pks.filter((pk) => bloqueados.has(pk.key)).map((pk) => resueltos[pk.key]?.total),
        )
        const resto = objetivo - sumaBloqueados
        const partes = resto < -1e-9
          ? libres.map(() => 0)
          : repartirExacto(resto, libres.map((pk) => pk.saldo))
        const estable = libres.every((pk, i) => (
          Math.abs(toNum(resueltos[pk.key]?.total) - (partes[i] || 0)) <= 1e-9
        ))
        if (estable) break
        const siguiente = { ...resueltos }
        libres.forEach((pk, i) => {
          siguiente[pk.key] = resolverRegistros(pk.regs || [], partes[i] || 0, manualReg)
        })
        resueltos = siguiente
      }
    }

    let sumaPk = 0
    let algunPk = false
    for (const pk of pks) {
      const res = resueltos[pk.key]
      if (res?.total == null) continue
      algunPk = true
      pedir.pk[pk.key] = res.total
      sumaPk += toNum(res.total)
      Object.assign(pedir.reg, res.pedir)
      if (toNum(res.total) - toNum(pk.saldo) > 1e-9) excede.pk[pk.key] = true
      for (const reg of pk.regs || []) {
        if (toNum(res.pedir[reg.key]) - toNum(reg.saldo) > 1e-9) excede.reg[reg.key] = true
      }
    }
    if (objetivo != null) pedir.tramo[tramo.key] = pks.length ? sumaPk : objetivo
    else if (algunPk && sumaPk > 0) pedir.tramo[tramo.key] = sumaPk
    if (toNum(pedir.tramo[tramo.key]) - toNum(tramo.saldo) > 1e-9) excede.tramo[tramo.key] = true
  }
  return { pedir, excede }
}

function lineaDePk(pk, registros, cantidad, plantilla, grupoId, grupoEtiqueta) {
  const regs = registros || []
  const primary = regs[0] || {}
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
    presupuesto_ids: regs.map((r) => Number(r.presupuesto_id)),
    registros_presupuesto: regs,
    pk_id: String(pk.pk_id).trim(),
    pk_label: String(pk.pk_id).trim(),
    pk_id_id: pk.pk_id_id || null,
    tramo: claveTramo(pk.tramo || primary.tramo),
    costado: pk.costado || primary.calzada || primary.costado || '',
    abscisa_inicial: iniNums.length ? Math.min(...iniNums) : (primary.abscisa_inicial ?? ''),
    abscisa_final: finNums.length ? Math.max(...finNums) : (primary.abscisa_final ?? ''),
    abs_inicio_display: primary.abs_inicio || '',
    abs_final_display: ultimo.abs_final || primary.abs_final || '',
    nodo_inicio: primary.nodo_inicio || '',
    nodo_final: ultimo.nodo_final || primary.nodo_final || '',
    cantidad,
    unidad: primary.unidad || plantilla.unidad || '',
    grupo_seleccion: grupoId || '',
    grupo_etiqueta: grupoEtiqueta || '',
  }
}

/** Una línea por PK-ID con cantidad pedida mayor que cero. El cero no genera línea. */
export function lineasDesdePedido({
  tramos = [],
  pksByTramo = {},
  regsByPk = {},
  pedir = {},
  plantilla = {},
  grupoId,
  grupoEtiqueta,
}) {
  const lineas = []
  for (const trow of tramos) {
    const tKey = claveTramo(trow.tramo)
    for (const pk of pksByTramo[tKey] || []) {
      const pKey = clavePk(pk.tramo ?? trow.tramo, pk.pk_id)
      const cant = toNum(pedir.pk?.[pKey])
      if (!(cant > 0)) continue
      const regs = (regsByPk[pKey] || [])
        .map((r) => ({ ...r, cantidad: toNum(pedir.reg?.[String(r.presupuesto_id)]) }))
        .filter((r) => toNum(r.cantidad) > 0)
      lineas.push(lineaDePk(pk, regs, cant, plantilla, grupoId, grupoEtiqueta))
    }
  }
  return lineas
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
