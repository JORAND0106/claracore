import { createContext, useCallback, useContext, useMemo } from 'react'
import { useClaraViewport } from '../useClaraViewport'
import { createAlmacenApi } from './almacenApi'

export function almacenStyles(t, compact = false) {
  const primary = t?.primary || '#2563eb'
  const border = t?.border || '#e2e8f0'
  const text = t?.text || '#0f172a'
  const textMuted = t?.textMuted || '#64748b'
  const bgCard = t?.bgCard || '#ffffff'
  const inputBg = t?.inputBg || '#f8fafc'

  return {
    text,
    textMuted,
    accent: primary,
    accentSoft: `${primary}22`,
    card: {
      background: bgCard,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: 16,
      color: text,
    },
    input: {
      width: '100%',
      padding: compact ? '10px 12px' : 'var(--cc-space-2) var(--cc-space-3)',
      borderRadius: 6,
      border: `1px solid ${t?.inputBorder || border}`,
      background: inputBg,
      color: text,
      fontSize: compact ? 'var(--cc-input)' : 'var(--cc-input)',
      boxSizing: 'border-box',
      ...(compact ? { minHeight: 44 } : {}),
    },
    label: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 'var(--cc-caption)',
      fontWeight: 600,
      color: textMuted,
      marginBottom: 4,
    },
    btnPrimary: {
      padding: compact ? '10px 16px' : '8px 14px',
      borderRadius: 6,
      border: 'none',
      background: primary,
      color: '#fff',
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
      fontWeight: 600,
      ...(compact ? { minHeight: 44 } : {}),
    },
    btnSecondary: {
      padding: compact ? '10px 16px' : '8px 14px',
      borderRadius: 6,
      border: `1px solid ${border}`,
      background: bgCard,
      color: text,
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
      ...(compact ? { minHeight: 44 } : {}),
    },
    th: {
      textAlign: 'left',
      padding: '8px 10px',
      borderBottom: `2px solid ${border}`,
      fontSize: 'var(--cc-xs)',
      fontWeight: 700,
      color: textMuted,
      background: inputBg,
    },
    td: {
      padding: '8px 10px',
      fontSize: 'var(--cc-sm)',
      borderBottom: `1px solid ${border}`,
      color: text,
    },
    tabBar: {
      display: 'flex',
      gap: 4,
      borderBottom: `2px solid ${border}`,
      marginBottom: 16,
      flexWrap: 'wrap',
    },
    tabBtn: (active) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: compact ? '12px 16px' : '10px 14px',
      border: 'none',
      borderBottom: active ? `2px solid ${primary}` : '2px solid transparent',
      marginBottom: -2,
      background: 'transparent',
      color: active ? primary : textMuted,
      fontSize: 'var(--cc-sm)',
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      ...(compact ? { minHeight: 44 } : {}),
    }),
  }
}

const AlmacenThemeContext = createContext(almacenStyles(null))
const AlmacenCompactContext = createContext(false)
const AlmacenApiContext = createContext(null)

export function useAlmacenCompact() {
  return useContext(AlmacenCompactContext)
}

export function useAlmacenViewport() {
  const vp = useClaraViewport()
  const isCompact = Boolean(vp.isMobile || vp.isLandscapeMobile)
  return { ...vp, isCompact }
}

export function AlmacenThemeProvider({ t, compact = false, children }) {
  const styles = useMemo(() => almacenStyles(t, compact), [t, compact])
  return (
    <AlmacenCompactContext.Provider value={compact}>
      <AlmacenThemeContext.Provider value={styles}>{children}</AlmacenThemeContext.Provider>
    </AlmacenCompactContext.Provider>
  )
}

export function useAlmacenTheme() {
  return useContext(AlmacenThemeContext)
}

export function AlmacenApiProvider({ contratoId, token, children }) {
  const api = useMemo(() => createAlmacenApi(contratoId, token), [contratoId, token])
  return <AlmacenApiContext.Provider value={api}>{children}</AlmacenApiContext.Provider>
}

export function useAlmacenApi() {
  const api = useContext(AlmacenApiContext)
  if (!api) throw new Error('useAlmacenApi requiere AlmacenApiProvider')
  return api
}

/** Usuario de sesión ClaraCore (solo lectura, para Despachador). */
export function getAlmacenSessionUser() {
  try {
    const raw = localStorage.getItem('cc_usuario') || sessionStorage.getItem('cc_usuario')
    if (!raw) return null
    const u = JSON.parse(raw)
    const nombre = [u.nombre, u.apellidos].filter(Boolean).join(' ').trim()
    return { id: u.id, label: nombre || u.email || `Usuario #${u.id}` }
  } catch {
    return null
  }
}

export function AlmacenHelpIcon({ ayuda }) {
  if (!ayuda) return null
  return (
    <span
      title={ayuda}
      aria-label="Ayuda"
      style={{
        display: 'inline-flex',
        width: '1.1em',
        height: '1.1em',
        borderRadius: '50%',
        background: '#64748b',
        color: '#fff',
        fontSize: '0.7em',
        fontWeight: 700,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
        flexShrink: 0,
      }}
    >
      ?
    </span>
  )
}

export function AlmacenFieldLabel({ icon, label, ayuda, compact }) {
  const ui = useAlmacenTheme()
  return (
    <label style={{ ...ui.label, marginBottom: compact ? 2 : ui.label.marginBottom, fontSize: compact ? 'var(--cc-xs)' : ui.label.fontSize }}>
      {icon && <span aria-hidden>{icon}</span>}
      <span>{label}</span>
      <AlmacenHelpIcon ayuda={ayuda} />
    </label>
  )
}

export const ESTADO_SOLICITUD_LABEL = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export const ESTADO_SOLICITUD_COLOR = {
  borrador: '#64748b',
  enviada: '#2563eb',
  aprobada: 'var(--cc-color-success)',
  rechazada: '#dc2626',
}

export function puedeAnularSolicitud(s, permisos) {
  if (!s || !['borrador', 'enviada'].includes(s.estado)) return false
  const uid = permisos?.userId
  const esCreador = uid != null && Number(s.created_by) === Number(uid)
  if (esCreador) return Boolean(permisos?.crear || permisos?.editar)
  return Boolean(permisos?.editar)
}

export function SemaforoDot({ estado }) {
  const colors = { verde: '#16a34a', amarillo: '#eab308', rojo: '#dc2626' }
  const c = colors[estado] || '#94a3b8'
  return (
    <span
      title={estado}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: c,
        marginRight: 6,
      }}
    />
  )
}

export function fmtCant(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-CO', { maximumFractionDigits: 4 })
}

/** Formato placa vehículo: AAA-000 */
export function formatPlacaVehiculo(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters = s.replace(/[^A-Z]/g, '').slice(0, 3)
  const digits = s.replace(/\D/g, '').slice(0, 3)
  if (!letters && !digits) return ''
  if (letters.length === 3 && digits.length > 0) {
    return `${letters}-${digits}`
  }
  if (letters.length === 3) return letters
  return s.slice(0, 7)
}

/** Nombre propio: cada palabra capitalizada */
export function formatNombrePropio(raw) {
  return String(raw || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function formatEntradaNumero(num) {
  if (num == null || num === '') return '—'
  return `#${num}`
}

export function fmtMoney(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return '—'
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

/** Etiqueta de línea interna: Solicitud #5 · Línea 2 */
export function formatSolicitudLinea(consecutivo, numeroLinea) {
  if (consecutivo != null && numeroLinea != null) {
    return `#${consecutivo} · Línea ${numeroLinea}`
  }
  if (numeroLinea != null) return `Línea ${numeroLinea}`
  if (consecutivo != null) return `#${consecutivo}`
  return 'Línea'
}

/** Texto de aprobación para listado de solicitudes */
export function textoAprobacionSolicitud(s) {
  if (!s) return '—'
  if (s.estado === 'aprobada') {
    return s.validador_nombre ? `Aprobada por ${s.validador_nombre}` : 'Aprobada'
  }
  if (s.estado === 'rechazada') {
    return s.validador_nombre ? `Rechazada por ${s.validador_nombre}` : 'Rechazada'
  }
  if (s.estado === 'enviada') {
    const v = s.validadores_pendientes || []
    if (v.length) return `Pendiente: ${v.join(', ')}`
    return 'Pendiente aprobación'
  }
  return '—'
}

export function useAlmacenFetch(fn, deps) {
  const api = useAlmacenApi()
  return useCallback(() => fn(api), [api, ...deps])
}
