/**
 * Helpers puros — vista Cantidades por Ítem (solapes / vacíos / espesor atípico).
 * Ámbito de comparación: Capítulo + Ítem + Tramo + Infraestructura.
 */

export function parseAbsNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseEspesorNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Clave de grupo comparable (sin costado). */
export function claveGrupoCantidadesPorItem(reg) {
  return [
    String(reg?.capitulo || '').trim(),
    String(reg?.item_numero || '').trim(),
    String(reg?.tramo || '').trim(),
    String(reg?.infraestructura || '').trim(),
  ].join('\u0001')
}

export function etiquetaGrupoCantidadesPorItem(reg) {
  const tramo = String(reg?.tramo || '').trim() || '—'
  const infra = String(reg?.infraestructura || '').trim() || '—'
  return { tramo, infraestructura: infra, label: `${tramo} · ${infra}` }
}

export function compararRegistrosPorAbsInicio(a, b) {
  const ai = parseAbsNum(a?.abs_inicio)
  const bi = parseAbsNum(b?.abs_inicio)
  if (ai == null && bi == null) return (Number(a?.id) || 0) - (Number(b?.id) || 0)
  if (ai == null) return 1
  if (bi == null) return -1
  if (ai !== bi) return ai - bi
  const af = parseAbsNum(a?.abs_final)
  const bf = parseAbsNum(b?.abs_final)
  if (af != null && bf != null && af !== bf) return af - bf
  return (Number(a?.id) || 0) - (Number(b?.id) || 0)
}

/** Orden jerárquico general: Ítem → Tramo → Infraestructura → Abs Inicio. */
export function compararRegistrosJerarquiaGeneral(a, b) {
  const ca = String(a?.capitulo || '').localeCompare(String(b?.capitulo || ''), 'es', { sensitivity: 'base' })
  if (ca) return ca
  const ia = String(a?.item_numero || '').localeCompare(String(b?.item_numero || ''), 'es', { sensitivity: 'base' })
  if (ia) return ia
  const ta = String(a?.tramo || '').localeCompare(String(b?.tramo || ''), 'es', { sensitivity: 'base' })
  if (ta) return ta
  const inf = String(a?.infraestructura || '').localeCompare(String(b?.infraestructura || ''), 'es', { sensitivity: 'base' })
  if (inf) return inf
  return compararRegistrosPorAbsInicio(a, b)
}

/**
 * Moda de espesores: valor más frecuente.
 * Empate → el de mayor conteo ya es único por Map order; si empate exacto, el primero visto.
 */
export function modaEspesor(valores) {
  const counts = new Map()
  for (const v of valores || []) {
    const n = parseEspesorNum(v)
    if (n == null) continue
    const key = String(n)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  if (counts.size === 0) return null
  let bestKey = null
  let bestCount = -1
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c
      bestKey = k
    }
  }
  return bestKey == null ? null : Number(bestKey)
}

/**
 * Detecta solapes, vacíos y espesores atípicos dentro de cada grupo.
 */
export function analizarCantidadesPorItem(registros) {
  const byGrupo = new Map()
  for (const r of registros || []) {
    if (!String(r?.item_numero || '').trim()) continue
    const k = claveGrupoCantidadesPorItem(r)
    if (!byGrupo.has(k)) byGrupo.set(k, [])
    byGrupo.get(k).push(r)
  }

  const filas = []
  const grupos = []
  let solapes = 0
  let vacios = 0
  let espesoresAtipicos = 0

  const keys = [...byGrupo.keys()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

  for (const k of keys) {
    const raw = byGrupo.get(k) || []
    const ordenados = [...raw].sort(compararRegistrosPorAbsInicio)
    const moda = modaEspesor(ordenados.map((r) => r.espesor))
    const meta = etiquetaGrupoCantidadesPorItem(ordenados[0] || {})

    const segmentos = []
    const alertasFila = new Map()

    for (let i = 0; i < ordenados.length; i++) {
      const cur = ordenados[i]
      const id = cur?.id
      const flags = alertasFila.get(id) || {
        solape: false,
        vacioAntes: null,
        espesorAtipico: false,
      }

      const a0 = parseAbsNum(cur.abs_inicio)
      const a1 = parseAbsNum(cur.abs_final)
      if (a0 != null && a1 != null) {
        segmentos.push({
          id,
          absInicio: a0,
          absFin: a1,
          numero_registro: cur.numero_registro,
          reporte_id: cur.reporte_id,
        })
      }

      if (i > 0) {
        const prev = ordenados[i - 1]
        const p1 = parseAbsNum(prev.abs_final)
        if (a0 != null && p1 != null && a0 < p1) {
          flags.solape = true
          const prevFlags = alertasFila.get(prev.id) || {
            solape: false,
            vacioAntes: null,
            espesorAtipico: false,
          }
          prevFlags.solape = true
          alertasFila.set(prev.id, prevFlags)
        } else if (a0 != null && p1 != null && a0 > p1) {
          flags.vacioAntes = { desde: p1, hasta: a0, brecha: a0 - p1 }
        }
      }

      const esp = parseEspesorNum(cur.espesor)
      if (moda != null && esp != null && esp !== moda) {
        flags.espesorAtipico = true
      }

      alertasFila.set(id, flags)
    }

    let solapesGrupo = 0
    let vaciosGrupo = 0
    let atipGrupo = 0
    for (const cur of ordenados) {
      const f = alertasFila.get(cur.id) || {}
      if (f.solape) solapesGrupo += 1
      if (f.vacioAntes) vaciosGrupo += 1
      if (f.espesorAtipico) atipGrupo += 1
      filas.push({
        ...cur,
        _grupoKey: k,
        _grupoLabel: meta.label,
        _tramo: meta.tramo,
        _infraestructura: meta.infraestructura,
        _alertaSolape: !!f.solape,
        _alertaVacioAntes: f.vacioAntes || null,
        _alertaEspesorAtipico: !!f.espesorAtipico,
        _espesorModaGrupo: moda,
      })
    }

    solapes += solapesGrupo
    vacios += vaciosGrupo
    espesoresAtipicos += atipGrupo

    const absVals = segmentos.flatMap((s) => [s.absInicio, s.absFin])
    const minAbs = absVals.length ? Math.min(...absVals) : null
    const maxAbs = absVals.length ? Math.max(...absVals) : null

    const segsMarked = segmentos.map((s) => {
      const solapa = segmentos.some(
        (o) =>
          o.id !== s.id &&
          Math.min(s.absInicio, s.absFin) < Math.max(o.absInicio, o.absFin) &&
          Math.max(s.absInicio, s.absFin) > Math.min(o.absInicio, o.absFin),
      )
      return { ...s, solapa }
    })

    grupos.push({
      key: k,
      capitulo: String(ordenados[0]?.capitulo || '').trim(),
      item: String(ordenados[0]?.item_numero || '').trim(),
      tramo: meta.tramo,
      infraestructura: meta.infraestructura,
      label: meta.label,
      modaEspesor: moda,
      solapes: solapesGrupo,
      vacios: vaciosGrupo,
      espesoresAtipicos: atipGrupo,
      total: ordenados.length,
      minAbs,
      maxAbs,
      segmentos: segsMarked,
      vaciosIntervalos: ordenados
        .map((r) => alertasFila.get(r.id)?.vacioAntes)
        .filter(Boolean),
    })
  }

  return {
    filas,
    grupos,
    resumen: {
      solapes,
      vacios,
      espesoresAtipicos,
      total: filas.length,
      grupos: grupos.length,
    },
  }
}

/** Vista general (varios ítems): orden jerárquico sin alertas de inconsistencia. */
export function ordenarRegistrosVistaGeneral(registros) {
  return [...(registros || [])]
    .filter((r) => String(r?.item_numero || '').trim())
    .sort(compararRegistrosJerarquiaGeneral)
    .map((r) => ({
      ...r,
      _alertaSolape: false,
      _alertaVacioAntes: null,
      _alertaEspesorAtipico: false,
      _espesorModaGrupo: null,
      _grupoLabel: `${String(r.item_numero || '').trim()} · ${etiquetaGrupoCantidadesPorItem(r).label}`,
    }))
}

/** Filtra filas por tipo de alerta accionable. */
export function filtrarFilasPorAlerta(filas, filtroAlerta) {
  if (!filtroAlerta || filtroAlerta === 'todos') return filas || []
  if (filtroAlerta === 'solapes') return (filas || []).filter((f) => f._alertaSolape)
  if (filtroAlerta === 'vacios') return (filas || []).filter((f) => f._alertaVacioAntes)
  if (filtroAlerta === 'espesores') return (filas || []).filter((f) => f._alertaEspesorAtipico)
  return filas || []
}

/** True si la fila tiene solape, vacío o espesor atípico. */
export function registroTieneAlerta(reg) {
  return !!(reg?._alertaSolape || reg?._alertaVacioAntes || reg?._alertaEspesorAtipico)
}

/**
 * Grupos para la franja: solo segmentos de registros con alerta.
 * Sin vacíos proporcionales (evitar huecos que parezcan “tramo sin cobrar”
 * por omitir registros sanos). Layout compacto en la UI.
 */
export function gruposFranjaSoloAlertas(filas, grupos) {
  const alertById = new Map()
  for (const f of filas || []) {
    if (!registroTieneAlerta(f)) continue
    alertById.set(String(f.id), {
      solape: !!f._alertaSolape,
      vacio: !!f._alertaVacioAntes,
      vacioAntes: f._alertaVacioAntes || null,
      espesorAtipico: !!f._alertaEspesorAtipico,
      numero_registro: f.numero_registro,
      abs_inicio: f.abs_inicio,
      abs_final: f.abs_final,
    })
  }
  if (alertById.size === 0) return []

  const out = []
  for (const g of grupos || []) {
    const segs = []
    for (const s of g.segmentos || []) {
      const a = alertById.get(String(s.id))
      if (!a) continue
      segs.push({
        ...s,
        solapa: a.solape || !!s.solapa,
        alertaVacio: a.vacio,
        alertaEspesor: a.espesorAtipico,
        vacioAntes: a.vacioAntes,
        numero_registro: a.numero_registro ?? s.numero_registro,
      })
    }
    if (!segs.length) continue
    segs.sort((a, b) => (a.absInicio - b.absInicio) || (a.absFin - b.absFin))
    // Conservar rango Abs del grupo completo (todos los regs del tramo·infra),
    // para posicionar alertas sobre el eje real del tramo — no solo el subconjunto.
    out.push({
      ...g,
      segmentos: segs,
      vaciosIntervalos: [],
      totalAlertas: segs.length,
      minAbs: g.minAbs,
      maxAbs: g.maxAbs,
    })
  }
  return out
}

/**
 * Modo de la vista a partir del payload y si hay búsqueda activa.
 */
export function resolverModoCantidadesPorItem({ busquedaActiva, payload }) {
  if (!busquedaActiva) return 'vacio'
  if (!payload) return 'vacio'
  if (payload.modo === 'analisis' || Number(payload.items_distintos) === 1) return 'analisis'
  if (Number(payload.total) > 0 || Number(payload.items_distintos) > 1) return 'general'
  return 'vacio'
}

/** Costo directo de línea: round(round(cant,2) × VU_listado, 0). */
export function costoDirectoDesdeListado(cantidadTotal, vuListado) {
  const q = Math.round((Number(cantidadTotal) || 0) * 100) / 100
  const vu = Number(vuListado) || 0
  if (!q || !vu) return 0
  return Math.round(q * vu)
}

/** VU efectivo de una fila (preferir el de la propia fila). */
export function vuEfectivoFila(reg, payloadVu) {
  const v = Number(reg?.vlr_unitario_listado)
  if (Number.isFinite(v) && v > 0) return v
  const p = Number(payloadVu)
  return Number.isFinite(p) && p > 0 ? p : 0
}
