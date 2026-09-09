/**
 * API helpers — ítems de cobro asignados desde Presupuesto.
 */
import { API_BASE } from '../../apiBase'

function authHeaders(token, extra = {}) {
  const h = { ...extra }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function parseError(res) {
  let detail = `Error ${res.status}`
  try {
    const j = await res.json()
    detail = j.detail || j.message || detail
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  } catch { /* ignore */ }
  throw new Error(detail)
}

/** GET ítems con cantidad > 0 asignada al sub en Presupuesto. */
export async function fetchItemsCobroAsignados(subId, token) {
  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/items-cobro-asignados`, {
    headers: authHeaders(token),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

/**
 * POST bulk upsert VU Costo M.O.
 * @param {number} subId
 * @param {{ listado_precio_id: number, precio_unitario_sub: number }[]} items
 * @param {string} token
 */
export async function bulkUpsertPreciosSub(subId, items, token) {
  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/precios/bulk`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}
