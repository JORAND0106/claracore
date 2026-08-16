/**
 * Cliente API — módulo Almacén.
 */
import { API_BASE } from '../apiBase'
import { openPosPdfBlob, printPosPdfBlob } from './almacenPosPrint'

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  }
}

async function parseJson(res) {
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const msg = data.detail || data.message || (res.statusText && res.statusText !== 'OK' ? res.statusText : null) || `Error ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

/** Envuelve fetch para mapear errores de red a mensajes claros. */
async function fetchJson(url, options) {
  try {
    const res = await fetch(url, options)
    return await parseJson(res)
  } catch (err) {
    const msg = String(err?.message || err || '')
    if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)) {
      throw new Error('Failed to fetch')
    }
    throw err
  }
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

    getListadoCapitulos: () =>
      fetch(`${base}/listado-capitulos`, { headers: headers(token) }).then(parseJsonList),

    getListadoItems: (capitulo) =>
      fetch(`${base}/listado-items?capitulo=${encodeURIComponent(capitulo)}`, { headers: headers(token) }).then(parseJsonList),

    searchInsumos: (q = '') =>
      fetch(`${base}/insumos/search?q=${encodeURIComponent(q)}`, { headers: headers(token) }).then(parseJsonList),

    searchInsumosCatalog: (q = '', limit = 50, offset = 0) =>
      fetch(`${base}/insumos/catalog?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`, { headers: headers(token) }).then(parseJson),

    createInsumoForm: (formData) =>
      fetch(`${base}/insumos`, {
        method: 'POST',
        headers: headers(token),
        body: formData,
      }).then(parseJson),

    createInsumo: (body) =>
      fetch(`${base}/insumos/json`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    deleteInsumo: (insumoId) =>
      fetch(`${base}/insumos/${insumoId}`, {
        method: 'DELETE',
        headers: headers(token),
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

    getTransportadorPorPlaca: (placa) =>
      fetch(`${base}/transportadores/por-placa?placa=${encodeURIComponent(placa)}`, {
        headers: headers(token),
      }).then(parseJson),

    searchTransportadores: (q = '') =>
      fetch(`${base}/transportadores/search?q=${encodeURIComponent(q)}`, {
        headers: headers(token),
      }).then(parseJsonList),

    getPresupuestoRegistros: (capitulo, item, pkId, excludeSolicitudId) => {
      const params = new URLSearchParams({
        capitulo,
        item,
        pk_id: pkId,
      })
      if (excludeSolicitudId) params.set('exclude_solicitud_id', String(excludeSolicitudId))
      return fetch(`${base}/presupuesto-registros?${params}`, { headers: headers(token) }).then(parseJson)
    },

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

    listSolicitudes: (estado, { resumen = true } = {}) => {
      const params = new URLSearchParams()
      if (estado) params.set('estado', estado)
      params.set('resumen', resumen ? 'true' : 'false')
      const q = `?${params.toString()}`
      return fetch(`${base}/solicitudes${q}`, { headers: headers(token) }).then(parseJsonList)
    },

    countSolicitudes: (estado) => {
      const q = estado ? `?estado=${encodeURIComponent(estado)}` : ''
      return fetch(`${base}/solicitudes-count${q}`, { headers: headers(token) })
        .then(parseJson)
        .then((r) => Number(r?.count) || 0)
    },

    getSolicitud: (id, { ligera = false } = {}) => {
      const q = ligera ? '?ligera=1' : ''
      return fetchJson(`${base}/solicitudes/${id}${q}`, { headers: headers(token) })
    },

    createSolicitud: (body) =>
      fetchJson(`${base}/solicitudes`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }),

    updateSolicitud: (id, body) =>
      fetchJson(`${base}/solicitudes/${id}`, {
        method: 'PUT',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }),

    enviarSolicitud: (id) =>
      fetchJson(`${base}/solicitudes/${id}/enviar`, {
        method: 'POST',
        headers: headers(token),
      }),

    aprobarSolicitud: (id, body = {}) =>
      fetch(`${base}/solicitudes/${id}/aprobar`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    aprobarTodosItemsSolicitud: (id) =>
      fetch(`${base}/solicitudes/${id}/aprobar-todos-items`, {
        method: 'POST',
        headers: headers(token),
      }).then(parseJson),

    validarItemSolicitud: (solicitudId, itemId, body) =>
      fetch(`${base}/solicitudes/${solicitudId}/items/${itemId}/validar`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    mapearItemSolicitud: (solicitudId, itemId, body) =>
      fetch(`${base}/solicitudes/${solicitudId}/items/${itemId}/mapear`, {
        method: 'PATCH',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    rechazarSolicitud: (id, motivo) =>
      fetch(`${base}/solicitudes/${id}/rechazar`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ motivo }),
      }).then(parseJson),

    anularSolicitud: (id) =>
      fetch(`${base}/solicitudes/${id}/anular`, {
        method: 'POST',
        headers: headers(token),
      }).then(parseJson),

    eliminarSolicitudDesarrollador: (id) =>
      fetch(`${base}/solicitudes/${id}/desarrollador`, {
        method: 'DELETE',
        headers: headers(token),
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

    ocPdfDownloadUrl: (ocId) => `${base}/ordenes-compra/${ocId}/pdf/download`,

    async openOcPdf(ocId) {
      const res = await fetch(`${base}/ordenes-compra/${ocId}/pdf/download`, {
        headers: headers(token),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try {
          const data = await res.json()
          const d = data.detail
          msg = typeof d === 'string' ? d : JSON.stringify(d)
        } catch {
          const txt = await res.text().catch(() => '')
          if (txt) msg = txt.slice(0, 240)
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      if (!blob?.size) throw new Error('El PDF está vacío o no está disponible.')
      const url = URL.createObjectURL(blob)
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        const a = document.createElement('a')
        a.href = url
        a.download = `OC-${ocId}.pdf`
        a.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000)
    },

    listEntradas: () =>
      fetch(`${base}/entradas`, { headers: headers(token) }).then(parseJsonList),

    getEntrada: (entradaId) =>
      fetch(`${base}/entradas/${entradaId}`, { headers: headers(token) }).then(parseJson),

    deleteEntrada: (entradaId) =>
      fetch(`${base}/entradas/${entradaId}`, {
        method: 'DELETE',
        headers: headers(token),
      }).then(parseJson),

    createEntrada: (formData) =>
      fetch(`${base}/entradas`, {
        method: 'POST',
        headers: headers(token),
        body: formData,
      }).then(parseJson),

    remisionDownloadUrl: (entradaId) => `${base}/entradas/${entradaId}/remision/download`,

    listInventario: () =>
      fetch(`${base}/inventario`, { headers: headers(token) }).then(parseJsonList),

    getInventarioGraficos: (capitulo, item) => {
      const params = new URLSearchParams()
      if (capitulo) params.set('capitulo', capitulo)
      if (item) params.set('item', item)
      const q = params.toString() ? `?${params.toString()}` : ''
      return fetch(`${base}/inventario/graficos${q}`, { headers: headers(token) }).then(parseJson)
    },

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

    listInsumosPorProveedor: (proveedorId, q = '') =>
      fetch(`${base}/proveedores/${proveedorId}/insumos?q=${encodeURIComponent(q)}`, {
        headers: headers(token),
      }).then(parseJsonList),

    buscarOrdenesCompraVigentes: (proveedorId, insumoId) =>
      fetch(`${base}/ordenes-compra/buscar-vigentes?proveedor_id=${proveedorId}&insumo_id=${insumoId}`, {
        headers: headers(token),
      }).then(parseJsonList),

    buscarOrdenesCompraPorPk: (pkId) =>
      fetch(`${base}/ordenes-compra/contexto-por-pk?pk_id=${encodeURIComponent(pkId)}`, {
        headers: headers(token),
      }).then(parseJson),

    getProximoNumeroDisposicion: () =>
      fetch(`${base}/entradas/proximo-numero-disposicion`, {
        headers: headers(token),
      }).then(parseJson),

    ocrRemisionEntrada: (file) => {
      const fd = new FormData()
      fd.append('archivo', file)
      return fetch(`${base}/entradas/ocr-remision`, {
        method: 'POST',
        headers: headers(token),
        body: fd,
      }).then(parseJson)
    },

    disposicionDownloadUrl: (entradaId) => `${base}/entradas/${entradaId}/disposicion/download`,

    async openDisposicionPdf(entradaId) {
      const res = await fetch(`${base}/entradas/${entradaId}/disposicion/download`, {
        headers: headers(token),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }
      const blob = await res.blob()
      await openPosPdfBlob(blob, { filename: `disposicion-${entradaId}.pdf` })
    },

    async printDisposicionPdf(entradaId) {
      const res = await fetch(`${base}/entradas/${entradaId}/disposicion/download`, {
        headers: headers(token),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }
      const blob = await res.blob()
      await printPosPdfBlob(blob, { filename: `disposicion-${entradaId}.pdf` })
    },

    listSalidas: () =>
      fetch(`${base}/salidas`, { headers: headers(token) }).then(parseJsonList),

    getSalida: (salidaId) =>
      fetch(`${base}/salidas/${salidaId}`, { headers: headers(token) }).then(parseJson),

    createSalida: (body) =>
      fetch(`${base}/salidas`, {
        method: 'POST',
        headers: headers(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }).then(parseJson),

    deleteSalida: (salidaId) =>
      fetch(`${base}/salidas/${salidaId}`, {
        method: 'DELETE',
        headers: headers(token),
      }).then(parseJson),

    searchUsuariosReceptorObra: (q = '') =>
      fetch(`${base}/usuarios-receptor-obra?q=${encodeURIComponent(q)}`, {
        headers: headers(token),
      }).then(parseJsonList),

    listEntradasDisponiblesPorPk: (pkId) =>
      fetch(`${base}/entradas/disponibles-por-pk?pk_id=${encodeURIComponent(pkId)}`, {
        headers: headers(token),
      }).then(parseJsonList),

    salidaPdfDownloadUrl: (salidaId) => `${base}/salidas/${salidaId}/recibo/download`,

    async openSalidaPdf(salidaId) {
      const res = await fetch(`${base}/salidas/${salidaId}/recibo/download`, {
        headers: headers(token),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }
      const blob = await res.blob()
      await openPosPdfBlob(blob, { filename: `salida-${salidaId}.pdf` })
    },

    async printSalidaPdf(salidaId) {
      const res = await fetch(`${base}/salidas/${salidaId}/recibo/download`, {
        headers: headers(token),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }
      const blob = await res.blob()
      await printPosPdfBlob(blob, { filename: `salida-${salidaId}.pdf` })
    },
  }
}
