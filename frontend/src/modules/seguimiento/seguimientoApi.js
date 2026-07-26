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

export function createSeguimientoApi(contratoId, token) {
  const cid = contratoId
  const t = token

  async function get(path, timeout = 30000) {
    const sig = apiFetchSignal(timeout)
    const res = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders(t, false),
      ...(sig ? { signal: sig } : {}),
    })
    return parseOrThrow(res)
  }

  async function send(method, path, body, timeout = 60000) {
    const sig = apiFetchSignal(timeout)
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: authHeaders(t, true),
      body: body != null ? JSON.stringify(body) : undefined,
      ...(sig ? { signal: sig } : {}),
    })
    return parseOrThrow(res)
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
    compromisosAbiertos: (excluirActaId) =>
      get(`/seguimiento/${cid}/compromisos-abiertos${excluirActaId ? `?excluir_acta_id=${excluirActaId}` : ''}`),
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
    destinarItem: (itemId, body) => send('POST', `/seguimiento/items/${itemId}/destinar`, body),
    deleteItem: (itemId) => send('DELETE', `/seguimiento/items/${itemId}`),
    comentar: (itemId, mensaje) => send('POST', `/seguimiento/items/${itemId}/comentarios`, { mensaje }),
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
    crearTarea: (body) => send('POST', '/seguimiento/tareas', body),
    updateTarea: (itemId, body) => send('PUT', `/seguimiento/tareas/${itemId}`, body),
    pegarImagenTarea: (itemId, body) => send('POST', `/seguimiento/tareas/${itemId}/imagen`, body),
    redaccionClara: (body) => send('POST', '/seguimiento/redaccion-clara', body, 120000),
  }
}
