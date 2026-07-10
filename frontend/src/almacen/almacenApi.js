/**
 * Cliente API — módulo Almacén.
 */
import { API_BASE } from '../apiBase'

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  }
}

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.detail || data.message || `Error ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

/** Respuesta de listados: garantiza array aunque el proxy devuelva basura. */
async function parseJsonList(res) {
  const data = await parseJson(res)
  return Array.isArray(data) ? data : []
}

export function createAlmacenApi(contratoId, token) {
  const base = `${API_BASE}/almacen/${contratoId}`

  return {
    getConfig: () =>
      fetch(`${base}/config`, { headers: headers(token) }).then(parseJson),

    updateConfig: (body) =>
      fetch(`${base}/config`, {
        method: 'PUT',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    getPresupuestoItems: () =>
      fetch(`${base}/presupuesto-items`, { headers: headers(token) }).then(parseJsonList),

    searchInsumos: (q = '') =>
      fetch(`${base}/insumos/search?q=${encodeURIComponent(q)}`, { headers: headers(token) }).then(parseJsonList),

    createInsumo: (body) =>
      fetch(`${base}/insumos`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    listPreciosInsumoProveedor: (insumoId) =>
      fetch(`${base}/insumos/${insumoId}/precios-proveedor`, { headers: headers(token) }).then(parseJsonList),

    searchProveedores: (q = '') =>
      fetch(`${base}/proveedores/search?q=${encodeURIComponent(q)}`, { headers: headers(token) }).then(parseJsonList),

    createProveedor: (body) =>
      fetch(`${base}/proveedores`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    getPresupuestoContext: (presupuestoId, pkId, cantidad, excludeSolicitudId) => {
      const params = new URLSearchParams({
        presupuesto_id: String(presupuestoId),
        pk_id: pkId,
        cantidad: String(cantidad || 0),
      })
      if (excludeSolicitudId) params.set('exclude_solicitud_id', String(excludeSolicitudId))
      return fetch(`${base}/presupuesto-context?${params}`, { headers: headers(token) }).then(parseJson)
    },

    previewInsumoLine: (body) =>
      fetch(`${base}/insumos/preview-line`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    listSolicitudes: (estado) => {
      const q = estado ? `?estado=${encodeURIComponent(estado)}` : ''
      return fetch(`${base}/solicitudes${q}`, { headers: headers(token) }).then(parseJsonList)
    },

    getSolicitud: (id) =>
      fetch(`${base}/solicitudes/${id}`, { headers: headers(token) }).then(parseJson),

    createSolicitud: (body) =>
      fetch(`${base}/solicitudes`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    updateSolicitud: (id, body) =>
      fetch(`${base}/solicitudes/${id}`, {
        method: 'PUT',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    enviarSolicitud: (id) =>
      fetch(`${base}/solicitudes/${id}/enviar`, {
        method: 'POST',
        headers: headers(token),
      }).then(parseJson),

    aprobarSolicitud: (id, body = {}) =>
      fetch(`${base}/solicitudes/${id}/aprobar`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    rechazarSolicitud: (id, motivo) =>
      fetch(`${base}/solicitudes/${id}/rechazar`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ motivo }),
      }).then(parseJson),

    addCotizacion: (itemId, body) =>
      fetch(`${base}/solicitudes/items/${itemId}/cotizaciones`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    deleteCotizacion: (cotId) =>
      fetch(`${base}/cotizaciones/${cotId}`, {
        method: 'DELETE',
        headers: headers(token),
      }).then(parseJson),

    listOrdenesCompra: () =>
      fetch(`${base}/ordenes-compra`, { headers: headers(token) }).then(parseJsonList),

    getOrdenCompra: (ocId) =>
      fetch(`${base}/ordenes-compra/${ocId}`, { headers: headers(token) }).then(parseJson),

    uploadFactura: (ocId, file) => {
      const fd = new FormData()
      fd.append('archivo', file)
      return fetch(`${base}/ordenes-compra/${ocId}/factura`, {
        method: 'POST',
        headers: headers(token),
        body: fd,
      }).then(parseJson)
    },

    facturaDownloadUrl: (ocId) => `${base}/ordenes-compra/${ocId}/factura/download`,

    listEntradas: () =>
      fetch(`${base}/entradas`, { headers: headers(token) }).then(parseJsonList),

    createEntrada: (formData) =>
      fetch(`${base}/entradas`, {
        method: 'POST',
        headers: headers(token),
        body: formData,
      }).then(parseJson),

    remisionDownloadUrl: (entradaId) => `${base}/entradas/${entradaId}/remision/download`,

    listInventario: () =>
      fetch(`${base}/inventario`, { headers: headers(token) }).then(parseJsonList),

    listMovimientos: (presupuestoId, material) => {
      const q = material ? `?material=${encodeURIComponent(material)}` : ''
      return fetch(`${base}/inventario/${presupuestoId}/movimientos${q}`, {
        headers: headers(token),
      }).then(parseJsonList)
    },

    exportInventarioExcel: async () => {
      const res = await fetch(`${base}/inventario/export/excel`, { headers: headers(token) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Error al exportar')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventario_almacen_${contratoId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    },

    getAlertasVencimiento: () =>
      fetch(`${base}/alertas-vencimiento`, { headers: headers(token) }).then(parseJsonList),

    getExpediente: (ocId) =>
      fetch(`${base}/expedientes/${ocId}`, { headers: headers(token) }).then(parseJson),
  }
}
