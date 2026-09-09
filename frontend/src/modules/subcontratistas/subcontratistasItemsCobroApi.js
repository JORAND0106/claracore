/**
 * API helpers — hoja unificada de precios del subcontratista.
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

/** GET hoja unificada: Presupuesto + manuales. */
export async function fetchItemsCobroAsignados(subId, token) {
  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/items-cobro-asignados`, {
    headers: authHeaders(token),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

/**
 * POST bulk upsert VU Costo M.O. (+ origen / cantidad_manual).
 * @param {number} subId
 * @param {{ listado_precio_id: number, precio_unitario_sub: number, origen?: string, cantidad_manual?: number }[]} items
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

/** DELETE precio de origen manual. */
export async function deletePrecioSub(precioId, token) {
  const res = await fetch(`${API_BASE}/subcontratistas/precios/${precioId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

/** PUT AIU/IVA global del subcontratista. */
export async function upsertTributosSub(subId, tributos, token) {
  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/tributos`, {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tributos }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}
