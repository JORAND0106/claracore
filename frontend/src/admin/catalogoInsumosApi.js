/**
 * Cliente API — Catálogo de insumos (panel administrativo).
 */
import { API_BASE } from '../apiBase'

function headers(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra }
}

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.detail || data.message || `Error ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

export function createCatalogoInsumosApi(contratoId, token) {
  const base = `${API_BASE}/catalogo-insumos/${contratoId}`

  return {
    getConfig: () => fetch(`${base}/config`, { headers: headers(token) }).then(parseJson),

    getNextCodigo: () => fetch(`${base}/next-codigo`, { headers: headers(token) }).then(parseJson),

    listInsumos: (q = '', limit = 80, offset = 0) =>
      fetch(`${base}/insumos?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`, {
        headers: headers(token),
      }).then(parseJson),

    checkDuplicado: (body) =>
      fetch(`${base}/check-duplicado`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    createInsumoForm: (formData) =>
      fetch(`${base}/insumos`, { method: 'POST', headers: headers(token), body: formData }).then(parseJson),

    updateInsumoForm: (insumoId, formData) =>
      fetch(`${base}/insumos/${insumoId}`, { method: 'PUT', headers: headers(token), body: formData }).then(parseJson),

    deleteInsumo: (insumoId) =>
      fetch(`${base}/insumos/${insumoId}`, { method: 'DELETE', headers: headers(token) }).then(parseJson),

    listProveedores: (q = '', limit = 100, offset = 0) =>
      fetch(`${base}/proveedores?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`, {
        headers: headers(token),
      }).then(parseJson),

    searchProveedores: (q = '', limit = 25) =>
      fetch(`${base}/proveedores/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
        headers: headers(token),
      }).then(parseJson),

    deleteProveedor: (proveedorId) =>
      fetch(`${base}/proveedores/${proveedorId}`, { method: 'DELETE', headers: headers(token) }).then(parseJson),

    getHistorial: (insumoId) =>
      fetch(`${base}/insumos/${insumoId}/historial`, { headers: headers(token) }).then(parseJson),

    ocrCotizacion: (file) => {
      const fd = new FormData()
      fd.append('archivo', file)
      return fetch(`${base}/ocr/cotizacion`, { method: 'POST', headers: headers(token), body: fd }).then(parseJson)
    },

    importCsv: (file, modo = 'agregar') => {
      const fd = new FormData()
      fd.append('archivo', file)
      fd.append('modo', modo)
      return fetch(`${base}/import/csv`, { method: 'POST', headers: headers(token), body: fd }).then(parseJson)
    },

    plantillaCsvUrl: () => `${base}/import/plantilla.csv`,

    downloadPlantillaCsv: async () => {
      const res = await fetch(`${base}/import/plantilla.csv`, { headers: headers(token) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'plantilla_catalogo_insumos.csv'
      a.click()
      URL.revokeObjectURL(url)
    },
  }
}

export function fmtMoney(v) {
  if (v == null || v === '') return '—'
  return `$${Math.round(Number(v)).toLocaleString('es-CO')}`
}
