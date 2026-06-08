import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../../apiBase'

/** Estilos del módulo Topografía alineados con tema global (claro | auto | oscuro | descansar). */
export function topoStyles(t) {
  const primary = t?.primary || '#2563eb'
  const border = t?.border || '#e2e8f0'
  const text = t?.text || '#0f172a'
  const textMuted = t?.textMuted || '#64748b'
  const bgCard = t?.bgCard || '#ffffff'
  const inputBg = t?.inputBg || '#f8fafc'

  return {
    t: t || {},
    text,
    textMuted,
    accent: primary,
    accentSoft: `${primary}22`,
    overlay: t?.overlay || 'rgba(15, 23, 42, 0.48)',
    card: {
      background: bgCard,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: 16,
      color: text,
    },
    inputStyle: {
      width: '100%',
      padding: '8px 10px',
      borderRadius: 6,
      border: `1px solid ${t?.inputBorder || border}`,
      background: inputBg,
      color: text,
      boxSizing: 'border-box',
    },
    btnPrimary: {
      padding: '8px 14px',
      borderRadius: 6,
      border: 'none',
      background: primary,
      color: '#fff',
      cursor: 'pointer',
    },
    btnSecondary: {
      padding: '8px 14px',
      borderRadius: 6,
      border: `1px solid ${border}`,
      background: bgCard,
      color: text,
      cursor: 'pointer',
    },
    th: {
      textAlign: 'left',
      padding: '6px 6px',
      borderBottom: `2px solid ${border}`,
      fontSize: 'var(--cc-xs)',
      whiteSpace: 'nowrap',
      color: text,
      background: inputBg,
    },
    td: {
      padding: '5px 6px',
      fontSize: 'var(--cc-xs)',
      borderBottom: `1px solid ${border}`,
      whiteSpace: 'nowrap',
      color: text,
    },
    rowHighlight: `${primary}18`,
    tabBar: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 4,
      overflowX: 'auto',
      paddingBottom: 2,
      marginBottom: 12,
      borderBottom: `2px solid ${border}`,
      flexWrap: 'nowrap',
    },
    tabBtn: (active) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 12px',
      border: `1px solid ${border}`,
      borderBottom: active ? `2px solid ${primary}` : `1px solid ${border}`,
      marginBottom: active ? -2 : 0,
      borderRadius: '8px 8px 0 0',
      background: active ? `${primary}18` : bgCard,
      color: active ? primary : text,
      fontSize: 'var(--cc-sm)',
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }),
    cierre: {
      box: {
        border: `1px solid ${border}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: bgCard,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      },
      head: {
        padding: '5px 10px',
        background: primary,
        color: '#fff',
        fontWeight: 700,
        fontSize: 'var(--cc-xs)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      },
      rowL: {
        padding: '3px 8px',
        fontSize: 'var(--cc-xs)',
        color: textMuted,
        background: inputBg,
        fontWeight: 600,
        borderTop: `1px solid ${border}`,
        width: '42%',
        verticalAlign: 'middle',
      },
      rowV: {
        padding: '3px 8px',
        fontSize: 'var(--cc-xs)',
        color: text,
        textAlign: 'right',
        borderTop: `1px solid ${border}`,
        fontWeight: 600,
        verticalAlign: 'middle',
      },
    },
    grafico: {
      border: `1px solid ${border}`,
      background: inputBg,
      labelFill: textMuted,
      pointLabel: text,
    },
    badgeEstacion: { background: `${primary}22`, color: primary },
    badgeAux: { background: inputBg, color: textMuted },
    link: primary,
    success: '#047857',
    warn: '#b45309',
  }
}

const TopoThemeContext = createContext(topoStyles(null))

export function TopoThemeProvider({ t, children }) {
  const styles = useMemo(() => topoStyles(t), [t])
  return <TopoThemeContext.Provider value={styles}>{children}</TopoThemeContext.Provider>
}

export function useTopoTheme() {
  return useContext(TopoThemeContext)
}

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
    if (!(blob instanceof Blob) || blob.size < 80) {
      throw new Error('El servidor no devolvió un PDF válido. Reinicie el backend e intente de nuevo.')
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [api])

  return { api, online, saveDraft, loadDraft, clearDraft, syncDraft, downloadPdf }
}

/** @deprecated Use useTopoTheme() inside Topografía (requiere TopoThemeProvider). */
export const card = topoStyles(null).card
/** @deprecated Use useTopoTheme(). */
export const inputStyle = topoStyles(null).inputStyle
/** @deprecated Use useTopoTheme(). */
export const btnPrimary = topoStyles(null).btnPrimary
/** @deprecated Use useTopoTheme(). */
export const btnSecondary = topoStyles(null).btnSecondary

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
  if (/requieren un punto BM|amarre inicial|Indique el punto de amarre/i.test(msg)) {
    return { titulo: 'Punto de amarre requerido', mensaje: msg }
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
