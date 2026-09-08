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

/**
 * POST multipart póliza.
 * Campos: tipo, fecha_vencimiento, tipo_otro_texto?, valor_asegurado?, replaces_id?, notas?, archivo?
 */
export async function uploadPoliza(subId, fields, token) {
  const fd = new FormData()
  fd.append('tipo', fields.tipo || 'garantia')
  fd.append('fecha_vencimiento', fields.fecha_vencimiento || '')
  if (fields.tipo_otro_texto) fd.append('tipo_otro_texto', fields.tipo_otro_texto)
  if (fields.valor_asegurado != null && fields.valor_asegurado !== '') {
    fd.append('valor_asegurado', String(fields.valor_asegurado))
  }
  if (fields.replaces_id != null && fields.replaces_id !== '') {
    fd.append('replaces_id', String(fields.replaces_id))
  }
  if (fields.notas) fd.append('notas', fields.notas)
  if (fields.archivo) fd.append('archivo', fields.archivo, fields.archivo.name || 'poliza')

  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/polizas`, {
    method: 'POST',
    headers: authHeaders(token),
    body: fd,
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

/**
 * POST multipart documento requerido.
 * Campos: tipo, archivo, version_label?, periodo?, corte_id?, notas?, marcar_vigente?
 */
export async function uploadDocumento(subId, fields, token) {
  const fd = new FormData()
  fd.append('tipo', fields.tipo)
  if (!fields.archivo) throw new Error('El archivo del documento es obligatorio.')
  fd.append('archivo', fields.archivo, fields.archivo.name || 'documento')
  if (fields.version_label) fd.append('version_label', fields.version_label)
  if (fields.periodo) fd.append('periodo', fields.periodo)
  if (fields.corte_id != null && fields.corte_id !== '') {
    fd.append('corte_id', String(fields.corte_id))
  }
  if (fields.notas) fd.append('notas', fields.notas)
  if (fields.marcar_vigente != null) {
    fd.append('marcar_vigente', fields.marcar_vigente ? 'true' : 'false')
  }

  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/documentos`, {
    method: 'POST',
    headers: authHeaders(token),
    body: fd,
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

/** Descarga archivo de póliza/documento y retorna { blobUrl, mime, blob }. */
export async function fetchBlobUrl(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) await parseError(res)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const mime = blob.type || res.headers.get('content-type') || ''
  return { blobUrl, mime, blob }
}

export async function updatePolizaMeta(subId, polizaId, body, token) {
  const res = await fetch(`${API_BASE}/subcontratistas/${subId}/polizas/${polizaId}`, {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

export function polizaArchivoPath(subId, polizaId) {
  return `/subcontratistas/${subId}/polizas/${polizaId}/archivo`
}

export function documentoArchivoPath(subId, docId) {
  return `/subcontratistas/${subId}/documentos/${docId}/archivo`
}
