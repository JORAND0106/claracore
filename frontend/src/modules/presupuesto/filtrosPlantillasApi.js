import { API_BASE } from '../../apiBase'
import { PPTO_FILTRO_MODULO } from './pptoFiltroCatalogo'

const API = API_BASE

function authHeaders(token) {
  const t = token || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token')) || ''
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export async function fetchFiltrosPlantillas(token, modulo = PPTO_FILTRO_MODULO) {
  const r = await fetch(`${API}/filtros-plantillas/?modulo=${encodeURIComponent(modulo)}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error('No se pudieron cargar las plantillas')
  return r.json()
}

export async function crearFiltroPlantilla(token, { modulo, nombre, filtros }) {
  const r = await fetch(`${API}/filtros-plantillas/`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ modulo, nombre, filtros }),
  })
  if (!r.ok) {
    let detail = 'No se pudo guardar la plantilla'
    try {
      const j = await r.json()
      detail = j?.detail || detail
    } catch { /* ignore */ }
    throw new Error(typeof detail === 'string' ? detail : 'No se pudo guardar la plantilla')
  }
  return r.json()
}

export async function eliminarFiltroPlantilla(token, id) {
  const r = await fetch(`${API}/filtros-plantillas/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error('No se pudo eliminar la plantilla')
  return r.json()
}

export async function fetchPresupuestoFiltrosOpciones(contratoId, token, params = {}) {
  const p = new URLSearchParams()
  if (params.capitulo) p.set('capitulo', params.capitulo)
  if (params.item) p.set('item', params.item)
  if (params.tramo) p.set('tramo', params.tramo)
  if (params.calzada) p.set('calzada', params.calzada)
  if (params.tipo_ejecucion) p.set('tipo_ejecucion', params.tipo_ejecucion)
  const qs = p.toString()
  const r = await fetch(`${API}/presupuesto/${contratoId}/filtros${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) return { capitulos: [], items: [], tramos: [], calzadas: [], competencias: [], unds: [], revisados: [], pre_interv_estados: [], sellados: [], dados_de_baja: [], tipos_ejecucion: [] }
  return r.json()
}
