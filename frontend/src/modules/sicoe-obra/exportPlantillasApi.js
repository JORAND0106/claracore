import { API_BASE } from '../../apiBase'

const API = API_BASE

export const SICOE_EXPORT_MODULO = 'sicoe_obra'

function authHeaders(token) {
  const t = token || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token')) || ''
  return t
    ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

async function readError(r, fallback) {
  let detail = fallback
  try {
    const j = await r.json()
    detail = j?.detail || detail
  } catch { /* ignore */ }
  return typeof detail === 'string' ? detail : fallback
}

export async function fetchExportPlantillas(token, modulo = SICOE_EXPORT_MODULO) {
  const r = await fetch(`${API}/export-plantillas/?modulo=${encodeURIComponent(modulo)}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error(await readError(r, 'No se pudieron cargar las plantillas'))
  return r.json()
}

export async function crearExportPlantilla(token, { modulo = SICOE_EXPORT_MODULO, nombre, campos }) {
  const r = await fetch(`${API}/export-plantillas/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ modulo, nombre, campos }),
  })
  if (!r.ok) throw new Error(await readError(r, 'No se pudo guardar la plantilla'))
  return r.json()
}

export async function actualizarExportPlantilla(token, id, { nombre, campos }) {
  const body = {}
  if (nombre !== undefined) body.nombre = nombre
  if (campos !== undefined) body.campos = campos
  const r = await fetch(`${API}/export-plantillas/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await readError(r, 'No se pudo actualizar la plantilla'))
  return r.json()
}

export async function eliminarExportPlantilla(token, id) {
  const r = await fetch(`${API}/export-plantillas/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error(await readError(r, 'No se pudo eliminar la plantilla'))
  return r.json()
}
