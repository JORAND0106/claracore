/**
 * Deshacer una sola acción en presupuesto (Ctrl+Z de profundidad 1).
 */

function cloneRow(r) {
  if (!r) return null
  try {
    return typeof structuredClone === 'function' ? structuredClone(r) : JSON.parse(JSON.stringify(r))
  } catch {
    return JSON.parse(JSON.stringify(r))
  }
}

/** Snapshot de filas antes de mutar (solo ids editables). */
export function capturarSnapshotFilas(registros, ids) {
  const snap = {}
  for (const id of ids) {
    const r = registros.find((x) => x.id === id)
    const c = cloneRow(r)
    if (c) snap[id] = c
  }
  return Object.keys(snap).length ? snap : null
}

function agruparPorCampo(snap, field, vacioComo = 'No Revisado') {
  const groups = new Map()
  for (const [idStr, row] of Object.entries(snap)) {
    let v = row[field]
    if (v == null || String(v).trim() === '') v = vacioComo
    const key = String(v)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(Number(idStr))
  }
  return groups
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Restaura filas en servidor según snapshot (mismas APIs que edición masiva).
 */
export async function restaurarSnapshotPresupuesto({
  API,
  token,
  contratoId,
  snap,
  aplicaReglasCadPresupuesto = true,
  puedeEditarAreaLongNod = false,
  puedeEditarNodos = false,
}) {
  const ids = Object.keys(snap).map(Number)
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const dims = ids.map((id) => {
    const r = snap[id]
    const d = { id }
    const an = numOrNull(r.ancho)
    const es = numOrNull(r.espesor)
    if (an != null) d.ancho = an
    if (es != null) d.espesor = es
    if (!aplicaReglasCadPresupuesto || puedeEditarAreaLongNod) {
      const ar = numOrNull(r.area_long_nod)
      if (ar != null) d.area_long_nod = ar
    }
    if (r.capitulo != null && r.capitulo !== '') d.capitulo = r.capitulo
    if (r.item != null && r.item !== '') d.item = r.item
    return d
  })

  const resRec = await fetch(`${API}/presupuesto/${contratoId}/bulk-recalcular`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ids, dims }),
  })
  if (!resRec.ok) {
    const err = await resRec.json().catch(() => ({}))
    throw new Error(err?.detail || 'No se pudo restaurar dimensiones / capítulo / ítem.')
  }

  for (const [tipo, gids] of agruparPorCampo(snap, 'tipo_ejecucion', 'Presupuesto de Obra')) {
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-tipo-ejecucion`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ids: gids, tipo_ejecucion: tipo }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail || 'No se pudo restaurar tipo de ejecución.')
    }
  }

  for (const [comp, gids] of agruparPorCampo(snap, 'competencia', '')) {
    const texto = String(comp || '').trim()
    if (!texto) continue
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-competencia`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ids: gids, competencia: texto }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail || 'No se pudo restaurar competencia.')
    }
  }

  // Nodos: agrupar por par inicio|final (restaura sin tocar sello).
  if (puedeEditarNodos) {
    const groups = new Map()
    for (const [idStr, row] of Object.entries(snap)) {
      const ini = row.no_inicio != null ? String(row.no_inicio) : ''
      const fin = row.no_final != null ? String(row.no_final) : ''
      const key = `${ini}\0${fin}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(Number(idStr))
    }
    for (const [key, gids] of groups) {
      const [ini, fin] = key.split('\0')
      const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-nodos`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ids: gids, no_inicio: ini, no_final: fin }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || 'No se pudo restaurar nodos.')
      }
    }
  }

  for (const [estado, gids] of agruparPorCampo(snap, 'pre_interv_estado', 'No Revisado')) {
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-pre-interv`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ids: gids, estado }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail || 'No se pudo restaurar Validación Contratista.')
    }
  }

  for (const [revisado, gids] of agruparPorCampo(snap, 'revisado', 'No Revisado')) {
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ids: gids, revisado }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail || 'No se pudo restaurar validación Interventoría.')
    }
  }

  for (const id of ids) {
    const oldObs = snap[id]?.observacion_externa
    const texto = oldObs != null ? String(oldObs).trim() : ''
    if (texto) {
      const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-observacion`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ids: [id], observacion_externa: texto }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || 'No se pudo restaurar observación.')
      }
    } else {
      const res = await fetch(`${API}/presupuesto/item/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ observacion_externa: '' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || 'No se pudo limpiar observación.')
      }
    }
  }

  return ids
}

/** Aplica snapshot en estado local (tras restaurar en servidor). */
export function filasDesdeSnapshot(snap) {
  return Object.values(snap)
}
