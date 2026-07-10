import { API_BASE, apiFetchSignal, logApiFailure } from '../apiBase'

function headers(token, extra = {}) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function parseError(res) {
  try {
    const j = await res.json()
    if (typeof j?.detail === 'string') return j.detail
    if (Array.isArray(j?.detail)) return j.detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
    return JSON.stringify(j)
  } catch {
    return res.statusText || `HTTP ${res.status}`
  }
}

export async function contabGet(path, token, params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v))
  })
  const url = `${API_BASE}/contabilidad${path}${qs.toString() ? `?${qs}` : ''}`
  const sig = apiFetchSignal(60000)
  try {
    const res = await fetch(url, { headers: headers(token), ...(sig ? { signal: sig } : {}) })
    if (!res.ok) throw new Error(await parseError(res))
    return res.json()
  } catch (e) {
    logApiFailure(`contabilidad GET ${path}`, e)
    throw e
  }
}

export async function contabSend(path, token, { method = 'POST', body, formData } = {}) {
  const sig = apiFetchSignal(90000)
  const opts = {
    method,
    headers: headers(token, formData ? {} : { 'Content-Type': 'application/json' }),
    ...(sig ? { signal: sig } : {}),
  }
  if (formData) opts.body = formData
  else if (body != null) opts.body = JSON.stringify(body)
  try {
    const res = await fetch(`${API_BASE}/contabilidad${path}`, opts)
    if (!res.ok) throw new Error(await parseError(res))
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('spreadsheet') || ct.includes('octet-stream')) return res.blob()
    if (res.status === 204) return null
    return res.json()
  } catch (e) {
    logApiFailure(`contabilidad ${method} ${path}`, e)
    throw e
  }
}

/** OCR factura (egresos). Devuelve siempre un objeto con mensaje; no lanza. */
export async function contabOcrFactura(token, file, { timeoutMs = 60000 } = {}) {
  const fd = new FormData()
  fd.append('archivo', file)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(`${API_BASE}/contabilidad/ocr/factura`, {
      method: 'POST',
      headers: headers(token),
      body: fd,
      ...(controller ? { signal: controller.signal } : {}),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = typeof j?.detail === 'string' ? j.detail : JSON.stringify(j)
      } catch {
        detail = res.statusText || ''
      }
      return {
        ok: false,
        status: 'http_error',
        mensaje: `Error del servidor OCR (HTTP ${res.status}).`,
        error_detalle: detail || null,
        sugerencias: {},
        campos_detectados: [],
        crop: null,
      }
    }
    const data = await res.json()
    return {
      ok: !!data.ok,
      configured: data.configured,
      status: data.status || 'unknown',
      mensaje: data.mensaje || (data.ok ? 'OCR completado.' : 'OCR sin resultado.'),
      error_detalle: data.error_detalle || null,
      sugerencias: data.sugerencias || {},
      campos_detectados: data.campos_detectados || [],
      crop: data.crop || null,
    }
  } catch (e) {
    const aborted = e?.name === 'AbortError'
    return {
      ok: false,
      status: aborted ? 'timeout' : 'network_or_timeout',
      mensaje: aborted
        ? 'El OCR superó el tiempo de espera. Complete los campos manualmente.'
        : 'No se pudo contactar el OCR. Verifique la red o complete manualmente.',
      error_detalle: String(e?.message || e),
      sugerencias: {},
      campos_detectados: [],
      crop: null,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function contabDownloadExport(tipo, token, params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v))
  })
  const url = `${API_BASE}/contabilidad/export/${tipo}${qs.toString() ? `?${qs}` : ''}`
  const sig = apiFetchSignal(120000)
  const res = await fetch(url, { headers: headers(token), ...(sig ? { signal: sig } : {}) })
  if (!res.ok) throw new Error(await parseError(res))
  const blob = await res.blob()
  const dispo = res.headers.get('Content-Disposition') || ''
  const m = /filename="?([^";]+)"?/.exec(dispo)
  const filename = m ? m[1] : `ClaraCore_Contabilidad_${tipo}.xlsx`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
