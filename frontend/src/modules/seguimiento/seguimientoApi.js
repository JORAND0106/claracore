import { API_BASE, apiFetchSignal } from '../../apiBase'

function authHeaders(token, json = true) {
  const h = {}
  if (token) h.Authorization = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function parseOrThrow(res) {
  if (res.ok) {
    if (res.status === 204) return null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return res.json()
    return res
  }
  let detail = `Error ${res.status}`
  try {
    const j = await res.json()
    detail = j.detail || j.message || detail
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  } catch { /* ignore */ }
  const err = new Error(detail)
  err.status = res.status
  throw err
}

function mapNetworkError(e) {
  if (!e) return new Error('Error de red')
  // Ya es error HTTP parseado
  if (e.status != null) return e
  const name = e.name || ''
  const msg = String(e.message || e || '')
  if (name === 'AbortError' || name === 'TimeoutError' || /aborted|timeout|signal is aborted/i.test(msg)) {
    const err = new Error('La solicitud tardó demasiado. Intente de nuevo.')
    err.name = 'TimeoutError'
    return err
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return new Error('No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.')
  }
  return e instanceof Error ? e : new Error(msg || 'Error de red')
}

export function createSeguimientoApi(contratoId, token) {
  const cid = contratoId
  const t = token

  async function get(path, timeout = 30000) {
    const sig = apiFetchSignal(timeout)
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: authHeaders(t, false),
        ...(sig ? { signal: sig } : {}),
      })
      return parseOrThrow(res)
    } catch (e) {
      throw mapNetworkError(e)
    }
  }

  async function send(method, path, body, timeout = 60000) {
    const sig = apiFetchSignal(timeout)
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: authHeaders(t, true),
        body: body != null ? JSON.stringify(body) : undefined,
        ...(sig ? { signal: sig } : {}),
      })
      return parseOrThrow(res)
    } catch (e) {
      throw mapNetworkError(e)
    }
  }

  return {
    listActas: (params = {}) => {
      const q = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') q.set(k, String(v))
      })
      const qs = q.toString()
      return get(`/seguimiento/${cid}/actas${qs ? `?${qs}` : ''}`)
    },
    listUsuarios: () => get(`/seguimiento/${cid}/usuarios`),
    proximoConsecutivo: () => get(`/seguimiento/${cid}/actas/proximo-consecutivo`),
    compromisosAbiertos: (excluirActaId, tipoActa) => {
      const q = new URLSearchParams()
      if (excluirActaId != null && excluirActaId !== '') q.set('excluir_acta_id', String(excluirActaId))
      if (tipoActa) q.set('tipo_acta', String(tipoActa))
      const qs = q.toString()
      return get(`/seguimiento/${cid}/compromisos-abiertos${qs ? `?${qs}` : ''}`)
    },
    getActa: (actaId) => get(`/seguimiento/${cid}/actas/${actaId}`),
    createActa: (body) => send('POST', `/seguimiento/${cid}/actas`, body),
    updateActa: (actaId, body) => send('PUT', `/seguimiento/${cid}/actas/${actaId}`, body),
    deleteActa: (actaId) => send('DELETE', `/seguimiento/${cid}/actas/${actaId}`),
    addIdea: (actaId, texto = '') => send('POST', `/seguimiento/${cid}/actas/${actaId}/ideas`, { texto }),
    updateIdea: (ideaId, texto) => send('PUT', `/seguimiento/${cid}/ideas/${ideaId}`, { texto }),
    crearCompromiso: (actaId, ideaId, body) =>
      send('POST', `/seguimiento/${cid}/actas/${actaId}/ideas/${ideaId}/compromiso`, body),
    firmarActa: (actaId, asistenteId) =>
      send('POST', `/seguimiento/${cid}/actas/${actaId}/firmar`, { asistente_id: asistenteId }),
    async pdfActaBlob(actaId) {
      const sig = apiFetchSignal(90000)
      const res = await fetch(`${API_BASE}/seguimiento/${cid}/actas/${actaId}/pdf`, {
        headers: authHeaders(t, false),
        ...(sig ? { signal: sig } : {}),
      })
      if (!res.ok) {
        let detail = `No se pudo generar el PDF (${res.status})`
        try {
          const j = await res.json()
          if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
        } catch { /* ignore */ }
        throw new Error(detail)
      }
      const buf = await res.arrayBuffer()
      if (!buf || buf.byteLength < 20) throw new Error('El PDF generado está vacío')
      return new Blob([buf], { type: 'application/pdf' })
    },
    listBandeja: (params = {}) => {
      const q = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== '') q.set(k, String(v))
      })
      if (cid != null && params.contrato_id == null) q.set('contrato_id', cid)
      const qs = q.toString()
      return get(`/seguimiento/bandeja${qs ? `?${qs}` : ''}`)
    },
    listWidget: () => get(`/seguimiento/bandeja/widget${cid != null ? `?contrato_id=${cid}` : ''}`),
    getItem: (itemId) => get(`/seguimiento/items/${itemId}`),
    patchEstado: (itemId, estado_gestion, extra = {}) =>
      send('PATCH', `/seguimiento/items/${itemId}/estado`, { estado_gestion, ...extra }),
    patchAsignacionEstado: (itemId, body) =>
      send('PATCH', `/seguimiento/items/${itemId}/asignacion-estado`, body),
    destinarItem: (itemId, body) => send('POST', `/seguimiento/items/${itemId}/destinar`, body),
    deleteItem: (itemId) => send('DELETE', `/seguimiento/items/${itemId}`),
    comentar: (itemId, mensaje) => send('POST', `/seguimiento/items/${itemId}/comentarios`, { mensaje }),
    patchFechaCompromiso: (itemId, body) =>
      send('PATCH', `/seguimiento/items/${itemId}/fecha-compromiso`, body),
    revertirActa: (actaId) => send('POST', `/seguimiento/${cid}/actas/${actaId}/revertir`),
    async uploadEvidencia(itemId, file, notas = '') {
      const fd = new FormData()
      fd.append('archivo', file)
      if (notas) fd.append('notas', notas)
      const sig = apiFetchSignal(120000)
      const res = await fetch(`${API_BASE}/seguimiento/items/${itemId}/evidencia`, {
        method: 'POST',
        headers: authHeaders(t, false),
        body: fd,
        ...(sig ? { signal: sig } : {}),
      })
      return parseOrThrow(res)
    },
    solicitarJustificacion: (itemId, body) =>
      send('POST', `/seguimiento/items/${itemId}/justificacion`, body),
    revisarJustificacion: (justId, body) =>
      send('POST', `/seguimiento/justificaciones/${justId}/revisar`, body),
    crearTarea: (body) => send('POST', '/seguimiento/tareas', {
      ...body,
      contrato_id: body?.contrato_id ?? cid,
    }),
    updateTarea: (itemId, body) => send('PUT', `/seguimiento/tareas/${itemId}`, body),
    pegarImagenTarea: (itemId, body) => send('POST', `/seguimiento/tareas/${itemId}/imagen`, body),
    redaccionClara: (body) => send('POST', '/seguimiento/redaccion-clara', body, 120000),
  }
}
