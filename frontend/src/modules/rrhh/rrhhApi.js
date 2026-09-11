import { API_BASE } from '../../apiBase'

async function parseError(res) {
  let detail = `Error ${res.status}`
  try {
    const j = await res.json()
    if (typeof j?.detail === 'string') detail = j.detail
    else if (Array.isArray(j?.detail)) detail = j.detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
    else if (j?.message) detail = j.message
  } catch {
    /* ignore */
  }
  throw new Error(detail)
}

async function apiJson(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (formData) {
    payload = formData
  } else if (body != null) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload })
  if (!res.ok) await parseError(res)
  if (res.status === 204) return null
  return res.json()
}

export function createRrhhApi(contratoId, token) {
  const base = `/rrhh/${contratoId}`

  return {
    listEmpresas: () => apiJson(`${base}/empresas-contratantes`, { token }),
    catalogoDocs: () => apiJson(`${base}/catalogos/documentos`, { token }),

    listCatalogoOpciones: () => apiJson(`${base}/catalogo-opciones`, { token }),
    addCatalogoOpcion: (categoria, valor) =>
      apiJson(`${base}/catalogo-opciones/${encodeURIComponent(categoria)}`, {
        method: 'POST',
        token,
        body: { valor },
      }),

    listTrabajadores: ({ q, estado } = {}) => {
      const qs = new URLSearchParams()
      if (q) qs.set('q', q)
      if (estado) qs.set('estado', estado)
      const s = qs.toString()
      return apiJson(`${base}/trabajadores${s ? `?${s}` : ''}`, { token })
    },
    getTrabajador: (id) => apiJson(`${base}/trabajadores/${id}`, { token }),
    createTrabajador: (body) =>
      apiJson(`${base}/trabajadores`, { method: 'POST', token, body }),
    updateTrabajador: (id, body) =>
      apiJson(`${base}/trabajadores/${id}`, { method: 'PUT', token, body }),
    deleteTrabajador: (id) =>
      apiJson(`${base}/trabajadores/${id}`, { method: 'DELETE', token }),

    uploadFoto: async (trabajadorId, archivo) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      return apiJson(`${base}/trabajadores/${trabajadorId}/foto`, {
        method: 'POST',
        token,
        formData: fd,
      })
    },
    fotoUrl: (trabajadorId) => `${API_BASE}${base}/trabajadores/${trabajadorId}/foto`,
    deleteFoto: (trabajadorId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/foto`, { method: 'DELETE', token }),

    uploadFirma: async (trabajadorId, archivo) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      return apiJson(`${base}/trabajadores/${trabajadorId}/firma`, {
        method: 'POST',
        token,
        formData: fd,
      })
    },
    firmaUrl: (trabajadorId) => `${API_BASE}${base}/trabajadores/${trabajadorId}/firma`,
    deleteFirma: (trabajadorId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/firma`, { method: 'DELETE', token }),

    listDocumentos: (trabajadorId, categoria) => {
      const qs = categoria ? `?categoria=${encodeURIComponent(categoria)}` : ''
      return apiJson(`${base}/trabajadores/${trabajadorId}/documentos${qs}`, { token })
    },
    uploadDocumento: async (trabajadorId, { categoria, tipo, archivo, version_label, tipo_otro_texto, notas, marcar_vigente = true }) => {
      const fd = new FormData()
      fd.append('categoria', categoria)
      fd.append('tipo', tipo)
      fd.append('archivo', archivo)
      if (version_label) fd.append('version_label', version_label)
      if (tipo_otro_texto) fd.append('tipo_otro_texto', tipo_otro_texto)
      if (notas) fd.append('notas', notas)
      fd.append('marcar_vigente', marcar_vigente ? 'true' : 'false')
      return apiJson(`${base}/trabajadores/${trabajadorId}/documentos`, {
        method: 'POST',
        token,
        formData: fd,
      })
    },
    documentoArchivoUrl: (trabajadorId, docId) =>
      `${API_BASE}${base}/trabajadores/${trabajadorId}/documentos/${docId}/archivo`,
    marcarDocVigente: (trabajadorId, docId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/documentos/${docId}/vigente`, {
        method: 'POST',
        token,
      }),
    deleteDocumento: (trabajadorId, docId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/documentos/${docId}`, {
        method: 'DELETE',
        token,
      }),

    listContratosLaborales: (trabajadorId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/contratos-laborales`, { token }),
    generarContratoLaboral: (trabajadorId, body) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/contratos-laborales/generar`, {
        method: 'POST',
        token,
        body,
      }),
    contratoLaboralArchivoUrl: (trabajadorId, genId) =>
      `${API_BASE}${base}/trabajadores/${trabajadorId}/contratos-laborales/${genId}/archivo`,
    deleteContratoLaboral: (trabajadorId, genId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/contratos-laborales/${genId}`, {
        method: 'DELETE',
        token,
      }),

    // ── Nómina ──────────────────────────────────────────────────────────────
    listNovedades: ({ trabajadorId, fechaDesde, fechaHasta } = {}) => {
      const qs = new URLSearchParams()
      if (trabajadorId) qs.set('trabajador_id', trabajadorId)
      if (fechaDesde) qs.set('fecha_desde', fechaDesde)
      if (fechaHasta) qs.set('fecha_hasta', fechaHasta)
      const s = qs.toString()
      return apiJson(`${base}/novedades${s ? `?${s}` : ''}`, { token })
    },
    createNovedad: (body) =>
      apiJson(`${base}/novedades`, { method: 'POST', token, body }),
    deleteNovedad: (id) =>
      apiJson(`${base}/novedades/${id}`, { method: 'DELETE', token }),

    listHorasExtras: ({ trabajadorId, fechaDesde, fechaHasta } = {}) => {
      const qs = new URLSearchParams()
      if (trabajadorId) qs.set('trabajador_id', trabajadorId)
      if (fechaDesde) qs.set('fecha_desde', fechaDesde)
      if (fechaHasta) qs.set('fecha_hasta', fechaHasta)
      const s = qs.toString()
      return apiJson(`${base}/horas-extras${s ? `?${s}` : ''}`, { token })
    },
    createHoraExtra: (body) =>
      apiJson(`${base}/horas-extras`, { method: 'POST', token, body }),
    deleteHoraExtra: (id) =>
      apiJson(`${base}/horas-extras/${id}`, { method: 'DELETE', token }),

    listNominas: () => apiJson(`${base}/nominas`, { token }),
    generarNomina: (body) =>
      apiJson(`${base}/nominas/generar`, { method: 'POST', token, body }),
    getNomina: (id) => apiJson(`${base}/nominas/${id}`, { token }),
    regenerarNomina: (id) =>
      apiJson(`${base}/nominas/${id}/regenerar`, { method: 'POST', token }),
    cerrarNomina: (id) =>
      apiJson(`${base}/nominas/${id}/cerrar`, { method: 'POST', token }),
    anularNomina: (id) =>
      apiJson(`${base}/nominas/${id}/anular`, { method: 'POST', token }),
    nominaXlsxUrl: (id) => `${API_BASE}${base}/nominas/${id}/xlsx`,
    desprendibleUrl: (nominaId, itemId) =>
      `${API_BASE}${base}/nominas/${nominaId}/items/${itemId}/desprendible`,

    listLiquidaciones: () => apiJson(`${base}/liquidaciones`, { token }),
    generarLiquidacion: (body) =>
      apiJson(`${base}/liquidaciones`, { method: 'POST', token, body }),
    getLiquidacion: (id) => apiJson(`${base}/liquidaciones/${id}`, { token }),
    liquidacionPdfUrl: (id) => `${API_BASE}${base}/liquidaciones/${id}/pdf`,
    getProvisiones: (trabajadorId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/provisiones`, { token }),

    ocrBancario: async (trabajadorId, archivo) => {
      const fd = new FormData()
      fd.append('archivo', archivo)
      return apiJson(`${base}/trabajadores/${trabajadorId}/documentacion/ocr-bancario`, {
        method: 'POST',
        token,
        formData: fd,
      })
    },
    consolidarDocumentacion: (trabajadorId) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/documentacion/consolidar`, {
        method: 'POST',
        token,
      }),
    setValidacionDocumentacion: (trabajadorId, body) =>
      apiJson(`${base}/trabajadores/${trabajadorId}/documentacion/validacion`, {
        method: 'POST',
        token,
        body,
      }),
    docConsolidadoUrl: (trabajadorId) =>
      `${API_BASE}${base}/trabajadores/${trabajadorId}/documentacion/consolidado`,
    previewConsolidadoUrl: (trabajadorId) =>
      `${API_BASE}${base}/trabajadores/${trabajadorId}/documentacion/preview-consolidado`,
    eliminarTipoOtro: (body) =>
      apiJson(`${base}/documentacion/eliminar-tipo-otro`, {
        method: 'POST',
        token,
        body,
      }),

    async downloadBlob(url, filename) {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) await parseError(res)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename || 'archivo'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    },

    async fetchBlobUrl(url) {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) await parseError(res)
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    },
  }
}
