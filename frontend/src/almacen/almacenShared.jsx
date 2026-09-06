import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useClaraViewport } from '../useClaraViewport'
import { isLikelyDarkBackground } from '../theme/adminPanelTheme'
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
      padding: '7px 8px',
      fontSize: 'var(--cc-caption)',
      fontWeight: 800,
      color: textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
      border: `1px solid ${border}`,
      background: t?.headerBg || inputBg,
      position: 'sticky',
      top: 0,
      zIndex: 2,
    },
    td: {
      padding: '5px 8px',
      fontSize: 'var(--cc-sm)',
      color: text,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.25,
      background: 'transparent',
    },
    tdNum: {
      padding: '5px 8px',
      fontSize: 'var(--cc-xs)',
      color: text,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      lineHeight: 1.25,
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontWeight: 700,
    },
    sheetWrap: {
      overflow: 'auto',
      border: `1px solid ${border}`,
      background: bgCard,
      borderRadius: 4,
    },
    sheetTable: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
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

/** Variables CSS del tema ClaraCore para popups y superficies del módulo. */
export function buildAlmacenCssVars(t) {
  if (!t) return {}
  const primary = t.primary || '#2563eb'
  const bgCard = t.bgCard || '#ffffff'
  const isDark = isLikelyDarkBackground(bgCard) || bgCard === '#0F2038'
  return {
    '--cc-almacen-bg': t.bg || bgCard,
    '--cc-almacen-bg-card': bgCard,
    '--cc-almacen-bg-header': t.headerBg || bgCard,
    '--cc-almacen-input-bg': t.inputBg || (isDark ? '#0A1628' : '#f8fafc'),
    '--cc-almacen-text': t.text || (isDark ? '#E0F2FE' : '#0f172a'),
    '--cc-almacen-text-muted': t.textMuted || (isDark ? '#7FB3D3' : '#64748b'),
    '--cc-almacen-border': t.border || (isDark ? '#1E3A5F' : '#e2e8f0'),
    '--cc-almacen-accent': primary,
    '--cc-almacen-accent-soft': `${primary}22`,
    '--cc-almacen-overlay': t.overlay || (isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.52)'),
    '--cc-almacen-shadow-modal': t.shadow || (isDark ? '0 24px 64px rgba(0, 0, 0, 0.55)' : '0 24px 64px rgba(0, 0, 0, 0.28)'),
    '--cc-almacen-shadow-sheet': isDark ? '0 -12px 40px rgba(0, 0, 0, 0.45)' : '0 -12px 40px rgba(0, 0, 0, 0.25)',
    colorScheme: isDark ? 'dark' : 'light',
  }
}

/** Tema unificado para CcConfirmModal dentro del módulo Almacén. */
export function buildAlmacenConfirmTheme(t, ui) {
  const base = t || {}
  const cardBg = base.bgCard || ui?.card?.background || '#ffffff'
  return {
    ...base,
    primary: base.primary || ui?.accent || '#2563eb',
    bgCard: cardBg,
    text: base.text || ui?.text || '#0f172a',
    textMuted: base.textMuted || ui?.textMuted || '#64748b',
    border: base.border || '#e2e8f0',
    overlay: base.overlay || 'var(--cc-almacen-overlay, rgba(15, 23, 42, 0.52))',
    shadow: base.shadow || 'var(--cc-almacen-shadow-modal, 0 24px 64px rgba(0,0,0,0.28))',
    success: base.success || 'var(--cc-color-success, #16a34a)',
    danger: base.danger || '#dc2626',
    warn: base.warn || '#d97706',
  }
}

export function almacenFormModalDialogStyle({ width, compact } = {}) {
  return {
    width: compact ? '100%' : (width || 'min(1248px, 100%)'),
    maxHeight: compact ? '96dvh' : '92vh',
    background: 'var(--cc-almacen-bg-card)',
    color: 'var(--cc-almacen-text)',
    border: compact ? 'none' : '1px solid var(--cc-almacen-border)',
    borderRadius: compact ? '16px 16px 0 0' : 14,
    boxShadow: compact ? 'var(--cc-almacen-shadow-sheet)' : 'var(--cc-almacen-shadow-modal)',
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
      <AlmacenThemeContext.Provider value={styles}>
        {children}
      </AlmacenThemeContext.Provider>
    </AlmacenCompactContext.Provider>
  )
}

export function AlmacenApiProvider({ contratoId, token, children }) {
  const tokenRef = useRef(token)
  tokenRef.current = token
  const api = useMemo(
    () => createAlmacenApi(contratoId, () => tokenRef.current),
    [contratoId],
  )
  return <AlmacenApiContext.Provider value={api}>{children}</AlmacenApiContext.Provider>
}

/** Agrupa tema + API en un solo árbol de contexto (evita desincronización entre providers). */
export function AlmacenProviders({ t, compact = false, contratoId, token, children }) {
  const styles = useMemo(() => almacenStyles(t, compact), [t, compact])
  const tokenRef = useRef(token)
  tokenRef.current = token
  // API estable por contrato: el token se resuelve en cada request (evita remount/efectos al renovar sesión).
  const api = useMemo(
    () => createAlmacenApi(contratoId, () => tokenRef.current),
    [contratoId],
  )
  return (
    <AlmacenCompactContext.Provider value={compact}>
      <AlmacenThemeContext.Provider value={styles}>
        <AlmacenApiContext.Provider value={api}>
          {children}
        </AlmacenApiContext.Provider>
      </AlmacenThemeContext.Provider>
    </AlmacenCompactContext.Provider>
  )
}

export function useAlmacenTheme() {
  return useContext(AlmacenThemeContext)
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
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (!ayuda) return null
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        title={ayuda}
        aria-label={`Ayuda: ${ayuda}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        style={{
          display: 'inline-flex',
          width: '1.15em',
          height: '1.15em',
          borderRadius: '50%',
          background: '#64748b',
          color: '#fff',
          fontSize: '0.7em',
          fontWeight: 700,
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
          flexShrink: 0,
          border: 'none',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% + 8px)',
            transform: 'translateX(-50%)',
            zIndex: 80,
            minWidth: 160,
            maxWidth: 260,
            padding: '8px 10px',
            background: 'var(--cc-almacen-bg-card, #fff)',
            border: '1px solid var(--cc-almacen-border, #e2e8f0)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            fontSize: 'var(--cc-xs)',
            color: 'var(--cc-almacen-text, #0f172a)',
            fontWeight: 500,
            lineHeight: 1.4,
            textAlign: 'left',
            whiteSpace: 'normal',
          }}
        >
          {ayuda}
        </span>
      )}
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

export function formatEntradaNumero(numOrRow, contratoSegment) {
  if (numOrRow != null && typeof numOrRow === 'object') {
    if (numOrRow.codigo) return numOrRow.codigo
    return formatEntradaNumero(numOrRow.numero_entrada, contratoSegment)
  }
  if (numOrRow == null || numOrRow === '') return '—'
  const n = Number(numOrRow)
  if (!Number.isFinite(n)) return String(numOrRow)
  const seg = contratoSegment != null && contratoSegment !== '' ? String(contratoSegment) : null
  if (seg) return `Ent-${seg}-${String(n).padStart(5, '0')}`
  return `Ent-${String(n).padStart(5, '0')}`
}

export function formatSalidaNumero(numOrRow, contratoSegment) {
  if (numOrRow != null && typeof numOrRow === 'object') {
    if (numOrRow.codigo) return numOrRow.codigo
    return formatSalidaNumero(numOrRow.numero_salida, contratoSegment)
  }
  if (numOrRow == null || numOrRow === '') return '—'
  const n = Number(numOrRow)
  if (!Number.isFinite(n)) return String(numOrRow)
  const seg = contratoSegment != null && contratoSegment !== '' ? String(contratoSegment) : null
  if (seg) return `Sal-${seg}-${String(n).padStart(5, '0')}`
  return `Sal-${String(n).padStart(5, '0')}`
}

/** Etiqueta visible de número de OC (p. ej. #00001). */
export function formatNumeroOcDisplay(n) {
  if (n == null || n === '') return '—'
  const s = String(n).replace(/^#/, '')
  if (/^CC-/i.test(s)) return s
  const num = Number(s)
  if (Number.isFinite(num)) return `#${String(num).padStart(5, '0')}`
  return s.startsWith('#') ? s : `#${s}`
}

export function almacenLinkButtonStyle(ui) {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    color: ui?.accent || 'var(--cc-almacen-accent, #2563eb)',
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 'inherit',
    fontFamily: 'inherit',
  }
}

/** Estado de recepción de OC (no confundir con aprobación de solicitud). */
export const ESTADO_OC_RECEPCION_LABEL = {
  pendiente: 'Sin recibir',
  parcial: 'Recepción parcial',
  completa: 'Recepción completa',
  anulada: 'Anulada',
}

export function mapOcEstadoRecepcion(estadoDb) {
  if (estadoDb === 'parcial') return 'parcial'
  if (estadoDb === 'completa') return 'completa'
  if (estadoDb === 'anulada') return 'anulada'
  return 'pendiente'
}

export function formatOcRecepcionLabel(oc) {
  const key = oc?.estado_recepcion || mapOcEstadoRecepcion(oc?.estado)
  return ESTADO_OC_RECEPCION_LABEL[key] || '—'
}

export function formatOcOpcionEntrada(oc) {
  const num = oc?.numero_oc ?? '—'
  const recv = formatOcRecepcionLabel(oc)
  const saldo = Number(oc?.saldo_cantidad_pendiente)
  const un = oc?.saldo_unidad
    || (Array.isArray(oc?.saldo_unidades) && oc.saldo_unidades.length === 1 ? oc.saldo_unidades[0] : '')
  if (Number.isFinite(saldo) && saldo > 0.0001) {
    const saldoTxt = `${fmtCant(saldo)}${un ? ` ${un}` : ''}`
    return `OC #${num} · ${recv} (falta: ${saldoTxt})`
  }
  return `OC #${num} · ${recv}`
}

export function formatEntradaCantidadGrilla(entrada) {
  const qty = Number(entrada?.cantidad_recibida_total)
  if (!Number.isFinite(qty) || qty <= 0) return '—'
  const un = entrada?.cantidad_recibida_unidad
  return `${fmtCant(qty)}${un ? ` ${un}` : ''}`
}

export function formatEntradaSaldoOcDespuesGrilla(entrada) {
  const saldo = Number(entrada?.saldo_oc_pendiente_despues)
  if (!Number.isFinite(saldo)) return '—'
  if (saldo <= 0.0001) return 'Completo'
  const un = entrada?.saldo_oc_pendiente_despues_unidad || entrada?.cantidad_recibida_unidad
  return `${fmtCant(saldo)}${un ? ` ${un}` : ''}`
}

export function formatOcSaldoPendienteGrilla(oc) {
  if (!oc?.numero_oc && oc?.saldo_cantidad_pendiente == null) return '—'
  const saldo = Number(oc?.saldo_cantidad_pendiente)
  if (!Number.isFinite(saldo) || saldo <= 0.0001) return 'Completo'
  const un = oc?.saldo_unidad
    || (Array.isArray(oc?.saldo_unidades) && oc.saldo_unidades.length === 1 ? oc.saldo_unidades[0] : '')
  return `${fmtCant(saldo)}${un ? ` ${un}` : ''}`
}

export function fmtMoney(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return '—'
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

/** Mensaje explícito cuando no hay VU/Tot. cobro (evita confundir con error silencioso). */
export function labelCobroMotivo(motivo, { esPrincipal = true } = {}) {
  if (esPrincipal === false || motivo === 'insumo_asociado') {
    return 'Insumo asociado'
  }
  switch (motivo) {
    case 'pendiente_aprobacion':
      return 'Pendiente de aprobación'
    case 'sin_valor_asignado':
      return 'Sin valor asignado'
    case 'sin_capitulo':
    case 'sin_item':
    case 'sin_valor_listado':
      return 'Sin valor en listado'
    default:
      return motivo ? 'Sin valor en listado' : null
  }
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

export {
  ALMACEN_TIMEZONE,
  parseIsoAlmacen,
  fmtFechaAlmacen,
  fmtFechaAlmacenCorta,
  fmtFechaAlmacenSolo,
  todayDateInputColombia,
  nowDatetimeLocalColombia,
  datetimeLocalColombiaToIsoUtc,
  isoUtcToDatetimeLocalColombia,
} from './almacenDatetime'

/** Texto de aprobación para listado de solicitudes (sin repetir el encabezado). */
export function textoAprobacionSolicitud(s) {
  if (!s) return '—'
  // La columna "Estado" ya dice Aprobada/Rechazada; aquí solo el dato de quién / pendiente.
  if (s.estado === 'aprobada') {
    return s.validador_nombre || '—'
  }
  if (s.estado === 'rechazada') {
    return s.validador_nombre || '—'
  }
  if (s.estado === 'enviada') {
    const v = s.validadores_pendientes || []
    if (v.length) return v.join(', ')
    return 'Pendiente'
  }
  return '—'
}

export function useAlmacenFetch(fn, deps) {
  const api = useAlmacenApi()
  return useCallback(() => fn(api), [api, ...deps])
}
