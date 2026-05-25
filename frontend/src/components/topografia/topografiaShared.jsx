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
    const ct = res.headers.get('content-type') || ''
    const isJson = ct.includes('application/json')
    const isPdf = ct.includes('application/pdf')

    if (!res.ok) {
      let detail = res.statusText
      if (isJson) {
        try {
          const j = await res.json()
          detail = j.detail || JSON.stringify(j)
        } catch { /* ignore */ }
      } else {
        const text = await res.text()
        if (text.trimStart().startsWith('<!')) {
          detail = 'No se pudo conectar con el API de Topografia. Verifique que el backend este en :8000 y reinicie Vite tras actualizar el proxy.'
        } else {
          detail = text.slice(0, 200)
        }
      }
      throw new Error(typeof detail === 'string' ? detail : 'Error en solicitud')
    }
    if (res.status === 204) return null
    if (isPdf) return res.blob()
    if (!isJson) {
      const text = await res.text()
      if (text.trimStart().startsWith('<!')) {
        throw new Error('El servidor devolvio HTML en lugar de JSON. Reinicie el frontend (Vite) para aplicar el proxy /topografia.')
      }
      throw new Error(text.slice(0, 200) || 'Respuesta no JSON')
    }
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

/** Convierte errores del API en titulo + mensaje legible para el usuario. */
export function parseApiError(raw) {
  let msg = String(raw || 'Error desconocido').trim()
  msg = msg.replace(/^APIError:\s*/i, '').replace(/^Error:\s*/i, '')

  try {
    if (msg.startsWith('{') || msg.startsWith('[')) {
      const j = JSON.parse(msg.replace(/'/g, '"'))
      if (j?.message) msg = j.message
      else if (j?.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    }
  } catch { /* usar msg tal cual */ }

  if (/invalid input syntax for type uuid/i.test(msg)) {
    return {
      titulo: 'Identificador invalido',
      mensaje: 'Se envio un dato con formato incorrecto. Si acaba de crear la poligonal, verifique que selecciono un BM verificado. Si el error continua, cierre sesion y vuelva a entrar.',
    }
  }
  if (/El punto no esta verificado/i.test(msg)) {
    return {
      titulo: 'Punto no verificado',
      mensaje: 'Solo puede usar puntos marcados como verificados en la biblioteca (BM iniciales o puntos provenientes de circuitos cerrados).',
    }
  }
  if (/Error de cierre fuera de tolerancia/i.test(msg)) {
    return {
      titulo: 'Cierre inadmisible',
      mensaje: 'El error lineal supera la tolerancia configurada. Revise angulos y distancias de campo, recalcule, o ajuste la tolerancia antes de cerrar el circuito.',
    }
  }
  if (/requieren un punto BM/i.test(msg) || /Indique un nombre/i.test(msg)) {
    return { titulo: 'Datos incompletos', mensaje: msg }
  }
  if (/Sin estaciones|angulo|distancia|Nombre del punto/i.test(msg)) {
    return { titulo: 'Revise los datos', mensaje: msg }
  }
  if (/No se pudo conectar|proxy|HTML/i.test(msg)) {
    return {
      titulo: 'Servidor no disponible',
      mensaje: msg,
    }
  }

  return {
    titulo: 'No se pudo completar la operacion',
    mensaje: msg,
  }
}
