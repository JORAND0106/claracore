/**
 * Cliente HTTP — archivos de esquema en la carpeta privada del contrato.
 * Prefijo API: /esquema/assets
 */
import { API_BASE } from '../../apiBase.js'
import { dataUriToFile } from './esquemaSaveExtras.js'
import { ESQUEMA_SCENE_KIND } from './esquemaScenePersist.js'
import { esquemaAssetFileName } from './esquemaAssetsPaths.js'

async function authFetch(path, { token, method = 'GET', body, headers } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = await res.json()
      detail = j?.detail || detail
    } catch { /* ignore */ }
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    err.status = res.status
    throw err
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res
}

/**
 * Sube un archivo a la carpeta del contrato.
 */
export async function uploadEsquemaAsset({
  token,
  contratoId,
  modulo,
  reporteId = null,
  reporteNombre = null,
  registroId = null,
  registroNombre = null,
  kind,
  title = 'esquema',
  file,
  dataUri,
  mime,
  nombre,
  replacePath = null,
} = {}) {
  const form = new FormData()
  form.append('contrato_id', String(contratoId))
  form.append('modulo', String(modulo || 'esquema'))
  if (reporteId != null) form.append('reporte_id', String(reporteId))
  if (reporteNombre) form.append('reporte_nombre', String(reporteNombre))
  if (registroId != null) form.append('registro_id', String(registroId))
  if (registroNombre) form.append('registro_nombre', String(registroNombre))
  form.append('kind', String(kind || 'png'))
  form.append('title', String(title || 'esquema'))
  if (replacePath) form.append('replace_path', String(replacePath))

  let blobFile = file
  if (!blobFile && dataUri) {
    blobFile = dataUriToFile(
      dataUri,
      nombre || esquemaAssetFileName(kind, { title }),
      mime,
    )
  }
  if (!blobFile) throw new Error('Sin archivo para subir')
  form.append('file', blobFile, blobFile.name || nombre || 'esquema.bin')

  return authFetch('/esquema/assets/upload', {
    token,
    method: 'POST',
    body: form,
  })
}

/**
 * Lista archivos de un registro/documento.
 */
export async function listEsquemaAssets({
  token,
  contratoId,
  modulo,
  reporteId = null,
  registroId = null,
} = {}) {
  const q = new URLSearchParams({
    contrato_id: String(contratoId),
    modulo: String(modulo || 'esquema'),
  })
  if (reporteId != null) q.set('reporte_id', String(reporteId))
  if (registroId != null) q.set('registro_id', String(registroId))
  return authFetch(`/esquema/assets/list?${q}`, { token })
}

/**
 * Obtiene enlace temporal (vence en minutos) tras verificar permiso.
 */
export async function getEsquemaAssetTempUrl({
  token,
  contratoId,
  blobPath,
  ttlSeconds = 300,
} = {}) {
  return authFetch('/esquema/assets/temp-url', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contrato_id: Number(contratoId),
      blob_path: String(blobPath || ''),
      ttl_seconds: Number(ttlSeconds) || 300,
    }),
  })
}

/**
 * Descarga vía endpoint autenticado (proxy) — no usa URL pública.
 */
export async function downloadEsquemaAssetBlob({ token, contratoId, blobPath } = {}) {
  const q = new URLSearchParams({
    contrato_id: String(contratoId),
    path: String(blobPath || ''),
  })
  const res = await authFetch(`/esquema/assets/download?${q}`, { token })
  return res.blob()
}

/**
 * Sube PNG + escena + PDF + DXF (+ memorias/despieces) al paquete de nube.
 */
export async function uploadEsquemaAssetBundle({
  token,
  folder,
  title = 'esquema',
  pngDataUri,
  scene = null,
  adjuntos = [],
  replacePaths = null,
} = {}) {
  const base = {
    token,
    contratoId: folder.contratoId,
    modulo: folder.modulo,
    reporteId: folder.reporteId,
    reporteNombre: folder.reporteNombre,
    registroId: folder.registroId,
    registroNombre: folder.registroNombre,
    title,
  }
  const uploaded = []
  const replace = Array.isArray(replacePaths) ? replacePaths : []

  if (pngDataUri) {
    uploaded.push(await uploadEsquemaAsset({
      ...base,
      kind: 'png',
      dataUri: pngDataUri,
      mime: 'image/png',
      replacePath: replace.find((p) => String(p).endsWith('.png') && !String(p).includes('memoria') && !String(p).includes('despiece')) || null,
    }))
  }
  if (scene) {
    const { esquemaSceneToDataUri } = await import('./esquemaScenePersist.js')
    const uri = esquemaSceneToDataUri(scene)
    if (uri) {
      uploaded.push(await uploadEsquemaAsset({
        ...base,
        kind: 'scene',
        dataUri: uri,
        mime: 'application/json',
        nombre: `${title}.scene.json`,
        replacePath: replace.find((p) => String(p).endsWith('.scene.json')) || null,
      }))
    }
  }
  for (const adj of adjuntos || []) {
    const kind = String(adj.kind || '')
    let assetKind = null
    if (kind === 'esquema-pdf') assetKind = 'pdf'
    else if (kind === 'esquema-dxf') assetKind = 'dxf'
    else if (kind === ESQUEMA_SCENE_KIND) continue // ya subido
    else if (kind === 'memoria-calculo') assetKind = 'memoria'
    else if (kind === 'despiece-acero') assetKind = 'despiece'
    else continue
    if (!adj.dataUri) continue
    uploaded.push(await uploadEsquemaAsset({
      ...base,
      kind: assetKind,
      dataUri: adj.dataUri,
      mime: adj.mime,
      nombre: adj.nombre,
    }))
  }
  return { ok: true, files: uploaded }
}
