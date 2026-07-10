import { createContext, useCallback, useContext, useMemo } from 'react'
import { createAlmacenApi } from './almacenApi'

export function almacenStyles(t) {
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
      padding: 'var(--cc-space-2) var(--cc-space-3)',
      borderRadius: 6,
      border: `1px solid ${t?.inputBorder || border}`,
      background: inputBg,
      color: text,
      fontSize: 'var(--cc-input)',
      boxSizing: 'border-box',
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
      padding: '8px 14px',
      borderRadius: 6,
      border: 'none',
      background: primary,
      color: '#fff',
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
      fontWeight: 600,
    },
    btnSecondary: {
      padding: '8px 14px',
      borderRadius: 6,
      border: `1px solid ${border}`,
      background: bgCard,
      color: text,
      cursor: 'pointer',
      fontSize: 'var(--cc-sm)',
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
      padding: '10px 14px',
      border: 'none',
      borderBottom: active ? `2px solid ${primary}` : '2px solid transparent',
      marginBottom: -2,
      background: 'transparent',
      color: active ? primary : textMuted,
      fontSize: 'var(--cc-sm)',
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
    }),
  }
}

const AlmacenThemeContext = createContext(almacenStyles(null))
const AlmacenApiContext = createContext(null)

export function AlmacenThemeProvider({ t, children }) {
  const styles = useMemo(() => almacenStyles(t), [t])
  return <AlmacenThemeContext.Provider value={styles}>{children}</AlmacenThemeContext.Provider>
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

export function AlmacenFieldLabel({ icon, label, ayuda }) {
  const ui = useAlmacenTheme()
  return (
    <label style={ui.label}>
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
  aprobada: '#047857',
  rechazada: '#dc2626',
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

export function fmtMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

export function useAlmacenFetch(fn, deps) {
  const api = useAlmacenApi()
  return useCallback(() => fn(api), [api, ...deps])
}
