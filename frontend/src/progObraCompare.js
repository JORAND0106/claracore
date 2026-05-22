/** Helpers Fase 3B — comparación baseline vs target. */

export const COMPARE_COLORS = {
  adelantado: '#16a34a',
  atrasado: '#dc2626',
  duracion: '#d97706',
  sin_cambio: '#9ca3af',
  nuevo: '#2563eb',
  eliminado: '#6b7280',
}

export const COMPARE_LABELS = {
  adelantado: 'Adelantado',
  atrasado: 'Atrasado',
  duracion: 'Δ duración',
  sin_cambio: 'Sin cambio',
  nuevo: 'Nuevo',
  eliminado: 'Eliminado',
}

export function compareNodeKey(pk, cap, agrupadorId, item) {
  const pkS = String(pk || '').trim()
  const capS = String(cap || '').trim()
  if (agrupadorId != null && agrupadorId !== '') {
    return `${pkS}\u0000${capS}\u0000ag:${Number(agrupadorId)}`
  }
  if (item) return `${pkS}\u0000${capS}\u0000item:${String(item).trim()}`
  return `${pkS}\u0000${capS}\u0000cap`
}

export function compareNodeKeyFromApi(n) {
  if (!n) return ''
  if (n.agrupador_id != null) {
    return compareNodeKey(n.pk_id, n.capitulo, n.agrupador_id)
  }
  const lbl = String(n.label || '')
  if (n.codigo_wbs && !lbl.startsWith('Capítulo')) {
    return compareNodeKey(n.pk_id, n.capitulo, null, n.codigo_wbs)
  }
  return compareNodeKey(n.pk_id, n.capitulo)
}

export function indexCompareNodos(nodos) {
  const map = {}
  for (const n of nodos || []) {
    map[compareNodeKeyFromApi(n)] = n
  }
  return map
}

export function compareKeyForGanttRow(activePk, row) {
  if (!row || row.kind === 'spacer') return null
  if (row.kind === 'ag') return compareNodeKey(activePk, row.cap, row.agrupadorId)
  if (row.kind === 'item') return compareNodeKey(activePk, row.cap, null, row.label)
  if (row.kind === 'cap') return compareNodeKey(activePk, row.cap)
  return null
}

export function sortNodosByDesviacion(nodos) {
  return [...(nodos || [])].sort((a, b) => {
    const da = Math.abs(Number(a?.delta?.dias_fin) || 0)
    const db = Math.abs(Number(b?.delta?.dias_fin) || 0)
    if (db !== da) return db - da
    return Math.abs(Number(b?.delta?.costo) || 0) - Math.abs(Number(a?.delta?.costo) || 0)
  })
}

export function filterCompareNodos(nodos, { soloAtrasados, soloCriticos, pkId } = {}) {
  let list = nodos || []
  if (pkId) list = list.filter((n) => String(n.pk_id || '').trim() === String(pkId).trim())
  if (soloAtrasados) list = list.filter((n) => n.tipo_cambio === 'atrasado')
  if (soloCriticos) list = list.filter((n) => n.es_ruta_critica_target)
  return list
}

export async function fetchComparar(API, cid, token, { pkId, soloCambios = false, baselineId, targetId } = {}) {
  const q = new URLSearchParams()
  if (pkId) q.set('pk_id', pkId)
  if (soloCambios) q.set('solo_cambios', 'true')
  if (baselineId) q.set('baseline_id', baselineId)
  if (targetId) q.set('target_id', targetId)
  const res = await fetch(`${API}/prog-obra/${cid}/comparar?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function fetchDesviaciones(API, cid, token, { baselineId, targetId } = {}) {
  const q = new URLSearchParams()
  if (baselineId) q.set('baseline_id', baselineId)
  if (targetId) q.set('target_id', targetId)
  const res = await fetch(`${API}/prog-obra/${cid}/desviaciones?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}
