import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../../apiBase'

const DRAFT_KEY = (contratoId, modulo) => `claracore_topo_draft_${contratoId}_${modulo}`

export function useTopografiaApi(contratoId, token) {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const api = useCallback(async (path, options = {}) => {
    const url = `${API_BASE}/topografia/${contratoId}${path}`
    const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } })
    if (!res.ok) {
      let detail = res.statusText
      try {
        const j = await res.json()
        detail = j.detail || JSON.stringify(j)
      } catch { /* ignore */ }
      throw new Error(typeof detail === 'string' ? detail : 'Error en solicitud')
    }
    if (res.status === 204) return null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/pdf')) return res.blob()
    return res.json()
  }, [contratoId, headers])

  const saveDraft = useCallback((modulo, data) => {
    try {
      localStorage.setItem(DRAFT_KEY(contratoId, modulo), JSON.stringify({ data, ts: Date.now() }))
    } catch { /* ignore */ }
  }, [contratoId])

  const loadDraft = useCallback((modulo) => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(contratoId, modulo))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [contratoId])

  const clearDraft = useCallback((modulo) => {
    try { localStorage.removeItem(DRAFT_KEY(contratoId, modulo)) } catch { /* ignore */ }
  }, [contratoId])

  const syncDraft = useCallback(async (modulo, endpoint, method = 'POST') => {
    const draft = loadDraft(modulo)
    if (!draft?.data || !online) return null
    const result = await api(endpoint, { method, body: JSON.stringify(draft.data) })
    clearDraft(modulo)
    return result
  }, [api, clearDraft, loadDraft, online])

  const downloadPdf = useCallback(async (path, filename) => {
    const blob = await api(path, { method: 'GET', headers: { Accept: 'application/pdf' } })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [api])

  return { api, online, saveDraft, loadDraft, clearDraft, syncDraft, downloadPdf }
}

export const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 16,
}

export const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
}

export const btnPrimary = {
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
}

export const btnSecondary = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
}

export const defaultPermisos = {
  crear: false,
  editar: false,
  validar: false,
  eliminar: false,
  exportar: false,
}

export function puede(permisos, accion) {
  return Boolean(permisos?.[accion])
}

export function PermisoAviso({ permisos, accion, children }) {
  if (puede(permisos, accion)) return children
  return null
}

export function Semaforo({ ok, labelOk = 'Admisible', labelBad = 'Inadmisible' }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 'var(--cc-sm)',
      fontWeight: 600,
      color: ok ? '#166534' : '#991b1b',
      background: ok ? '#dcfce7' : '#fee2e2',
    }}>
      {ok ? labelOk : labelBad}
    </span>
  )
}

export function OfflineBadge({ online }) {
  return (
    <span style={{
      padding: '3px 8px',
      borderRadius: 999,
      fontSize: 'var(--cc-xs)',
      background: online ? '#dcfce7' : '#fef3c7',
      color: online ? '#166534' : '#92400e',
    }}>
      {online ? 'En linea' : 'Offline — borrador local'}
    </span>
  )
}
