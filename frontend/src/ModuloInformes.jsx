import { useState, useEffect, useId, useRef } from 'react'
import { API_BASE as API } from './apiBase'
import { formatCOP } from './utils/formatCOP'

const FS = {
  small:  { base: 13, sub: 12, title: 20, section: 12 },
  normal: { base: 16, sub: 14, title: 24, section: 13 },
  large:  { base: 20, sub: 17, title: 30, section: 15 },
}

const _fmtCopEs = (n) =>
  n == null || n === '' || (typeof n === 'number' && !Number.isFinite(n)) ? '—' : formatCOP(n)
const _fmtPctAiuIva = (frac) => {
  if (frac == null || frac === '' || !Number.isFinite(Number(frac))) return '—'
  const f = Number(frac)
  const p = f > 1 ? f : f * 100
  return `${p.toLocaleString('es-CO', { maximumFractionDigits: 4, useGrouping: false })}%`
}
function _etiquetaActaCobro(id, actas) {
  if (id == null) return '—'
  const a = (actas || []).find((x) => String(x.id) === String(id))
  if (!a) return '—'
  const fi = a.fecha_inicio ? String(a.fecha_inicio).slice(0, 10) : '—'
  const ff = a.fecha_fin ? String(a.fecha_fin).slice(0, 10) : '—'
  return `RPO ${a.numero_rpo ?? a.consecutivo ?? '—'} — del ${fi} al ${ff} (cons. ${a.consecutivo ?? '—'})`
}

const _ccdCell = { border: '1px solid #9ca3af', padding: '2px 3px', fontSize: '7px', textAlign: 'center' }

/** Excel — hoja verde con X / bloque tipo hoja de cálculo. */
function IconoDescargaExcel({ size = 18 }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`ccdXlG${id}`} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill={`url(#ccdXlG${id})`} />
      <rect x="4" y="4" width="7" height="5" rx="0.8" fill="#065f46" opacity="0.35" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 6.5h4.5v1.3H15V6.5z" fill="#fff" fillOpacity="0.88" />
    </svg>
  )
}

/** Vista previa — documento azul con brillo y lupa. */
function IconoVistaPrevia({ size = 18 }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`ccdVi${id}`} x1="4" y1="2" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <path
        d="M6 2.5h9l4.5 4.5V19a2.5 2.5 0 01-2.5 2.5H6A2.5 2.5 0 013.5 19V5A2.5 2.5 0 016 2.5z"
        fill={`url(#ccdVi${id})`}
      />
      <path d="M15 2.5v5h5" fill="#7dd3fc" opacity="0.95" />
      <rect x="7.5" y="9" width="7" height="1.4" rx="0.5" fill="#fff" fillOpacity="0.92" />
      <rect x="7.5" y="11.8" width="5" height="1.4" rx="0.5" fill="#fff" fillOpacity="0.65" />
      <circle cx="16.2" cy="15.2" r="3.8" fill="none" stroke="#f0f9ff" strokeWidth="1.6" />
      <circle cx="16.2" cy="15.2" r="1.8" fill="#bae6fd" fillOpacity="0.5" />
      <path d="M18.8 17.8l2.2 2.2" stroke="#0369a1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** PDF firmado — hoja violeta con sello dorado. */
function IconoPdfSello({ size = 18 }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`ccdPdf${id}`} x1="3" y1="2" x2="17" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
        <radialGradient id={`ccdSeal${id}`} cx="50%" cy="40%" r="60%">
          <stop stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </radialGradient>
      </defs>
      <path
        d="M6 2.5h8.5L18 6v14.5A2.5 2.5 0 0115.5 23h-9A2.5 2.5 0 014 20.5v-15A2.5 2.5 0 016 2.5z"
        fill={`url(#ccdPdf${id})`}
      />
      <path d="M14.5 2.5v4.5H19" fill="#c4b5fd" opacity="0.9" />
      <rect x="7" y="9" width="8" height="1.3" rx="0.4" fill="#fff" fillOpacity="0.88" />
      <rect x="7" y="11.5" width="6" height="1.3" rx="0.4" fill="#fff" fillOpacity="0.55" />
      <circle cx="16" cy="17.5" r="4.2" fill={`url(#ccdSeal${id})`} stroke="#b45309" strokeWidth="0.8" />
      <path
        d="M14.1 17.5l1.1 1.1 2.7-2.8"
        fill="none"
        stroke="#78350f"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Registrar firma — pluma / lápiz en tonos ámbar. */
function IconoFirmaRegistrar({ size = 18 }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`ccdPen${id}`} x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path
        d="M3.5 20.2l1.2-4.8 10.5-10.5 3.6 3.6L8.3 19l-4.8 1.2z"
        fill={`url(#ccdPen${id})`}
        stroke="#c2410c"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path d="M15.2 5.4L18.6 8.8" stroke="#fed7aa" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4.2 19.5L2.8 21" stroke="#64748b" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="5.5" cy="20.5" rx="1.8" ry="0.9" fill="#334155" opacity="0.35" transform="rotate(-25 5.5 20.5)" />
    </svg>
  )
}

/** Estantería / libros — presentación «biblioteca CCD». */
function IconoBiblioteca({ size = 28 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path fill="currentColor" fillOpacity="0.92" d="M4 4h5v16H4V4zm6 2h5v14h-5V6zm6-1h5v15h-5V5z" />
      <path fill="currentColor" fillOpacity="0.55" d="M5 5h3v14H5V5zm6 2h3v12h-3V7zm6-1h3v13h-3V6z" />
      <path stroke="currentColor" strokeWidth="1" strokeOpacity="0.35" d="M4 4h16v16H4z" fill="none" />
    </svg>
  )
}

/** Vista en vivo (miniatura HTML) del informe de corte (-001) según colores elegidos.
 *  Si existe `capitulo_subtotal_bg` (CC-SEM-001 / CC-MES-001), muestra una fila de ejemplo para contrastar con SUB TOTAL. */
function CcdLivePreviewCorte({ es }) {
  const bd = '1px solid #9ca3af'
  const capSub = es.capitulo_subtotal_bg
  const muestraSubCap = typeof capSub === 'string' && capSub.trim() !== ''
  return (
    <div
      style={{
        borderRadius: '10px',
        border: bd,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
      }}
    >
      <div style={{ padding: '6px 8px', fontSize: '9px', fontWeight: '700', color: '#475569', background: '#f8fafc', borderBottom: bd }}>
        Tabla de ítems
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7px' }}>
        <thead>
          <tr style={{ background: es.thead_bg }}>
            <th style={{ ..._ccdCell, width: '14%' }}>CAP</th>
            <th style={{ ..._ccdCell, width: '10%' }}>ÍTEM</th>
            <th style={{ ..._ccdCell, textAlign: 'left' }}>DESCRIPCIÓN</th>
            <th style={{ ..._ccdCell, width: '10%' }}>UND</th>
            <th style={{ ..._ccdCell, width: '12%' }}>CANT</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: es.row_even_bg }}>
            <td style={_ccdCell}>IV</td>
            <td style={_ccdCell}>NP-1</td>
            <td style={{ ..._ccdCell, textAlign: 'left' }}>Ejemplo fila par</td>
            <td style={_ccdCell}>ML</td>
            <td style={_ccdCell}>12</td>
          </tr>
          <tr style={{ background: es.row_odd_bg }}>
            <td style={_ccdCell}>IV</td>
            <td style={_ccdCell}>NP-2</td>
            <td style={{ ..._ccdCell, textAlign: 'left' }}>Ejemplo fila impar</td>
            <td style={_ccdCell}>M3</td>
            <td style={_ccdCell}>5</td>
          </tr>
          <tr style={{ background: es.row_even_bg }}>
            <td style={_ccdCell}>IV</td>
            <td style={_ccdCell}>NP-3</td>
            <td style={{ ..._ccdCell, textAlign: 'left' }}>…</td>
            <td style={_ccdCell}>ML</td>
            <td style={_ccdCell}>8</td>
          </tr>
          {muestraSubCap && (
            <tr style={{ background: capSub }}>
              <td
                colSpan={4}
                style={{
                  ..._ccdCell,
                  textAlign: 'right',
                  fontWeight: '800',
                  fontSize: '6.5px',
                  padding: '3px 4px',
                }}
              >
                Subtotal capítulo — IV
              </td>
              <td style={{ ..._ccdCell, textAlign: 'right', fontWeight: '800', fontSize: '6.5px', padding: '3px 4px' }}>
                $ —
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div
        style={{
          background: es.subtotal_bg,
          borderTop: bd,
          padding: '5px 8px',
          fontSize: '8px',
          fontWeight: '800',
          textAlign: 'right',
        }}
      >
        SUB TOTAL: $ —
      </div>
    </div>
  )
}

/** Vista en vivo (miniatura) de la memoria CC-SUB-002: barra + tabla + total. */
function CcdLivePreviewMemoria({ es }) {
  const bd = '1px solid #9ca3af'
  return (
    <div
      style={{
        borderRadius: '10px',
        border: bd,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
      }}
    >
      <div
        style={{
          background: es.section_bar_bg,
          color: es.section_bar_text,
          padding: '5px 8px',
          fontSize: '8px',
          fontWeight: '800',
          borderBottom: bd,
        }}
      >
        DETALLE DE CANTIDADES APROBADAS
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.5px' }}>
        <thead>
          <tr style={{ background: es.thead_bg }}>
            <th style={{ ..._ccdCell, width: '8%' }}>N°</th>
            <th style={{ ..._ccdCell, width: '10%' }}>ABS</th>
            <th style={{ ..._ccdCell }}>OBSERVACIÓN</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: es.row_even_bg }}>
            <td style={_ccdCell}>101</td>
            <td style={_ccdCell}>10.0</td>
            <td style={{ ..._ccdCell, textAlign: 'left' }}>Texto ejemplo (fila par)</td>
          </tr>
          <tr style={{ background: es.row_odd_bg }}>
            <td style={_ccdCell}>102</td>
            <td style={_ccdCell}>20.0</td>
            <td style={{ ..._ccdCell, textAlign: 'left' }}>Texto ejemplo (fila impar)</td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          background: es.subtotal_bg,
          borderTop: bd,
          padding: '5px 8px',
          fontSize: '7px',
          fontWeight: '800',
          textAlign: 'right',
        }}
      >
        CANTIDAD TOTAL DEL ÍTEM · —
      </div>
    </div>
  )
}

/** Colores sugeridos por código CCD; incluye claves de matriz de gerencia (CC-GER-001). */
function estiloDefectoCcd(cod) {
  if (typeof cod !== 'string' || !cod) {
    return {
      section_bar_bg: '#e5e7eb',
      section_bar_text: '#111827',
      thead_bg: '#f3f4f6',
      row_even_bg: '#f8fafc',
      row_odd_bg: '#ffffff',
      subtotal_bg: '#e5e7eb',
    }
  }
  if (cod.endsWith('-001')) {
    const base = {
      section_bar_bg: '#e5e7eb',
      section_bar_text: '#111827',
      thead_bg: '#e8e8e8',
      row_even_bg: '#ffffff',
      row_odd_bg: '#f9fafb',
      subtotal_bg: '#dbeafe',
      ...((cod === 'CC-SEM-001' || cod === 'CC-MES-001' || cod === 'CC-GER-001')
        ? { capitulo_subtotal_bg: '#93c5fd' }
        : {}),
    }
    if (cod === 'CC-GER-001') {
      return {
        ...base,
        ger_titulo_bloque_bg: '#bfdbfe',
        ger_subtotal_obra_con_aiu_bg: '#e0f2fe',
        ger_fila_tasa_aiu_bg: '#dbeafe',
        ger_cdirecto_mas_aiu_bg: '#c7d8f0',
        ger_filas_post_cdu_bg: '#e8edf5',
        ger_vtot_obra_ajustes_bg: '#a8bfdb',
        ger_subtotal_obra_con_iva_bg: '#e0f2fe',
        ger_fila_tasa_iva_bg: '#e8eeff',
        ger_cdirecto_mas_iva_bg: '#d4dcf5',
        ger_vtot_obra_iva_bg: '#c3d0f0',
        ger_valor_total_acta_bg: '#93c5fd',
      }
    }
    return base
  }
  return {
    section_bar_bg: '#e5e7eb',
    section_bar_text: '#111827',
    thead_bg: '#f3f4f6',
    row_even_bg: '#f8fafc',
    row_odd_bg: '#ffffff',
    subtotal_bg: '#e5e7eb',
  }
}

function CcdLivePreviewInformeGerencia({ es }) {
  const bd = '1px solid #9ca3af'
  const row = (label, bg) => (
    <div
      key={label}
      style={{
        padding: '4px 6px',
        fontSize: '6.5px',
        fontWeight: '800',
        background: bg,
        color: '#0f172a',
        borderBottom: bd,
      }}
    >
      {label}
    </div>
  )
  return (
    <div
      style={{
        borderRadius: '10px',
        border: bd,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
      }}
    >
      <div style={{ padding: '5px 8px', fontSize: '8px', fontWeight: '700', color: '#475569', background: '#f8fafc', borderBottom: bd }}>
        Resumen de filas · CC-GER-001
      </div>
      {row('Subtotal obra con AIU', es.ger_subtotal_obra_con_aiu_bg || es.subtotal_bg)}
      {row('Tasa AIU', es.ger_fila_tasa_aiu_bg || '#dbeafe')}
      {row('Costo directo + AIU', es.ger_cdirecto_mas_aiu_bg || '#c7d8f0')}
      {row('… complementos, adic., ajuste', es.ger_filas_post_cdu_bg || '#e8edf5')}
      {row('V. total obra c/ AIU y ajustes', es.ger_vtot_obra_ajustes_bg || '#a8bfdb')}
      {row('Subtotal obra con IVA', es.ger_subtotal_obra_con_iva_bg || es.subtotal_bg)}
      {row('Tasa IVA', es.ger_fila_tasa_iva_bg || '#e8eeff')}
      {row('V. total obra c/ IVA (sin fila intermedia duplicada)', es.ger_vtot_obra_iva_bg || '#c3d0f0')}
      {row('Valor total acta (pie)', es.ger_valor_total_acta_bg || '#93c5fd')}
    </div>
  )
}

export default function ModuloInformes({
  t,
  usuario,
  token,
  s,
  fontSize = 'normal',
  /** Permisos matriz «Informes CCD» (Panel admin). Desarrollador/admin: siempre en App. */
  puedeEditarCcd = false,
  puedeValidarCcd = false,
  puedeExportarCcd = false,
}) {
  const getAuthToken = () =>
    token ||
    localStorage.getItem('cc_token') ||
    sessionStorage.getItem('cc_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('token') ||
    sessionStorage.getItem('access_token') ||
    ''

  const toPath = (pathOrUrl) => {
    if (!pathOrUrl) return ''
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      try {
        const u = new URL(pathOrUrl)
        return `${u.pathname}${u.search || ''}`
      } catch {
        return pathOrUrl
      }
    }
    return pathOrUrl
  }

  async function fetchConFallback(pathOrUrl, options = {}) {
    const path = toPath(pathOrUrl)
    const principal = path.startsWith('http') ? path : `${API}${path}`
    try {
      return await fetch(principal, options)
    } catch (e) {
      const esErrorRed = e instanceof TypeError || String(e?.message || '').toLowerCase().includes('failed to fetch')
      if (!esErrorRed || API === API_FALLBACK) throw e
      const alterna = path.startsWith('http') ? path.replace(API, API_FALLBACK) : `${API_FALLBACK}${path}`
      return await fetch(alterna, options)
    }
  }

  async function leerErrorRespuesta(r) {
    const raw = await r.text()
    const pref = r.status >= 400 ? `[${r.status} ${r.statusText || ''}] `.trim() + ' ' : ''
    try {
      const err = JSON.parse(raw)
      let detail = err.detail
      if (Array.isArray(detail)) {
        detail = detail.map((x) => (typeof x === 'object' && x != null ? (x.msg || JSON.stringify(x)) : String(x))).join(' ')
      } else if (detail != null && typeof detail === 'object') {
        detail = JSON.stringify(detail)
      }
      const body = detail || raw.trim().slice(0, 600)
      return (pref + (body || `HTTP ${r.status}`)).trim()
    } catch {
      const body = raw.trim().slice(0, 900)
      return (pref + (body || `HTTP ${r.status}`)).trim()
    }
  }

  const fsMap = { pequena: 'small', normal: 'normal', grande: 'large' }
  const f          = FS[fsMap[fontSize] || fontSize] || FS.normal
  /** Escala UI del bloque «Formatos Subcontratista» según Pequeño / Mediano / Grande. */
  const ui = {
    hint: Math.max(10, f.sub - 2),
    label: f.sub,
    cardTitle: f.section,
    body: f.sub,
    itemEm: f.base,
    pIn: fontSize === 'pequena' ? '8px 10px' : fontSize === 'grande' ? '12px 14px' : '10px 12px',
    pHead: fontSize === 'pequena' ? '8px 10px' : fontSize === 'grande' ? '11px 14px' : '9px 12px',
    gap: fontSize === 'pequena' ? 8 : fontSize === 'grande' ? 12 : 10,
    iconBtn: fontSize === 'pequena' ? 34 : fontSize === 'grande' ? 44 : 40,
    iconSvg: Math.max(15, Math.min(22, f.sub + 4)),
  }
  const contratoId = usuario?.contrato_id

  /** Perfiles de interventoría: ocultar formatos marcados como no de su interés (backend: acceso_interventoria). */
  const esPerfilInterventoria = (() => {
    const r = (usuario?.rol_nombre || '').toLowerCase()
    return r.includes('intervent')
  })()

  const [subs,        setSubs]        = useState([])
  const [subId,       setSubId]       = useState('')
  const [cortes,      setCortes]      = useState([])
  const [corteId,     setCorteId]     = useState('')
  const [items,       setItems]       = useState([])
  const [cargandoSub, setCargandoSub] = useState(false)
  const [cargandoCor, setCargandoCor] = useState(false)
  const [cargandoIt,  setCargandoIt]  = useState(false)
  const [error,       setError]       = useState(null)
  /** Biblioteca CCD por contrato (formatos + config de firmas + slots). */
  const [biblioCcd, setBiblioCcd] = useState([])
  const [firmantesCcd, setFirmantesCcd] = useState([])
  /** Configuración Elaboró / Revisó + estilo PDF por código de formato CCD. */
  const [cfgFirmaCcd, setCfgFirmaCcd] = useState(() => ({
    'CC-SUB-001': {
      elaboro_nombre: '',
      elaboro_cargo: '',
      elaboro_usuario_id: null,
      reviso_nombre: '',
      reviso_cargo: '',
      reviso_usuario_id: null,
      estilo_pdf: {
        section_bar_bg: '#e5e7eb',
        section_bar_text: '#111827',
        thead_bg: '#e8e8e8',
        row_even_bg: '#ffffff',
        row_odd_bg: '#f9fafb',
        subtotal_bg: '#dbeafe',
      },
    },
    'CC-SUB-002': {
      elaboro_nombre: '',
      elaboro_cargo: '',
      elaboro_usuario_id: null,
      reviso_nombre: '',
      reviso_cargo: '',
      reviso_usuario_id: null,
      estilo_pdf: {
        section_bar_bg: '#e5e7eb',
        section_bar_text: '#111827',
        thead_bg: '#f3f4f6',
        row_even_bg: '#f8fafc',
        row_odd_bg: '#ffffff',
        subtotal_bg: '#e5e7eb',
      },
    },
  }))
  const [guardandoFirmaCcd, setGuardandoFirmaCcd] = useState(false)
  /** Por código de formato: panel abierto/cerrado (persistido en localStorage por contrato). */
  const [ccdExpanded, setCcdExpanded] = useState(() => ({}))
  /** Tarjeta «Formatos Subcontratista» (corte + memorias): abierta/cerrada por contrato. Por defecto recogida. */
  const [formatosSubAbierto, setFormatosSubAbierto] = useState(false)
  /** Tarjeta «Formatos Semanales» (conciliación por semana): mismo patrón que subcontratista. */
  const [formatosSemAbierto, setFormatosSemAbierto] = useState(false)
  /** Sub-tarjetas por formato CCD (plantilla escalable: primera = corte, segunda = memorias). Por defecto recogidas. */
  const [formatoCorte001Abierto, setFormatoCorte001Abierto] = useState(false)
  const [formatoMemorias002Abierto, setFormatoMemorias002Abierto] = useState(false)
  /** CC-SUB-002: bloque «Todos los ítems» + filas por código; recogido por defecto. */
  const [ccSub002ListadoItemsAbierto, setCcSub002ListadoItemsAbierto] = useState(false)
  const [formatoSem001Abierto, setFormatoSem001Abierto] = useState(false)
  const [formatoSem002Abierto, setFormatoSem002Abierto] = useState(false)
  /** CC-SEM-002: mismo patrón que CC-SUB-002. */
  const [ccSem002ListadoItemsAbierto, setCcSem002ListadoItemsAbierto] = useState(false)
  /** Preacta mensual CC-MES (acta RPO); cerrada por defecto. */
  const [formatosMesAbierto, setFormatosMesAbierto] = useState(false)
  /** Formatos de entidades contratantes (p. ej. IDU FO-EO-04); cerrada por defecto. */
  const [formatosEntExtAbierto, setFormatosEntExtAbierto] = useState(false)
  /** Subsistema seleccionado para la vista previa del FO-IDU-EO-04-V2 */
  const [subsistemaFoEo04, setSubsistemaFoEo04] = useState('vial')
  /** Acta seleccionada para la vista previa del FO-IDU-EO-04-V2 */
  const [actaIdFoEo04, setActaIdFoEo04] = useState('')
  /** Lista de actas RPO disponibles para el contrato */
  const [actasRpoFoEo04, setActasRpoFoEo04] = useState([])
  /** Nombre del supervisor(a) — se persiste en localStorage por contrato */
  const [supervisorFoEo04, setSupervisorFoEo04] = useState('')
  /** Job de generación progresiva de PDF para FO-IDU-EO-04-V2 */
  const [foEo04Job, setFoEo04Job] = useState(null)
  // { id, status, pct, msg, currentItem, totalItems, pdfUrl, error }
  const foEo04JobPollRef = useRef(null)
  const [formatoMes001Abierto, setFormatoMes001Abierto] = useState(false)
  const [formatoMes002Abierto, setFormatoMes002Abierto] = useState(false)
  /** CC-MES-002: filas por ítem; recogido por defecto (mismo criterio que CC-SUB/CC-SEM). */
  const [ccMes002ListadoItemsAbierto, setCcMes002ListadoItemsAbierto] = useState(false)
  const [itemsSemanal, setItemsSemanal] = useState([])
  const [cargandoItemsSemanal, setCargandoItemsSemanal] = useState(false)
  const [itemsMensual, setItemsMensual] = useState([])
  const [cargandoItemsMensual, setCargandoItemsMensual] = useState(false)
  /** Panel «Biblioteca CCD» (derecha superior): contraído por defecto. */
  const [biblioPanelAbierto, setBiblioPanelAbierto] = useState(false)

  /** Vista previa: PDF en modal (blob). */
  const [vistaPrevia, setVistaPrevia] = useState(null)
  /** null | 'corte' | 'todos' | 'sem001' | 'sem2-all' | 's2:'+item | string (item corte) — Excel en curso */
  const [excelBusy, setExcelBusy] = useState(null)
  const [firmaCorteBusy, setFirmaCorteBusy] = useState(false)
  /** Firmas ya registradas en el corte por código de formato (misma tabla; slots Elaboró/Revisó). */
  const [firmasCcd, setFirmasCcd] = useState({
    'CC-SUB-001': null,
    'CC-SUB-002': null,
    'CC-SEM-001': null,
    'CC-SEM-002': null,
    'CC-MES-001': null,
    'CC-MES-002': null,
    'CC-GER-001': null,
    'FO-IDU-EO-04-V2': null,
  })
  const [registrarFirmaBusy, setRegistrarFirmaBusy] = useState(false)
  // null | { fase:'cargando', tipo } | { fase:'ok', tipo, datos } | { fase:'error', tipo, mensaje }

  const [semanasConc, setSemanasConc] = useState([])
  const [actasConc, setActasConc] = useState([])
  const [semanaConcId, setSemanaConcId] = useState('')
  const [actaConcId, setActaConcId] = useState('')
  /** CC-GER-001: acta presente = RPO en período (misma lógica que matriz SICOE), vía /json/informe-gerencia-matriz. */
  const [gerAutoActaId, setGerAutoActaId] = useState(null)
  const [gerMatDato, setGerMatDato] = useState(null)
  const [formatosInformeGerAbierto, setFormatosInformeGerAbierto] = useState(false)
  const [formatoGer001Abierto, setFormatoGer001Abierto] = useState(false)
  /** Descarga PDF conciliación (CC-SEM / CC-MES): independiente del registro de firma. */
  const [concPdfBusy, setConcPdfBusy] = useState(false)
  /** null o código de formato mientras corre POST registrar-firma (un botón no bloquea al otro). */
  const [firmaRegistroBusy, setFirmaRegistroBusy] = useState(null)
  const [cargandoSemanasConc, setCargandoSemanasConc] = useState(false)
  const semanasConcFetchRef = useRef(null)
  const biblioCcdVisible = biblioCcd.filter(
    (fmt) => !esPerfilInterventoria || fmt.acceso_interventoria === true
  )
  const biblioCcdInternos = biblioCcdVisible.filter((f) => f.grupo_ccd !== 'entidades_externas')
  const biblioCcdEntidadesExternas = biblioCcdVisible.filter((f) => f.grupo_ccd === 'entidades_externas')
  const biblioCcdListaPlana = [
    ...(biblioCcdInternos.length
      ? [{ _tipo: 'titulo', _key: 'tit-clara', texto: 'Plantillas ClaraCore (CCD)' }]
      : []),
    ...biblioCcdInternos.map((fmt) => ({ _tipo: 'fmt', _key: `fmt-${fmt.codigo}`, fmt })),
    ...(biblioCcdEntidadesExternas.length
      ? [{ _tipo: 'titulo', _key: 'tit-ext', texto: 'Formatos Entidades Externas' }]
      : []),
    ...biblioCcdEntidadesExternas.map((fmt) => ({ _tipo: 'fmt', _key: `fmt-${fmt.codigo}`, fmt })),
  ]

  const subCcd001Vis =
    !esPerfilInterventoria ||
    biblioCcd.length === 0 ||
    biblioCcdVisible.some((f) => f.codigo === 'CC-SUB-001')
  const subCcd002Vis =
    !esPerfilInterventoria ||
    biblioCcd.length === 0 ||
    biblioCcdVisible.some((f) => f.codigo === 'CC-SUB-002')
  const mostrarBloqueFormatosSub = subCcd001Vis || subCcd002Vis

  const subSel   = subs.find(s => String(s.id) === subId)   || null
  const corteSel = cortes.find(c => String(c.id) === corteId) || null
  const actaSel = actasConc.find((a) => String(a.id) === String(actaConcId)) || null

  useEffect(() => {
    if (!contratoId) {
      setSubs([])
      setBiblioCcd([])
      setFirmantesCcd([])
      setActasConc([])
      setSemanasConc([])
      semanasConcFetchRef.current = null
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada. Ingresa de nuevo para generar informes.')
      return
    }
    setSemanasConc([])
    semanasConcFetchRef.current = null
    setCargandoSub(true)
    setError(null)
    const firmantesP = puedeEditarCcd
      ? fetchConFallback(`/informes/${contratoId}/ccd/firmantes-candidatos`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then((r) => (r.ok ? r.json() : []))
      : Promise.resolve([])

    Promise.all([
      fetchConFallback(`/informes/${contratoId}/subcontratistas`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => r.json()),
      fetchConFallback(`/informes/${contratoId}/ccd/biblioteca`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : [])),
      firmantesP,
      fetchConFallback(`/informes/${contratoId}/ccd/actas-rpo`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([subData, bib, cand, act]) => {
        setSubs(Array.isArray(subData) ? subData : [])
        setBiblioCcd(Array.isArray(bib) ? bib : [])
        setFirmantesCcd(Array.isArray(cand) ? cand : [])
        setActasConc(Array.isArray(act) ? act : [])
        const b = Array.isArray(bib) ? bib : []
        const blank = (cod) => ({
          elaboro_nombre: '',
          elaboro_cargo: '',
          elaboro_usuario_id: null,
          elaboro2_nombre: '',
          elaboro2_cargo: '',
          elaboro2_usuario_id: null,
          reviso_nombre: '',
          reviso_cargo: '',
          reviso_usuario_id: null,
          reviso2_nombre: '',
          reviso2_cargo: '',
          reviso2_usuario_id: null,
          aprobo_nombre: '',
          aprobo_cargo: '',
          aprobo_usuario_id: null,
          estilo_pdf: estiloDefectoCcd(cod),
        })
        setCfgFirmaCcd((prev) => {
          const next = { ...prev }
          for (const row of b) {
            const cod = row?.codigo
            const cf = row?.config_firma
            if (!cod || !cf || typeof cf !== 'object') continue
            const base = blank(cod)
            const es = cf.estilo_pdf && typeof cf.estilo_pdf === 'object' ? cf.estilo_pdf : {}
            next[cod] = {
              ...base,
              elaboro_nombre: cf.elaboro_nombre ?? '',
              elaboro_cargo: cf.elaboro_cargo ?? '',
              elaboro_usuario_id: cf.elaboro_usuario_id ?? null,
              elaboro2_nombre: cf.elaboro2_nombre ?? '',
              elaboro2_cargo: cf.elaboro2_cargo ?? '',
              elaboro2_usuario_id: cf.elaboro2_usuario_id ?? null,
              reviso_nombre: cf.reviso_nombre ?? '',
              reviso_cargo: cf.reviso_cargo ?? '',
              reviso_usuario_id: cf.reviso_usuario_id ?? null,
              reviso2_nombre: cf.reviso2_nombre ?? '',
              reviso2_cargo: cf.reviso2_cargo ?? '',
              reviso2_usuario_id: cf.reviso2_usuario_id ?? null,
              aprobo_nombre: cf.aprobo_nombre ?? '',
              aprobo_cargo: cf.aprobo_cargo ?? '',
              aprobo_usuario_id: cf.aprobo_usuario_id ?? null,
              estilo_pdf: { ...base.estilo_pdf, ...es },
            }
          }
          return next
        })
      })
      .catch(() => {
        setError('Error cargando datos del contrato')
        setSubs([])
        setBiblioCcd([])
        setFirmantesCcd([])
        setActasConc([])
      })
      .finally(() => setCargandoSub(false))
  }, [contratoId, puedeEditarCcd])

  const ccdExpandedStorageKey = contratoId != null ? `ccd_biblio_expanded_v2_${contratoId}` : null

  useEffect(() => {
    if (!ccdExpandedStorageKey) {
      setCcdExpanded({})
      return
    }
    try {
      const raw = localStorage.getItem(ccdExpandedStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setCcdExpanded(parsed)
        }
      }
    } catch {
      /* noop */
    }
  }, [ccdExpandedStorageKey])

  function toggleCcdFormato(codigo) {
    if (!ccdExpandedStorageKey) return
    setCcdExpanded((prev) => {
      const next = { ...prev, [codigo]: !prev[codigo] }
      try {
        localStorage.setItem(ccdExpandedStorageKey, JSON.stringify(next))
      } catch {
        /* noop */
      }
      return next
    })
  }

  const formatosSubStorageKey = contratoId != null ? `informes_formatos_sub_abierto_${contratoId}` : null

  useEffect(() => {
    if (!formatosSubStorageKey) {
      setFormatosSubAbierto(false)
      return
    }
    try {
      const raw = localStorage.getItem(formatosSubStorageKey)
      if (raw === 'true') setFormatosSubAbierto(true)
      else setFormatosSubAbierto(false)
    } catch {
      /* noop */
    }
  }, [formatosSubStorageKey])

  function toggleFormatosSub() {
    setFormatosSubAbierto((prev) => {
      const next = !prev
      if (formatosSubStorageKey) {
        try {
          localStorage.setItem(formatosSubStorageKey, String(next))
        } catch {
          /* noop */
        }
      }
      return next
    })
  }

  /** Siempre recogido al cargar; no persistir en localStorage (evita que quede abierto entre visitas). */
  function toggleFormatosSem() {
    setFormatosSemAbierto((prev) => !prev)
  }

  useEffect(() => {
    if (!formatosSemAbierto) {
      setFormatoSem001Abierto(false)
      setFormatoSem002Abierto(false)
    }
  }, [formatosSemAbierto])

  function toggleFormatosMes() {
    setFormatosMesAbierto((prev) => !prev)
  }

  function toggleFormatosInformeGer() {
    setFormatosInformeGerAbierto((prev) => !prev)
  }

  useEffect(() => {
    if (!formatosMesAbierto) {
      setFormatoMes001Abierto(false)
      setFormatoMes002Abierto(false)
    }
  }, [formatosMesAbierto])

  useEffect(() => {
    if (!formatoMemorias002Abierto) setCcSub002ListadoItemsAbierto(false)
  }, [formatoMemorias002Abierto])

  useEffect(() => {
    if (!formatoSem002Abierto) setCcSem002ListadoItemsAbierto(false)
  }, [formatoSem002Abierto])

  useEffect(() => {
    if (!formatoMes002Abierto) setCcMes002ListadoItemsAbierto(false)
  }, [formatoMes002Abierto])

  /** Actas RPO + supervisor guardado: carga cuando se abre la sección de Formatos Entidades Externas */
  useEffect(() => {
    if (!formatosEntExtAbierto || !contratoId) return
    // Restaurar supervisor guardado para este contrato
    const savedSup = localStorage.getItem(`supervisor_fo_eo_04_${contratoId}`) || ''
    setSupervisorFoEo04(savedSup)
    const authToken = getAuthToken()
    if (!authToken) return
    fetchConFallback(`/informes/${contratoId}/ccd/actas-rpo`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setActasRpoFoEo04(Array.isArray(data) ? data : [])
        if (Array.isArray(data) && data.length > 0 && !actaIdFoEo04) {
          setActaIdFoEo04(String(data[0].id))
        }
      })
      .catch(() => {})
  }, [formatosEntExtAbierto, contratoId])

  /** Semanas (pesado en servidor): solo al abrir «Formatos Semanales»; una vez por contrato. */
  useEffect(() => {
    if (!contratoId || !formatosSemAbierto) return
    if (semanasConcFetchRef.current === contratoId) return
    const authToken = getAuthToken()
    if (!authToken) return
    let cancelled = false
    setCargandoSemanasConc(true)
    fetchConFallback(`/informes/${contratoId}/ccd/semanas`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((sem) => {
        if (cancelled) return
        setSemanasConc(Array.isArray(sem) ? sem : [])
        semanasConcFetchRef.current = contratoId
      })
      .catch(() => {
        if (!cancelled) setSemanasConc([])
      })
      .finally(() => {
        if (!cancelled) setCargandoSemanasConc(false)
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, formatosSemAbierto])

  useEffect(() => {
    if (contratoId == null || contratoId === '' || !corteId) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-SUB-001': null, 'CC-SUB-002': null }))
      return
    }
    const authToken = getAuthToken()
    if (!authToken) return
    let cancelled = false
    const codigos = ['CC-SUB-001', 'CC-SUB-002']
    Promise.all(
      codigos.map((cod) =>
        fetchConFallback(
          `/informes/${contratoId}/ccd/corte/${corteId}/firmas-registradas/${encodeURIComponent(cod)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        ).then((r) => (r.ok ? r.json() : null))
      )
    )
      .then((arr) => {
        if (cancelled) return
        setFirmasCcd((prev) => ({
          ...prev,
          'CC-SUB-001': arr[0],
          'CC-SUB-002': arr[1],
        }))
      })
      .catch(() => {
        if (!cancelled) {
          setFirmasCcd((prev) => ({ ...prev, 'CC-SUB-001': null, 'CC-SUB-002': null }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, corteId])

  useEffect(() => {
    if (contratoId == null || contratoId === '' || !semanaConcId) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-SEM-001': null, 'CC-SEM-002': null }))
      return
    }
    const sid = parseInt(String(semanaConcId), 10)
    if (!Number.isFinite(sid)) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-SEM-001': null, 'CC-SEM-002': null }))
      return
    }
    const authToken = getAuthToken()
    if (!authToken) return
    let cancelled = false
    const codigos = ['CC-SEM-001', 'CC-SEM-002']
    Promise.all(
      codigos.map((cod) =>
        fetchConFallback(
          `/informes/${contratoId}/ccd/contexto/semana/${sid}/firmas-registradas/${encodeURIComponent(cod)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        ).then((r) => (r.ok ? r.json() : null))
      )
    )
      .then((arr) => {
        if (cancelled) return
        setFirmasCcd((prev) => ({
          ...prev,
          'CC-SEM-001': arr[0],
          'CC-SEM-002': arr[1],
        }))
      })
      .catch(() => {
        if (!cancelled) {
          setFirmasCcd((prev) => ({ ...prev, 'CC-SEM-001': null, 'CC-SEM-002': null }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, semanaConcId])

  useEffect(() => {
    if (contratoId == null || contratoId === '' || !actaConcId) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-MES-001': null, 'CC-MES-002': null }))
      return
    }
    const aid = parseInt(String(actaConcId), 10)
    if (!Number.isFinite(aid)) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-MES-001': null, 'CC-MES-002': null }))
      return
    }
    const authToken = getAuthToken()
    if (!authToken) return
    let cancelled = false
    const codigos = ['CC-MES-001', 'CC-MES-002']
    Promise.all(
      codigos.map((cod) =>
        fetchConFallback(
          `/informes/${contratoId}/ccd/contexto/acta_rpo/${aid}/firmas-registradas/${encodeURIComponent(cod)}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        ).then((r) => (r.ok ? r.json() : null))
      )
    )
      .then((arr) => {
        if (cancelled) return
        setFirmasCcd((prev) => ({
          ...prev,
          'CC-MES-001': arr[0],
          'CC-MES-002': arr[1],
        }))
      })
      .catch(() => {
        if (!cancelled) {
          setFirmasCcd((prev) => ({ ...prev, 'CC-MES-001': null, 'CC-MES-002': null }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, actaConcId])

  useEffect(() => {
    if (contratoId == null || contratoId === '') {
      setFirmasCcd((prev) => ({ ...prev, 'CC-GER-001': null }))
      return
    }
    const raw = gerAutoActaId
    if (!raw) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-GER-001': null }))
      return
    }
    const aid = parseInt(String(raw), 10)
    if (!Number.isFinite(aid)) {
      setFirmasCcd((prev) => ({ ...prev, 'CC-GER-001': null }))
      return
    }
    const authToken = getAuthToken()
    if (!authToken) return
    let cancelled = false
    const cod = 'CC-GER-001'
    fetchConFallback(
      `/informes/${contratoId}/ccd/contexto/acta_rpo/${aid}/firmas-registradas/${encodeURIComponent(cod)}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        setFirmasCcd((prev) => ({ ...prev, 'CC-GER-001': data }))
      })
      .catch(() => {
        if (!cancelled) setFirmasCcd((prev) => ({ ...prev, 'CC-GER-001': null }))
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, gerAutoActaId])

  // Carga firmas registradas para FO-IDU-EO-04-V2 cuando cambia el acta seleccionada
  useEffect(() => {
    const cod = 'FO-IDU-EO-04-V2'
    if (contratoId == null || contratoId === '' || !actaIdFoEo04) {
      setFirmasCcd((prev) => ({ ...prev, [cod]: null }))
      return
    }
    const aid = parseInt(String(actaIdFoEo04), 10)
    if (!Number.isFinite(aid)) {
      setFirmasCcd((prev) => ({ ...prev, [cod]: null }))
      return
    }
    const authToken = getAuthToken()
    if (!authToken) return
    let cancelled = false
    fetchConFallback(
      `/informes/${contratoId}/ccd/contexto/acta_rpo/${aid}/firmas-registradas/${encodeURIComponent(cod)}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setFirmasCcd((prev) => ({ ...prev, [cod]: data })) })
      .catch(() => { if (!cancelled) setFirmasCcd((prev) => ({ ...prev, [cod]: null })) })
    return () => { cancelled = true }
  }, [contratoId, actaIdFoEo04])

  useEffect(() => {
    if (contratoId == null || contratoId === '') {
      setGerAutoActaId(null)
      setGerMatDato(null)
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setGerAutoActaId(null)
      setGerMatDato(null)
      return
    }
    let cancelled = false
    fetchConFallback(`/informes/${contratoId}/json/informe-gerencia-matriz`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (!d) {
          setGerMatDato(null)
          setGerAutoActaId(null)
          return
        }
        setGerMatDato(d)
        const id = d?.acta_presente?.id
        if (id != null) setGerAutoActaId(String(id))
        else setGerAutoActaId(null)
      })
      .catch(() => {
        if (!cancelled) {
          setGerAutoActaId(null)
          setGerMatDato(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [contratoId])

  useEffect(() => {
    if (!contratoId || !semanaConcId || !formatosSemAbierto) {
      setItemsSemanal([])
      return
    }
    const sid = parseInt(String(semanaConcId), 10)
    if (!Number.isFinite(sid)) {
      setItemsSemanal([])
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setItemsSemanal([])
      return
    }
    let cancelled = false
    setCargandoItemsSemanal(true)
    fetchConFallback(`/informes/${contratoId}/ccd/conciliacion/semana/${sid}/items`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setItemsSemanal(Array.isArray(d?.items) ? d.items : [])
      })
      .catch(() => {
        if (!cancelled) setItemsSemanal([])
      })
      .finally(() => {
        if (!cancelled) setCargandoItemsSemanal(false)
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, semanaConcId, formatosSemAbierto])

  useEffect(() => {
    if (!contratoId || !actaConcId || !formatosMesAbierto) {
      setItemsMensual([])
      return
    }
    const aid = parseInt(String(actaConcId), 10)
    if (!Number.isFinite(aid)) {
      setItemsMensual([])
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setItemsMensual([])
      return
    }
    let cancelled = false
    setCargandoItemsMensual(true)
    fetchConFallback(`/informes/${contratoId}/ccd/conciliacion/acta/${aid}/items`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setItemsMensual(Array.isArray(d?.items) ? d.items : [])
      })
      .catch(() => {
        if (!cancelled) setItemsMensual([])
      })
      .finally(() => {
        if (!cancelled) setCargandoItemsMensual(false)
      })
    return () => {
      cancelled = true
    }
  }, [contratoId, actaConcId, formatosMesAbierto])

  function onSubChange(e) {
    const id = e.target.value
    setSubId(id); setCorteId(''); setCortes([]); setItems([]); setError(null)
    if (!id) return
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada. Ingresa de nuevo para generar informes.')
      return
    }
    setCargandoCor(true)
    fetchConFallback(`/informes/${contratoId}/cortes/${id}`,
      { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => setCortes(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando cortes'))
      .finally(() => setCargandoCor(false))
  }

  function onCorteChange(e) {
    const id = e.target.value
    setCorteId(id); setItems([]); setError(null)
    if (!id) return
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada. Ingresa de nuevo para generar informes.')
      return
    }
    setCargandoIt(true)
    fetchConFallback(`/informes/${contratoId}/items-corte/${id}`,
      { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError('Error cargando ítems'))
      .finally(() => setCargandoIt(false))
  }

  function cerrarVistaPrevia() {
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return null
    })
  }

  /** Vista previa = mismo PDF que genera el servidor (la ruta JSON fallaba en algunos entornos). */
  async function abrirVistaPreviaCorte() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: 'Selecciona contrato y corte.' })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'corte' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const pathPdf = `/informes/${cid}/pdf/corte-subcontratista/${cor}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'corte-pdf', pdfUrl })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'corte', mensaje: msg })
    }
  }

  /** PDF CC-SUB-001 + página de sello (firma del perfil, huella SHA-256, fecha, contrato). */
  async function descargarPdfCorteConSello() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setError('Selecciona contrato y corte.')
      return
    }
    setFirmaCorteBusy(true)
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const pathPdf = `/informes/${cid}/pdf/corte-subcontratista/${cor}/con-sello-firma`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setError(msg)
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CC-SUB-001_corte_${corteId}_firmado.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setFirmaCorteBusy(false)
    }
  }

  /** Registra en el servidor la URL de firma del perfil para Elaboró o Revisó (según biblioteca CCD). */
  async function registrarMiFirmaCcd(formatoCodigo) {
    if (!puedeValidarCcd) {
      setError('No tienes permiso para registrar firmas en formatos (acción Validar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setError('Selecciona contrato y corte.')
      return
    }
    setRegistrarFirmaBusy(true)
    setError(null)
    try {
      const cod = encodeURIComponent(formatoCodigo)
      const r = await fetchConFallback(
        `/informes/${contratoId}/ccd/corte/${corteId}/registrar-firma/${cod}`,
        { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!r?.ok) {
        const msg = await leerErrorRespuesta(r)
        setError(msg || 'No se pudo registrar la firma.')
        return
      }
      const rr = await fetchConFallback(
        `/informes/${contratoId}/ccd/corte/${corteId}/firmas-registradas/${cod}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (rr?.ok) {
        const data = await rr.json()
        setFirmasCcd((prev) => ({ ...prev, [formatoCodigo]: data }))
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setRegistrarFirmaBusy(false)
    }
  }

  async function abrirVistaPreviaMemoria(itemNumero) {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: 'Selecciona contrato y corte.', itemNumero })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'memoria', itemNumero }
    })
    setError(null)
    const q = encodeURIComponent(itemNumero)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const pathPdf = `/informes/${cid}/pdf/memoria-item/${cor}?item_numero=${q}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: msg, itemNumero })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'memoria-pdf', pdfUrl, itemNumero })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'memoria', mensaje: msg, itemNumero })
    }
  }

  /** Un solo PDF con todas las memorias CC-SUB-002 del corte (mismo formato que por ítem, página nueva entre ítems). */
  async function abrirVistaPreviaMemoriaCorteCompleto() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setVistaPrevia({ fase: 'error', tipo: 'memoria-todos', mensaje: 'Selecciona contrato y corte.' })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'memoria-todos' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const pathPdf = `/informes/${cid}/pdf/memoria-corte-completo/${cor}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'memoria-todos', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'memoria-pdf-todos', pdfUrl })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'memoria-todos', mensaje: msg })
    }
  }

  async function abrirVistaPreviaCorteSemanal() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !semanaConcId) {
      setVistaPrevia({ fase: 'error', tipo: 'corte-sem', mensaje: 'Selecciona la semana.' })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'corte-sem' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const sid = encodeURIComponent(semanaConcId)
    const pathPdf = `/informes/${cid}/pdf/cc-sem-001/semana/${sid}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'corte-sem', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'corte-sem-pdf', pdfUrl })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'corte-sem', mensaje: msg })
    }
  }

  async function abrirVistaPreviaMemoriaSemanal(itemNumero) {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !semanaConcId) {
      setVistaPrevia({ fase: 'error', tipo: 'memoria-sem', mensaje: 'Selecciona la semana.', itemNumero })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'memoria-sem', itemNumero }
    })
    setError(null)
    const q = encodeURIComponent(itemNumero)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const sid = encodeURIComponent(semanaConcId)
    const pathPdf = `/informes/${cid}/pdf/cc-sem-002/semana/${sid}?item_numero=${q}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'memoria-sem', mensaje: msg, itemNumero })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'memoria-sem-pdf', pdfUrl, itemNumero })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'memoria-sem', mensaje: msg, itemNumero })
    }
  }

  async function abrirVistaPreviaMemoriaSemanalCompleto() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !semanaConcId) {
      setVistaPrevia({ fase: 'error', tipo: 'memoria-sem-todos', mensaje: 'Selecciona la semana.' })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'memoria-sem-todos' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const sid = encodeURIComponent(semanaConcId)
    const pathPdf = `/informes/${cid}/pdf/cc-sem-002/semana/${sid}/completo`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'memoria-sem-todos', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'memoria-sem-todos-pdf', pdfUrl })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'memoria-sem-todos', mensaje: msg })
    }
  }

  async function abrirVistaPreviaCorteMensual() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !actaConcId) {
      setVistaPrevia({ fase: 'error', tipo: 'corte-mes', mensaje: 'Selecciona el acta RPO.' })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'corte-mes' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const aid = encodeURIComponent(actaConcId)
    const pathPdf = `/informes/${cid}/pdf/cc-mes-001/acta/${aid}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'corte-mes', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'corte-mes-pdf', pdfUrl })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'corte-mes', mensaje: msg })
    }
  }

  function rutaInformeGerenciaPdf(conSello) {
    const base = `/informes/${contratoId}/pdf/cc-ger-001`
    return conSello ? rutaPdfConcConSello(base) : base
  }

  async function abrirVistaPreviaInformeGerencia() {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '') {
      setVistaPrevia({ fase: 'error', tipo: 'corte-ger', mensaje: 'Sin contrato.' })
      return
    }
    if (!gerAutoActaId) {
      setVistaPrevia({
        fase: 'error',
        tipo: 'corte-ger',
        mensaje: 'Sin acta RPO en período o aún cargando datos. Espera un momento o revisa fechas de actas en SICOE.',
      })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'corte-ger' }
    })
    setError(null)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const pathPdf = rutaInformeGerenciaPdf(false)
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'corte-ger', mensaje: msg })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'corte-ger-pdf', pdfUrl })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'corte-ger', mensaje: msg })
    }
  }

  async function abrirVistaPreviaMemoriaMensual(itemNumero) {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !actaConcId) {
      setVistaPrevia({ fase: 'error', tipo: 'memoria-mes', mensaje: 'Selecciona el acta RPO.', itemNumero })
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'memoria-mes', itemNumero }
    })
    setError(null)
    const q = encodeURIComponent(itemNumero)
    const opts = { headers: { Authorization: `Bearer ${authToken}` } }
    const cid = encodeURIComponent(contratoId)
    const aid = encodeURIComponent(actaConcId)
    const pathPdf = `/informes/${cid}/pdf/cc-mes-002/acta/${aid}?item_numero=${q}`
    try {
      const r = await fetchConFallback(pathPdf, opts)
      if (!r || !r.ok) {
        const msg = r ? await leerErrorRespuesta(r) : 'Sin respuesta'
        setVistaPrevia({ fase: 'error', tipo: 'memoria-mes', mensaje: msg, itemNumero })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'memoria-mes-pdf', pdfUrl, itemNumero })
    } catch (e) {
      const msg = String(e?.message || e)
      setVistaPrevia({ fase: 'error', tipo: 'memoria-mes', mensaje: msg, itemNumero })
    }
  }

  function nombreArchivoDesdeContentDisposition(cd) {
    if (!cd || typeof cd !== 'string') return null
    const u = /filename\*=UTF-8''([^;\n]+)/i.exec(cd)
    if (u) return decodeURIComponent(u[1].trim())
    const q = /filename="([^"]+)"/i.exec(cd)
    if (q) return q[1]
    const nq = /filename=([^;\n]+)/i.exec(cd)
    if (nq) return nq[1].replace(/^["']|["']$/g, '').trim()
    return null
  }

  /** Misma ruta que el PDF «limpio» pero con `/con-sello-firma` (huella SHA-256 + firma de perfil). */
  function rutaPdfConcConSello(rutaRelativa) {
    const s = String(rutaRelativa || '')
    if (s.includes('/con-sello-firma')) return s
    const qi = s.indexOf('?')
    if (qi === -1) return `${s}/con-sello-firma`
    return `${s.slice(0, qi)}/con-sello-firma${s.slice(qi)}`
  }

  async function descargarPdfConc(rutaRelativa, fallbackNombre) {
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    setConcPdfBusy(true)
    setError(null)
    try {
      const r = await fetchConFallback(rutaRelativa, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r?.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || fallbackNombre
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setConcPdfBusy(false)
    }
  }

  async function registrarFirmaConc(formatoCodigo, contextoTipo, contextoId) {
    if (!puedeValidarCcd) {
      setError('No tienes permiso para registrar firmas en formatos (acción Validar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contextoId === '' || contextoId == null) {
      setError('Selecciona semana o acta.')
      return
    }
    const ctx = parseInt(String(contextoId), 10)
    if (!Number.isFinite(ctx)) {
      setError('Identificador de contexto no válido.')
      return
    }
    setFirmaRegistroBusy(formatoCodigo)
    setError(null)
    const cod = encodeURIComponent(formatoCodigo)
    try {
      const r = await fetchConFallback(
        `/informes/${contratoId}/ccd/contexto/${contextoTipo}/${ctx}/registrar-firma/${cod}`,
        { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!r?.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'No se pudo registrar la firma.')
        return
      }
      const rr = await fetchConFallback(
        `/informes/${contratoId}/ccd/contexto/${contextoTipo}/${ctx}/firmas-registradas/${cod}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (rr?.ok) {
        const data = await rr.json()
        setFirmasCcd((prev) => ({ ...prev, [formatoCodigo]: data }))
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setFirmaRegistroBusy(null)
    }
  }

  async function registrarFirmaFoEo04() {
    const cod = 'FO-IDU-EO-04-V2'
    if (!puedeValidarCcd) {
      setError('No tienes permiso para registrar firmas (acción Validar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) { setError('Sesion no autenticada.'); return }
    if (!actaIdFoEo04) { setError('Selecciona un acta para registrar la firma.'); return }
    const aid = parseInt(String(actaIdFoEo04), 10)
    if (!Number.isFinite(aid)) { setError('Acta no válida.'); return }
    setFirmaRegistroBusy(cod)
    setError(null)
    try {
      const r = await fetchConFallback(
        `/informes/${contratoId}/ccd/contexto/acta_rpo/${aid}/registrar-firma/${encodeURIComponent(cod)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!r?.ok) { setError(r ? await leerErrorRespuesta(r) : 'No se pudo registrar la firma.'); return }
      const rr = await fetchConFallback(
        `/informes/${contratoId}/ccd/contexto/acta_rpo/${aid}/firmas-registradas/${encodeURIComponent(cod)}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (rr?.ok) {
        const data = await rr.json()
        setFirmasCcd((prev) => ({ ...prev, [cod]: data }))
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setFirmaRegistroBusy(null)
    }
  }

  async function descargarExcelMemoriaCorteCompleto() {
    if (!puedeExportarCcd) {
      setError('No tienes permiso para exportar a Excel (acción Exportar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setError('Selecciona contrato y corte.')
      return
    }
    setExcelBusy('todos')
    setError(null)
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const path = `/informes/${cid}/excel/memoria-corte-completo/${cor}`
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r || !r.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || 'memoria-corte.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setExcelBusy(null)
    }
  }

  async function descargarExcelMemoriaItem(itemNumero) {
    if (!puedeExportarCcd) {
      setError('No tienes permiso para exportar a Excel (acción Exportar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setError('Selecciona contrato y corte.')
      return
    }
    setExcelBusy(itemNumero)
    setError(null)
    const q = encodeURIComponent(itemNumero)
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const path = `/informes/${cid}/excel/memoria-item/${cor}?item_numero=${q}`
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r || !r.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || 'memoria-item.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setExcelBusy(null)
    }
  }

  async function descargarExcelCorteSubcontratista() {
    if (!puedeExportarCcd) {
      setError('No tienes permiso para exportar a Excel (acción Exportar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !corteId) {
      setError('Selecciona contrato y corte.')
      return
    }
    setExcelBusy('corte')
    setError(null)
    const cid = encodeURIComponent(contratoId)
    const cor = encodeURIComponent(corteId)
    const path = `/informes/${cid}/excel/corte-subcontratista/${cor}`
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r || !r.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || 'corte-subcontratista.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setExcelBusy(null)
    }
  }

  async function descargarExcelCcSem001() {
    if (!puedeExportarCcd) {
      setError('No tienes permiso para exportar a Excel (acción Exportar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !semanaConcId) {
      setError('Selecciona contrato y semana de conciliación.')
      return
    }
    setExcelBusy('sem001')
    setError(null)
    const cid = encodeURIComponent(contratoId)
    const sid = encodeURIComponent(semanaConcId)
    const path = `/informes/${cid}/excel/cc-sem-001/semana/${sid}`
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r || !r.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || 'CC-SEM-001.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setExcelBusy(null)
    }
  }

  async function descargarExcelCcSem002Completo() {
    if (!puedeExportarCcd) {
      setError('No tienes permiso para exportar a Excel (acción Exportar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !semanaConcId) {
      setError('Selecciona contrato y semana de conciliación.')
      return
    }
    setExcelBusy('sem2-all')
    setError(null)
    const cid = encodeURIComponent(contratoId)
    const sid = encodeURIComponent(semanaConcId)
    const path = `/informes/${cid}/excel/cc-sem-002/semana/${sid}/completo`
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r || !r.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || 'CC-SEM-002-todos.xlsx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setExcelBusy(null)
    }
  }

  async function descargarExcelCcSem002Item(itemNumero) {
    if (!puedeExportarCcd) {
      setError('No tienes permiso para exportar a Excel (acción Exportar en Informes CCD).')
      return
    }
    const authToken = getAuthToken()
    if (!authToken) {
      setError('Sesion no autenticada.')
      return
    }
    if (contratoId == null || contratoId === '' || !semanaConcId || !itemNumero) {
      setError('Selecciona contrato, semana e ítem.')
      return
    }
    const key = `s2:${itemNumero}`
    setExcelBusy(key)
    setError(null)
    const cid = encodeURIComponent(contratoId)
    const sid = encodeURIComponent(semanaConcId)
    const q = encodeURIComponent(itemNumero)
    const path = `/informes/${cid}/excel/cc-sem-002/semana/${sid}?item_numero=${q}`
    try {
      const r = await fetchConFallback(path, { headers: { Authorization: `Bearer ${authToken}` } })
      if (!r || !r.ok) {
        setError(r ? await leerErrorRespuesta(r) : 'Sin respuesta')
        return
      }
      const blob = await r.blob()
      const name = nombreArchivoDesdeContentDisposition(r.headers.get('content-disposition')) || `CC-SEM-002-${itemNumero}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setExcelBusy(null)
    }
  }

  const fmtFecha = d => d
    ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })
    : '?'

  const card = {
    background: t.bgCard, borderRadius: '12px',
    border: `1px solid ${t.border}`, padding: '20px', marginBottom: '14px',
    boxShadow: `0 10px 24px ${t.border}33`
  }
  /** Tarjeta principal de informes de subcontratista: se distingue del fondo de página. */
  const cardFormatosSub = {
    ...card,
    padding: fontSize === 'pequena' ? '14px 16px' : fontSize === 'grande' ? '22px 20px' : '18px 18px',
    background: `linear-gradient(165deg, ${t.primary}16 0%, ${t.bgCard} 42%, ${t.bg} 100%)`,
    border: `1px solid ${t.primary}40`,
    boxShadow: `0 12px 28px ${t.primary}18`,
  }
  const sectionTitle = {
    fontSize: f.base + 'px', fontWeight: '800', color: t.text, marginBottom: '14px'
  }
  const label = {
    display: 'block', fontSize: f.sub + 'px', fontWeight: '700',
    color: t.textMuted, letterSpacing: '0.8px', textTransform: 'uppercase',
    marginBottom: '8px'
  }
  /** Etiquetas del bloque Formatos Subcontratista (escala con Pequeño/Mediano/Grande). */
  const labelSub = {
    display: 'block',
    fontSize: ui.label + 'px',
    fontWeight: '700',
    color: t.textMuted,
    letterSpacing: fontSize === 'pequena' ? '0.5px' : '0.75px',
    textTransform: 'uppercase',
    marginBottom: fontSize === 'pequena' ? '5px' : '7px',
  }
  const select = {
    width: '100%', padding: '9px 12px', borderRadius: '7px',
    border: `1px solid ${t.border}`, background: t.bg,
    color: t.text, fontSize: f.base + 'px', outline: 'none',
    cursor: 'pointer'
  }
  const selectSub = {
    width: '100%',
    padding: fontSize === 'pequena' ? '7px 10px' : fontSize === 'grande' ? '10px 14px' : '8px 12px',
    borderRadius: '7px',
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    fontSize: ui.body + 'px',
    outline: 'none',
    cursor: 'pointer',
  }
  const infoBox = {
    marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
    background: t.primary + '11', border: `1px solid ${t.primary}33`,
    fontSize: f.sub + 'px', color: t.textMuted,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 10px'
  }
  const infoBoxSub = {
    marginTop: '8px',
    padding: fontSize === 'pequena' ? '8px 10px' : '10px 12px',
    borderRadius: '8px',
    background: t.primary + '11',
    border: `1px solid ${t.primary}33`,
    fontSize: ui.hint + 'px',
    color: t.textMuted,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '4px 8px',
  }
  const btnVer = (dis) => ({
    padding: `${fontSize === 'pequena' ? 6 : 7}px ${fontSize === 'grande' ? 18 : 14}px`,
    borderRadius: '7px', border: 'none',
    background: dis ? t.border : t.primary, color: 'white',
    fontWeight: '700', fontSize: ui.body + 'px',
    cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.6 : 1,
    whiteSpace: 'nowrap', flexShrink: 0
  })
  /** Botón solo icono: descarga Excel (tooltip en title). */
  const btnIconoExcel = (dis) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: ui.iconBtn,
    minWidth: ui.iconBtn,
    height: ui.iconBtn - 4,
    padding: 0,
    borderRadius: '7px',
    border: `2px solid ${dis ? t.border : t.primary}`,
    background: dis ? t.border + '22' : 'transparent',
    color: dis ? t.textMuted : t.primary,
    cursor: dis ? 'not-allowed' : 'pointer',
    opacity: dis ? 0.5 : 1,
    flexShrink: 0,
  })
  /** Botón icono barra CCD: color por tipo de acción (alineado al estilo «dashboard» de la plataforma). */
  const _ccdBar = {
    vista: { bd: '#38bdf8', bg: '#e0f2fe', sh: '0 2px 10px rgba(14,165,233,0.28)' },
    pdf: { bd: '#a78bfa', bg: '#ede9fe', sh: '0 2px 10px rgba(124,58,237,0.22)' },
    excel: { bd: '#34d399', bg: '#d1fae5', sh: '0 2px 10px rgba(5,150,105,0.22)' },
    firma: { bd: '#fb923c', bg: '#ffedd5', sh: '0 2px 10px rgba(234,88,12,0.2)' },
  }
  const btnCcdToolbar = (dis, role) => {
    const x = _ccdBar[role] || _ccdBar.vista
    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: Math.max(32, ui.iconBtn - 2),
      minWidth: Math.max(32, ui.iconBtn - 2),
      height: Math.max(30, ui.iconBtn - 6),
      padding: 0,
      borderRadius: '9px',
      border: `2px solid ${dis ? t.border : x.bd}`,
      background: dis ? t.border + '33' : x.bg,
      boxShadow: dis ? 'none' : x.sh,
      cursor: dis ? 'not-allowed' : 'pointer',
      opacity: dis ? 0.45 : 1,
      flexShrink: 0,
      transition: 'transform 0.12s ease, box-shadow 0.12s ease',
    }
  }
  const chipFirmaEstado = (ok) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px 7px',
    borderRadius: '6px',
    fontSize: fontSize === 'pequena' ? 10 : 11,
    fontWeight: '800',
    letterSpacing: '0.02em',
    background: ok ? t.primary + '20' : t.border + '44',
    color: t.text,
    border: `1px solid ${ok ? t.primary + '50' : t.border}`,
  })
  const itemRow = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '10px', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${t.border}`, marginBottom: '8px', background: t.bg
  }
  /** Filas de ítem / acciones en Formatos Subcontratista (más compactas). */
  const itemRowFmt = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: ui.pIn,
    borderRadius: '8px',
    border: `1px solid ${t.border}`,
    marginBottom: fontSize === 'pequena' ? '6px' : '8px',
    background: t.bg,
  }
  const tarjetaFormato = {
    border: `1px solid ${t.border}`,
    borderRadius: '10px',
    overflow: 'hidden',
    background: `linear-gradient(180deg, ${t.primary}0a 0%, ${t.bgCard} 100%)`,
  }
  const tarjetaFormatoHead = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: ui.pHead,
    border: 'none',
    borderBottom: `1px solid ${t.border}`,
    background: t.primary + '0c',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
  }
  function aplicarFirmante(campo, usuarioId, codigoFormato) {
    const u = firmantesCcd.find((x) => String(x.id) === String(usuarioId))
    setCfgFirmaCcd((p) => {
      const cur = p[codigoFormato] || {
        elaboro_nombre: '',
        elaboro_cargo: '',
        elaboro_usuario_id: null,
        reviso_nombre: '',
        reviso_cargo: '',
        reviso_usuario_id: null,
        aprobo_nombre: '',
        aprobo_cargo: '',
        aprobo_usuario_id: null,
        estilo_pdf: estiloDefectoPorCodigo(codigoFormato),
      }
      if (!u) {
        if (campo === 'elaboro') {
          return { ...p, [codigoFormato]: { ...cur, elaboro_nombre: '', elaboro_cargo: '', elaboro_usuario_id: null } }
        }
        if (campo === 'elaboro2') {
          return { ...p, [codigoFormato]: { ...cur, elaboro2_nombre: '', elaboro2_cargo: '', elaboro2_usuario_id: null } }
        }
        if (campo === 'reviso2') {
          return { ...p, [codigoFormato]: { ...cur, reviso2_nombre: '', reviso2_cargo: '', reviso2_usuario_id: null } }
        }
        if (campo === 'aprobo') {
          return {
            ...p,
            [codigoFormato]: {
              ...cur,
              aprobo_nombre: '',
              aprobo_cargo: '',
              aprobo_usuario_id: null,
            },
          }
        }
        return {
          ...p,
          [codigoFormato]: {
            ...cur,
            reviso_nombre: '',
            reviso_cargo: '',
            reviso_usuario_id: null,
          },
        }
      }
      if (campo === 'elaboro') {
        return {
          ...p,
          [codigoFormato]: {
            ...cur,
            elaboro_nombre: u.nombre_completo,
            elaboro_cargo: u.cargo,
            elaboro_usuario_id: u.id,
          },
        }
      }
      if (campo === 'aprobo') {
        return {
          ...p,
          [codigoFormato]: {
            ...cur,
            aprobo_nombre: u.nombre_completo,
            aprobo_cargo: u.cargo,
            aprobo_usuario_id: u.id,
          },
        }
      }
      if (campo === 'elaboro2') {
        return {
          ...p,
          [codigoFormato]: {
            ...cur,
            elaboro2_nombre: u.nombre_completo,
            elaboro2_cargo: u.cargo,
            elaboro2_usuario_id: u.id,
          },
        }
      }
      if (campo === 'reviso2') {
        return {
          ...p,
          [codigoFormato]: {
            ...cur,
            reviso2_nombre: u.nombre_completo,
            reviso2_cargo: u.cargo,
            reviso2_usuario_id: u.id,
          },
        }
      }
      return {
        ...p,
        [codigoFormato]: {
          ...cur,
          reviso_nombre: u.nombre_completo,
          reviso_cargo: u.cargo,
          reviso_usuario_id: u.id,
        },
      }
    })
  }

  /** Plantilla PDF sin datos (misma modal de vista previa que el resto de informes). */
  async function abrirPreviewPlantillaVacia(codigoFormato, subsistema = null) {
    const authToken = getAuthToken()
    if (!authToken || !contratoId) {
      setError('Sesión no autenticada.')
      return
    }
    setVistaPrevia((prev) => {
      if (prev?.pdfUrl) {
        try {
          URL.revokeObjectURL(prev.pdfUrl)
        } catch {
          /* noop */
        }
      }
      return { fase: 'cargando', tipo: 'idu-plantilla-vacia' }
    })
    setError(null)
    try {
      const params = new URLSearchParams()
      if (subsistema) params.set('subsistema', subsistema)
      if (actaIdFoEo04) params.set('acta_id', actaIdFoEo04)
      if (supervisorFoEo04.trim()) params.set('supervisor', supervisorFoEo04.trim())
      const qs = params.toString() ? `?${params.toString()}` : ''
      const r = await fetchConFallback(
        `/informes/${contratoId}/ccd/preview-plantilla-vacia/${encodeURIComponent(codigoFormato)}${qs}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!r.ok) {
        setVistaPrevia({
          fase: 'error',
          tipo: 'idu-plantilla-vacia',
          mensaje: await leerErrorRespuesta(r),
        })
        return
      }
      const blob = await r.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setVistaPrevia({ fase: 'ok', tipo: 'idu-plantilla-vacia-pdf', pdfUrl })
    } catch (e) {
      setVistaPrevia({
        fase: 'error',
        tipo: 'idu-plantilla-vacia',
        mensaje: String(e?.message || e),
      })
    }
  }

  async function abrirPreviewFoEo04ConProgreso() {
    const authToken = getAuthToken()
    if (!authToken || !contratoId) { setError('Sesión no autenticada.'); return }

    // Limpiar job anterior y su poll
    if (foEo04JobPollRef.current) {
      clearTimeout(foEo04JobPollRef.current)
      foEo04JobPollRef.current = null
    }
    if (vistaPrevia?.pdfUrl) {
      try { URL.revokeObjectURL(vistaPrevia.pdfUrl) } catch { /* noop */ }
    }
    setVistaPrevia({ fase: 'progreso', tipo: 'idu-plantilla-vacia' })
    setFoEo04Job({ id: null, status: 'iniciando', pct: 0, msg: 'Iniciando…', currentItem: null, totalItems: null })
    setError(null)

    try {
      // 1. Iniciar job en backend
      const params = new URLSearchParams({ formato_codigo: 'FO-IDU-EO-04-V2', subsistema: subsistemaFoEo04 })
      if (actaIdFoEo04) params.set('acta_id', actaIdFoEo04)
      if (supervisorFoEo04.trim()) params.set('supervisor', supervisorFoEo04.trim())

      const rInit = await fetchConFallback(
        `/informes/${contratoId}/ccd/pdf-job/iniciar?${params.toString()}`,
        { method: 'POST', headers: { Authorization: `Bearer ${authToken}` } }
      )
      if (!rInit.ok) {
        const msg = await leerErrorRespuesta(rInit)
        setVistaPrevia({ fase: 'error', tipo: 'idu-plantilla-vacia', mensaje: msg })
        setFoEo04Job(null)
        return
      }
      const { job_id } = await rInit.json()
      setFoEo04Job((prev) => ({ ...prev, id: job_id, status: 'progresando' }))

      // 2. Polling con setTimeout recursivo (evita solapamiento de llamadas async)
      let done = false
      const poll = async () => {
        if (done) return
        try {
          const rEstado = await fetchConFallback(
            `/informes/${contratoId}/ccd/pdf-job/${job_id}/estado`,
            { headers: { Authorization: `Bearer ${authToken}` } }
          )
          if (done) return
          if (!rEstado.ok) {
            if (!done) foEo04JobPollRef.current = setTimeout(poll, 1500)
            return
          }
          const estado = await rEstado.json()
          if (done) return

          if (estado.status === 'listo') {
            done = true
            foEo04JobPollRef.current = null
            // Actualizar progreso a 100% antes de descargar
            setFoEo04Job((prev) => ({ ...prev, status: 'listo', pct: 100, currentItem: estado.total_items, totalItems: estado.total_items }))
            // Descargar PDF
            const rPdf = await fetchConFallback(
              `/informes/${contratoId}/ccd/pdf-job/${job_id}/pdf`,
              { headers: { Authorization: `Bearer ${authToken}` } }
            )
            if (!rPdf.ok) {
              setVistaPrevia({ fase: 'error', tipo: 'idu-plantilla-vacia', mensaje: await leerErrorRespuesta(rPdf) })
              setFoEo04Job(null)
              return
            }
            const blob = await rPdf.blob()
            const pdfUrl = URL.createObjectURL(blob)
            // Una sola actualización de estado → sin parpadeo
            setFoEo04Job(null)
            setVistaPrevia({ fase: 'ok', tipo: 'idu-plantilla-vacia-pdf', pdfUrl })
          } else if (estado.status === 'error') {
            done = true
            foEo04JobPollRef.current = null
            setVistaPrevia({ fase: 'error', tipo: 'idu-plantilla-vacia', mensaje: estado.error || 'Error al generar el PDF.' })
            setFoEo04Job(null)
          } else {
            // Aún en progreso — actualizar y programar siguiente poll
            setFoEo04Job((prev) => ({
              ...prev,
              status: estado.status,
              pct: estado.pct ?? prev?.pct ?? 0,
              currentItem: estado.current_item ?? null,
              totalItems: estado.total_items ?? null,
            }))
            foEo04JobPollRef.current = setTimeout(poll, 1200)
          }
        } catch {
          // Error de red temporal → reintentar
          if (!done) foEo04JobPollRef.current = setTimeout(poll, 2000)
        }
      }
      foEo04JobPollRef.current = setTimeout(poll, 800)
    } catch (e) {
      if (foEo04JobPollRef.current) { clearTimeout(foEo04JobPollRef.current); foEo04JobPollRef.current = null }
      setVistaPrevia({ fase: 'error', tipo: 'idu-plantilla-vacia', mensaje: String(e?.message || e) })
      setFoEo04Job(null)
    }
  }

  async function guardarCfgFirmaCcd(codigoFormato) {
    if (!puedeEditarCcd) return
    const authToken = getAuthToken()
    if (!authToken || !contratoId) return
    const body = cfgFirmaCcd[codigoFormato]
    if (!body) return
    setGuardandoFirmaCcd(true)
    setError(null)
    try {
      const r = await fetchConFallback(`/informes/${contratoId}/ccd/config-firma/${encodeURIComponent(codigoFormato)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const msg = await leerErrorRespuesta(r)
        setError(msg)
        return
      }
      // Verificar que el servidor haya devuelto datos (detecta fallos silenciosos)
      const saved = await r.json().catch(() => null)
      if (!saved || typeof saved !== 'object') {
        setError('No se pudo confirmar el guardado. Intenta de nuevo.')
      }
      // No sobreescribir el estado local — los datos del usuario son correctos.
      // La persistencia queda garantizada por el backend.
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setGuardandoFirmaCcd(false)
    }
  }

  const estiloDefectoPorCodigo = estiloDefectoCcd

  function setEstiloCampo(codigoFormato, campo, valor) {
    setCfgFirmaCcd((p) => {
      const cur = p[codigoFormato] || {}
      const est = { ...estiloDefectoCcd(codigoFormato), ...(cur.estilo_pdf || {}), [campo]: valor }
      return { ...p, [codigoFormato]: { ...cur, estilo_pdf: est } }
    })
  }

  function restaurarEstiloDefecto(codigoFormato) {
    setCfgFirmaCcd((p) => ({
      ...p,
      [codigoFormato]: {
        ...(p[codigoFormato] || {}),
        estilo_pdf: estiloDefectoPorCodigo(codigoFormato),
      },
    }))
  }

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '8px' }}>

      <div style={{ marginBottom: '14px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            textAlign: 'left',
          }}
        >
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontSize: f.title + 'px', fontWeight: '800', color: t.text }}>
              Informes
            </div>
            <div style={{ fontSize: f.sub + 'px', color: t.textMuted, marginTop: '2px', lineHeight: 1.45 }}>
              Vista previa del mismo PDF que genera el servidor (informe de corte y memorias por ítem).
            </div>
          </div>
          {biblioCcd.length > 0 && (
            <div
              style={{
                flex: biblioPanelAbierto ? '1 1 360px' : '0 0 auto',
                width: biblioPanelAbierto ? 'min(100%, 420px)' : 'auto',
                maxWidth: '100%',
                marginLeft: 'auto',
              }}
            >
              <div
                style={{
                  borderRadius: '12px',
                  border: '2px solid #0284c7',
                  background: 'linear-gradient(165deg, #f0f9ff 0%, #e0f2fe 38%, #7dd3fc 72%, #38bdf8 100%)',
                  boxShadow: '0 8px 28px rgba(2,132,199,0.22)',
                  overflow: 'hidden',
                  textAlign: 'left',
                }}
              >
                <button
                  type="button"
                  onClick={() => setBiblioPanelAbierto((v) => !v)}
                  aria-expanded={biblioPanelAbierto}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '10px',
                    padding: ui.pHead,
                    border: 'none',
                    background: biblioPanelAbierto ? 'rgba(255,255,255,0.35)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <span style={{ color: '#0369a1', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <IconoBiblioteca size={Math.round(ui.iconSvg + 6)} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: '800',
                        fontSize: ui.cardTitle + 'px',
                        color: '#0c4a6e',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Biblioteca CCD
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: ui.hint + 'px',
                        color: '#075985',
                        marginTop: '2px',
                        fontWeight: '500',
                      }}
                    >
                      Plantillas, firmas y estilos PDF
                    </span>
                  </span>
                  <span style={{ color: '#0369a1', fontSize: f.section + 2 + 'px', flexShrink: 0 }} aria-hidden>
                    {biblioPanelAbierto ? '▼' : '▶'}
                  </span>
                </button>
                {biblioPanelAbierto && (
                <div
                  style={{
                    borderTop: '1px solid rgba(3,105,161,0.35)',
                    padding: '10px 12px 14px',
                    maxHeight: 'min(72vh, 760px)',
                    overflowY: 'auto',
                    fontSize: ui.body + 'px',
                    color: '#0c4a6e',
                    background: 'rgba(255,255,255,0.5)',
                  }}
                >
            <div style={{ fontSize: ui.hint + 'px', color: '#075985', marginBottom: '10px', lineHeight: 1.45 }}>
              Pulsa un formato para ver u ocultar slots y opciones; el estado abierto/cerrado se recuerda en este navegador.
              {esPerfilInterventoria && (
                <span style={{ display: 'block', marginTop: '6px' }}>
                  Con tu perfil solo se listan formatos pensados para interventoría; el resto queda oculto.
                </span>
              )}
            </div>
            {biblioCcdVisible.length === 0 && esPerfilInterventoria ? (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: `1px dashed ${t.border}`,
                  background: t.bgCard,
                  color: t.textMuted,
                  fontSize: Math.max(12, f.sub) + 'px',
                }}
              >
                No hay formatos CCD habilitados para interventoría en este contrato. Los de subcontratista suelen gestionarlos contratista / operativo contratista.
              </div>
            ) : (
            biblioCcdListaPlana.map((row) => {
              if (row._tipo === 'titulo') {
                return (
                  <div
                    key={row._key}
                    style={{
                      fontWeight: '800',
                      fontSize: Math.max(12, f.sub) + 'px',
                      color: t.text,
                      marginBottom: '6px',
                      marginTop: row._key === 'tit-clara' ? '2px' : '16px',
                      paddingLeft: '2px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {row.texto}
                  </div>
                )
              }
              const fmt = row.fmt
              const abierto = !!ccdExpanded[fmt.codigo]
              const cfgF = cfgFirmaCcd[fmt.codigo] || {
                elaboro_nombre: '',
                elaboro_cargo: '',
                elaboro_usuario_id: null,
                reviso_nombre: '',
                reviso_cargo: '',
                reviso_usuario_id: null,
                aprobo_nombre: '',
                aprobo_cargo: '',
                aprobo_usuario_id: null,
                estilo_pdf: estiloDefectoPorCodigo(fmt.codigo),
              }
              const puedeEditarSlotsConfig =
                puedeEditarCcd && (fmt.slots_firma || []).some((s) => s.origen === 'configuracion')
              const puedePersonalizarEstiloPdf =
                puedeEditarCcd &&
                typeof fmt.codigo === 'string' &&
                (fmt.codigo.endsWith('-001') || fmt.codigo.endsWith('-002'))
              return (
              <div
                key={fmt.codigo}
                style={{
                  marginBottom: '10px',
                  borderRadius: '8px',
                  border: `1px solid ${t.border}`,
                  overflow: 'hidden',
                  background: t.bgCard,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCcdFormato(fmt.codigo)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    border: 'none',
                    background: t.bg,
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                    <span>
                      <span style={{ color: t.primary, fontWeight: '800' }}>{fmt.codigo}</span>
                      {fmt.titulo ? ` — ${fmt.titulo}` : ''}
                    </span>
                    <span
                      style={{
                        fontSize: Math.max(11, f.sub - 1) + 'px',
                        fontWeight: '600',
                        color: fmt.acceso_interventoria === true ? '#059669' : '#64748b',
                        whiteSpace: 'nowrap',
                      }}
                      title="Si es «No», el formato no se muestra a usuarios de interventoría en esta biblioteca."
                    >
                      · Interventoría: {fmt.acceso_interventoria === true ? 'sí' : 'no'}
                    </span>
                  </span>
                  <span style={{ color: t.textMuted, fontSize: '14px', flexShrink: 0 }} aria-hidden>
                    {abierto ? '▼' : '▶'}
                  </span>
                </button>
                {abierto && (
                <div style={{ padding: '12px', borderTop: `1px solid ${t.border}` }}>
                {fmt.codigo === 'FO-IDU-EO-04-V2' && (
                  <div style={{ marginBottom: '12px' }}>
                    <button
                      type="button"
                      onClick={() => abrirPreviewPlantillaVacia(fmt.codigo)}
                      disabled={
                        vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'idu-plantilla-vacia'
                      }
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: `1px solid ${t.border}`,
                        background: t.bgCard,
                        color: t.text,
                        fontWeight: '700',
                        fontSize: Math.max(12, f.sub) + 'px',
                        cursor:
                          vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'idu-plantilla-vacia'
                            ? 'wait'
                            : 'pointer',
                        opacity:
                          vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'idu-plantilla-vacia'
                            ? 0.75
                            : 1,
                      }}
                    >
                      {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'idu-plantilla-vacia'
                        ? 'Generando vista previa…'
                        : 'Vista previa plantilla vacía (PDF)'}
                    </button>
                    <div style={{ fontSize: '10px', color: t.textMuted, marginTop: '6px', lineHeight: 1.4 }}>
                      Misma vista previa en modal que en «Formatos Entidades Externas» (abajo).
                    </div>
                  </div>
                )}

                {/* ── 4 firmantes exclusivos de FO-IDU-EO-04-V2 ── */}
                {fmt.codigo === 'FO-IDU-EO-04-V2' && puedeEditarCcd && (() => {
                  const cfgF = cfgFirmaCcd['FO-IDU-EO-04-V2'] || {}
                  const slotStyles = {
                    border: `1px solid ${t.border}`, borderRadius: '8px',
                    padding: '10px 12px', background: t.bg,
                  }
                  const lbl = { fontSize: '11px', display: 'block', marginBottom: '4px', color: t.textMuted }
                  const renderSlot = (titulo, campo) => {
                    const nombreVal = cfgF[`${campo}_nombre`] || ''
                    const cargoVal = cfgF[`${campo}_cargo`] || ''
                    const uidVal = cfgF[`${campo}_usuario_id`] || ''
                    return (
                      <div style={slotStyles}>
                        <div style={{ fontWeight: '800', color: t.text, fontSize: Math.max(11, f.sub - 1) + 'px', marginBottom: '8px' }}>
                          {titulo}
                        </div>
                        <label style={lbl}>Usuario del catálogo del contrato</label>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                          <select
                            style={{ ...select, fontSize: '13px', flex: 1 }}
                            value={uidVal}
                            onChange={(e) => aplicarFirmante(campo, e.target.value, 'FO-IDU-EO-04-V2')}
                          >
                            <option value="">— Elegir —</option>
                            {firmantesCcd.map((u) => (
                              <option key={u.id} value={u.id}>{u.nombre_completo} ({u.cargo})</option>
                            ))}
                          </select>
                          {nombreVal && (
                            <button
                              type="button"
                              title="Quitar usuario de este slot"
                              onClick={() => aplicarFirmante(campo, '', 'FO-IDU-EO-04-V2')}
                              style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}
                            >✕</button>
                          )}
                        </div>
                        <input
                          placeholder="Nombre (editable)"
                          value={nombreVal}
                          onChange={(e) => {
                            const v = e.target.value
                            setCfgFirmaCcd((p) => ({
                              ...p,
                              'FO-IDU-EO-04-V2': { ...(p['FO-IDU-EO-04-V2'] || {}), [`${campo}_nombre`]: v },
                            }))
                          }}
                          style={{ ...select, marginBottom: '6px', fontSize: '13px' }}
                        />
                        <input
                          placeholder="Cargo"
                          value={cargoVal}
                          onChange={(e) => {
                            const v = e.target.value
                            setCfgFirmaCcd((p) => ({
                              ...p,
                              'FO-IDU-EO-04-V2': { ...(p['FO-IDU-EO-04-V2'] || {}), [`${campo}_cargo`]: v },
                            }))
                          }}
                          style={{ ...select, fontSize: '13px' }}
                        />
                      </div>
                    )
                  }
                  return (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: Math.max(11, f.sub - 1) + 'px', fontWeight: '700', color: t.text, marginBottom: '8px' }}>
                        Firmas — Elaboró (2) · Revisó (2)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {renderSlot('Elaboró 1', 'elaboro')}
                        {renderSlot('Elaboró 2', 'elaboro2')}
                        {renderSlot('Revisó 1', 'reviso')}
                        {renderSlot('Revisó 2', 'reviso2')}
                      </div>
                    </div>
                  )
                })()}

                {(fmt.slots_firma || []).length > 0 && fmt.codigo !== 'FO-IDU-EO-04-V2' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: '10px',
                      alignItems: 'start',
                    }}
                  >
                    {(fmt.slots_firma || []).map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: '8px',
                          padding: '8px 10px',
                          background: t.bg,
                        }}
                      >
                        <div style={{ fontWeight: '800', color: t.text, fontSize: Math.max(11, f.sub - 1) + 'px', marginBottom: '6px' }}>
                          {slot.label}
                        </div>
                        {slot.origen === 'configuracion' && puedeEditarSlotsConfig && (
                          <>
                            {['elaboro', 'reviso', 'aprobo'].includes(slot.id) && (() => {
                              const campo = slot.id
                              const nombreKey = `${campo}_nombre`
                              const cargoKey = `${campo}_cargo`
                              const uidKey = `${campo}_usuario_id`
                              const nombreVal = cfgF[nombreKey] || ''
                              const cargoVal = cfgF[cargoKey] || ''
                              const uidVal = cfgF[uidKey] || ''
                              return (
                                <>
                                  <label style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Usuario / cargo (catálogo del contrato)</label>
                                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                    <select
                                      style={{ ...select, fontSize: '13px', flex: 1 }}
                                      value={uidVal}
                                      onChange={(e) => aplicarFirmante(campo, e.target.value, fmt.codigo)}
                                    >
                                      <option value="">— Elegir —</option>
                                      {firmantesCcd.map((u) => (
                                        <option key={u.id} value={u.id}>
                                          {u.nombre_completo} ({u.cargo})
                                        </option>
                                      ))}
                                    </select>
                                    {nombreVal && (
                                      <button
                                        type="button"
                                        title="Quitar usuario de este slot"
                                        onClick={() => aplicarFirmante(campo, '', fmt.codigo)}
                                        style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}
                                      >✕</button>
                                    )}
                                  </div>
                                  <input
                                    placeholder="Nombre (editable)"
                                    value={nombreVal}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      setCfgFirmaCcd((p) => ({
                                        ...p,
                                        [fmt.codigo]: { ...(p[fmt.codigo] || {}), [nombreKey]: v },
                                      }))
                                    }}
                                    style={{ ...select, marginBottom: '6px', fontSize: '13px' }}
                                  />
                                  <input
                                    placeholder="Cargo"
                                    value={cargoVal}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      setCfgFirmaCcd((p) => ({
                                        ...p,
                                        [fmt.codigo]: { ...(p[fmt.codigo] || {}), [cargoKey]: v },
                                      }))
                                    }}
                                    style={{ ...select, fontSize: '13px' }}
                                  />
                                </>
                              )
                            })()}
                          </>
                        )}
                        {slot.origen === 'subcontratista' && (
                          <div style={{ fontSize: '12px', lineHeight: 1.45 }}>
                            <div style={{ color: t.textMuted, marginBottom: '4px' }}>
                              Automático según el subcontratista elegido abajo en el informe:
                            </div>
                            <div>
                              <b style={{ color: t.text }}>Empresa:</b> {subSel?.razon_social || '—'}
                            </div>
                            <div>
                              <b style={{ color: t.text }}>Representante:</b> {subSel?.nombre_contacto || '—'}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {puedePersonalizarEstiloPdf && (() => {
                  const esPrev = { ...estiloDefectoCcd(fmt.codigo), ...(cfgF.estilo_pdf || {}) }
                  const tituloPersonal =
                    fmt.codigo === 'CC-GER-001'
                      ? 'Personaliza el informe de gerencia (CC-GER-001)'
                      : fmt.codigo.endsWith('-002')
                        ? 'Personaliza tu memoria'
                        : 'Personaliza tu informe de corte'
                  const subtituloPersonal =
                    fmt.codigo === 'CC-GER-001'
                      ? 'Paleta del PDF horizontal (matriz 4 columnas): capítulos, totales con AIU, totales con IVA y el valor total del acta.'
                      : 'Aquí va la paleta de tu contrato. A la derecha ves una vista previa que cambia al instante: prueba combinaciones sin abrir y cerrar el PDF.'
                  const camposBase001 = [
                    {
                      k: 'thead_bg',
                      title: 'Títulos de columna',
                      hint: 'Fila donde aparecen los encabezados (capítulo, acta vigente, aprobados, pendientes…).',
                    },
                    {
                      k: 'row_even_bg',
                      title: 'Cuerpo · filas pares',
                      hint: 'Líneas 2, 4, 6… del listado SICOE',
                    },
                    {
                      k: 'row_odd_bg',
                      title: 'Cuerpo · filas impares',
                      hint: 'Líneas 1, 3, 5… (se alternan con las pares)',
                    },
                    {
                      k: 'capitulo_subtotal_bg',
                      title: 'Subtotal por capítulo',
                      hint: 'Fila al cerrar cada capítulo (solo en formatos con subtotal por capítulo; en informe de gerencia ayuda a contrastar bloques de dinero).',
                    },
                    {
                      k: 'subtotal_bg',
                      title: 'Acento de tabla (referencia general)',
                      hint: 'Sigue disponible; en CC-GER-001 los totales con nombre propio se configuran con las claves de abajo.',
                    },
                  ]
                  const camposGer001 = [
                    { k: 'ger_titulo_bloque_bg', title: 'Banda título de bloque', hint: 'Fila «Obra…» o «Ensayos…»' },
                    { k: 'ger_subtotal_obra_con_aiu_bg', title: 'Subtotal Obra con AIU', hint: 'Suma de costo directo del bloque obra' },
                    { k: 'ger_fila_tasa_aiu_bg', title: 'Fila tasa AIU', hint: 'Monto y % AIU pactado' },
                    { k: 'ger_cdirecto_mas_aiu_bg', title: 'Costo Directo + AIU', hint: 'Directo con AIU' },
                    { k: 'ger_filas_post_cdu_bg', title: 'Complementos y ajuste', hint: 'Componentes, adicionales y fila Ajustes' },
                    { k: 'ger_vtot_obra_ajustes_bg', title: 'VALOR TOTAL OBRA CON AIU Y AJUSTES', hint: 'Total del bloque obra' },
                    { k: 'ger_subtotal_obra_con_iva_bg', title: 'Subtotal Obra con IVA', hint: 'Suma de costo directo (ensayos) antes de IVA' },
                    { k: 'ger_fila_tasa_iva_bg', title: 'Fila tasa IVA', hint: 'Monto y % IVA' },
                    { k: 'ger_cdirecto_mas_iva_bg', title: 'Costo Directo + IVA', hint: 'Directo + IVA' },
                    { k: 'ger_vtot_obra_iva_bg', title: 'VALOR TOTAL OBRA CON IVA', hint: 'Cierre de bloque ensayos' },
                    { k: 'ger_valor_total_acta_bg', title: 'VALOR TOTAL ACTA', hint: 'Fila final: suma de totales de obra (con ajustes) y ensayos' },
                  ]
                  const campos =
                    fmt.codigo === 'CC-GER-001'
                      ? [...camposBase001, ...camposGer001]
                      : fmt.codigo.endsWith('-001')
                        ? [
                            {
                              k: 'thead_bg',
                              title: 'Títulos de columna',
                              hint: 'Fila donde aparecen CAPÍTULO, ÍTEM, DESCRIPCIÓN, cantidades…',
                            },
                            {
                              k: 'row_even_bg',
                              title: 'Cuerpo · filas pares',
                              hint: 'Líneas 2, 4, 6… del listado de ítems aprobados',
                            },
                            {
                              k: 'row_odd_bg',
                              title: 'Cuerpo · filas impares',
                              hint: 'Líneas 1, 3, 5… (se alternan con las pares)',
                            },
                            ...(fmt.codigo === 'CC-SEM-001' || fmt.codigo === 'CC-MES-001'
                              ? [
                                  {
                                    k: 'capitulo_subtotal_bg',
                                    title: 'Subtotal por capítulo',
                                    hint: 'Fila resaltada al cerrar cada capítulo (solo costo directo)',
                                  },
                                ]
                              : []),
                            {
                              k: 'subtotal_bg',
                              title: 'Fila SUB TOTAL',
                              hint: 'La banda del subtotal en dinero al pie de la tabla',
                            },
                          ]
                        : [
                          {
                            k: 'section_bar_bg',
                            title: 'Franja del bloque',
                            hint: 'Fondo de «DETALLE DE CANTIDADES…» y de los títulos de fotos',
                          },
                          {
                            k: 'section_bar_text',
                            title: 'Texto en la franja',
                            hint: 'Color de letra sobre esa barra (legible sobre el fondo)',
                          },
                          {
                            k: 'thead_bg',
                            title: 'Fila de encabezados',
                            hint: 'Donde están N°, abscisas, OBSERVACIÓN…',
                          },
                          {
                            k: 'row_even_bg',
                            title: 'Detalle · filas pares',
                            hint: 'Registros en líneas alternas del detalle',
                          },
                          {
                            k: 'row_odd_bg',
                            title: 'Detalle · filas impares',
                            hint: 'Alternan con las pares para leer más fácil',
                          },
                          {
                            k: 'subtotal_bg',
                            title: 'Banda del total del ítem',
                            hint: 'La fila de «CANTIDAD TOTAL DEL ÍTEM» bajo la tabla',
                          },
                        ]
                  return (
                  <div
                    style={{
                      marginTop: (fmt.slots_firma || []).length > 0 ? '14px' : '0',
                      paddingTop: '12px',
                      borderTop: `1px dashed ${t.border}`,
                    }}
                  >
                    <div style={{ fontWeight: '800', color: t.text, fontSize: Math.max(13, f.sub + 1) + 'px', marginBottom: '6px' }}>
                      {tituloPersonal}
                    </div>
                    <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '14px', lineHeight: 1.5, maxWidth: '720px' }}>
                      {subtituloPersonal}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '16px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                        {campos.map(({ k, title, hint }) => (
                          <label
                            key={k}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                              marginBottom: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="color"
                              value={esPrev[k] || '#ffffff'}
                              onChange={(e) => setEstiloCampo(fmt.codigo, k, e.target.value)}
                              style={{
                                width: '40px',
                                height: '28px',
                                minWidth: '40px',
                                padding: 0,
                                border: `1px solid ${t.border}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: t.text }}>{title}</span>
                              <span style={{ display: 'block', fontSize: '10px', color: t.textMuted, marginTop: '2px', lineHeight: 1.35 }}>
                                {hint}
                              </span>
                            </span>
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => restaurarEstiloDefecto(fmt.codigo)}
                          style={{
                            marginTop: '4px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${t.border}`,
                            background: t.bgCard,
                            color: t.textMuted,
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                          }}
                        >
                          Volver a los colores sugeridos
                        </button>
                      </div>
                      <div
                        style={{
                          flex: '1 1 240px',
                          maxWidth: '100%',
                          position: 'sticky',
                          top: '8px',
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: '700', color: t.textMuted, marginBottom: '8px', letterSpacing: '0.02em' }}>
                          Vista previa en vivo
                        </div>
                        <div style={{ fontSize: '9px', color: t.textMuted, marginBottom: '8px', lineHeight: 1.35 }}>
                          Aproximación del PDF; los márgenes y tipografías finales pueden variar un poco al imprimir.
                        </div>
                        {fmt.codigo === 'CC-GER-001' ? (
                          <CcdLivePreviewInformeGerencia es={esPrev} />
                        ) : fmt.codigo.endsWith('-001') ? (
                          <CcdLivePreviewCorte es={esPrev} />
                        ) : (
                          <CcdLivePreviewMemoria es={esPrev} />
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })()}
                {(puedeEditarSlotsConfig || puedePersonalizarEstiloPdf || (fmt.codigo === 'FO-IDU-EO-04-V2' && puedeEditarCcd)) && (
                  <button
                    type="button"
                    onClick={() => guardarCfgFirmaCcd(fmt.codigo)}
                    disabled={guardandoFirmaCcd}
                    style={{
                      marginTop: '10px',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: t.primary,
                      color: '#fff',
                      fontWeight: '700',
                      cursor: guardandoFirmaCcd ? 'not-allowed' : 'pointer',
                      opacity: guardandoFirmaCcd ? 0.7 : 1,
                    }}
                  >
                    {guardandoFirmaCcd ? 'Guardando…' : `Guardar biblioteca · ${fmt.codigo}`}
                  </button>
                )}
                </div>
                )}
              </div>
            );
          })
            )}
            <div style={{ fontSize: ui.hint + 'px', marginTop: '6px', color: '#075985', lineHeight: 1.4 }}>
              Las plantillas PDF están en código; la visibilidad para interventoría la define cada formato (metadato en servidor).
            </div>
                </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'8px',
                      padding:'10px 14px', color:'#dc2626', fontSize: f.sub + 'px', marginBottom:'14px' }}>
          ⚠️ {error}
        </div>
      )}

      {mostrarBloqueFormatosSub && (
      <div style={cardFormatosSub}>
        <button
          type="button"
          onClick={toggleFormatosSub}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '0',
            marginBottom: formatosSubAbierto ? '14px' : '0',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            borderBottom: formatosSubAbierto ? `1px solid ${t.border}` : 'none',
            paddingBottom: formatosSubAbierto ? '14px' : '0',
          }}
        >
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text }}>
              Formatos Subcontratista
            </div>
            <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '3px', fontWeight: '500', lineHeight: 1.35 }}>
              Corte Subcontratista · vista previa PDF (CC-SUB-001 / CC-SUB-002). Cada formato en su tarjeta; el mismo patrón servirá para nuevos formatos.
            </div>
          </span>
          <span style={{ color: t.textMuted, fontSize: f.section + 2 + 'px', flexShrink: 0 }} aria-hidden>
            {formatosSubAbierto ? '▼' : '▶'}
          </span>
        </button>

        {formatosSubAbierto && (
        <>
        <div style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginBottom: ui.gap + 'px', lineHeight: 1.45 }}>
          «Vista previa» abre el PDF en una ventana dentro de la página (mismo documento que imprimirías o guardarías).
        </div>

        <div style={{ marginBottom: ui.gap + 'px' }}>
          <label style={labelSub}>Subcontratista</label>
          <select
            style={selectSub}
            value={subId}
            onChange={onSubChange}
            disabled={cargandoSub}
          >
            <option value=''>
              {cargandoSub ? 'Cargando...' : subs.length === 0 ? 'Sin subcontratistas' : '— Selecciona —'}
            </option>
            {subs.map(s => (
              <option key={s.id} value={s.id}>{s.razon_social}</option>
            ))}
          </select>
          {subSel && (
            <div style={infoBoxSub}>
              <span><b>NIT:</b> {subSel.nit || '—'}</span>
              <span><b>Contacto:</b> {subSel.nombre_contacto || '—'}</span>
              <span><b>Tel:</b> {subSel.telefono || '—'}</span>
            </div>
          )}
        </div>

        {subId && (
          <div style={{ marginBottom: ui.gap + 'px' }}>
            <label style={labelSub}>Corte</label>
            <select
              style={selectSub}
              value={corteId}
              onChange={onCorteChange}
              disabled={cargandoCor}
            >
              <option value=''>
                {cargandoCor ? 'Cargando cortes...' : cortes.length === 0 ? 'Sin cortes registrados' : '— Selecciona el corte —'}
              </option>
              {cortes.map(c => (
                <option key={c.id} value={c.id}>
                  Corte N° {c.consecutivo} · {fmtFecha(c.fecha_inicio)} → {fmtFecha(c.fecha_fin)} · {(c.tipo_periodo || '').toUpperCase()}
                </option>
              ))}
            </select>
            {corteSel && (
              <div style={infoBoxSub}>
                <span><b>Período:</b> {fmtFecha(corteSel.fecha_inicio)} → {fmtFecha(corteSel.fecha_fin)}</span>
                <span><b>Tipo:</b> {(corteSel.tipo_periodo || '').toUpperCase()}</span>
                <span><b>Corte N°:</b> {corteSel.consecutivo}</span>
              </div>
            )}
          </div>
        )}

        {corteId && (
          <div
            style={{
              borderTop: `1px solid ${t.border}`,
              paddingTop: ui.gap + 'px',
              display: 'flex',
              flexDirection: 'column',
              gap: ui.gap + 'px',
            }}
          >
            {/* Plantilla 1: informe de corte (replicable para nuevos formatos) */}
            {subCcd001Vis && (
            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoCorte001Abierto((v) => !v)}
                aria-expanded={formatoCorte001Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Informe de Corte (CC-SUB-001)
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Resumen por ítem, subtotal y datos de contrato / subcontratista
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoCorte001Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoCorte001Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {corteId && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 8px',
                        borderRadius: '8px',
                        border: `1px solid ${t.border}`,
                        background: t.bgCard,
                      }}
                      title="CC-SUB-001: firmas aplicadas al PDF de este corte; vista previa y descargas usan la misma plantilla."
                    >
                      {firmasCcd['CC-SUB-001']?.tabla_disponible === false ? (
                        <span
                          style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                          title="Ejecuta en Supabase backend/sql/ccd_corte_firma_registro.sql para persistir firmas por corte."
                        >
                          ⚠ SQL firmas
                        </span>
                      ) : (
                        <>
                          <span
                            style={chipFirmaEstado(!!firmasCcd['CC-SUB-001']?.elaboro)}
                            title={firmasCcd['CC-SUB-001']?.elaboro ? 'Elaboró: firma registrada para este corte' : 'Elaboró: pendiente de registrar en este corte'}
                          >
                            E {firmasCcd['CC-SUB-001']?.elaboro ? '✓' : '·'}
                          </span>
                          <span
                            style={chipFirmaEstado(!!firmasCcd['CC-SUB-001']?.reviso)}
                            title={firmasCcd['CC-SUB-001']?.reviso ? 'Revisó: firma registrada para este corte' : 'Revisó: pendiente de registrar en este corte'}
                          >
                            R {firmasCcd['CC-SUB-001']?.reviso ? '✓' : '·'}
                          </span>
                          <span
                            style={{
                              ...chipFirmaEstado(true),
                              opacity: 0.75,
                              fontWeight: '700',
                              background: t.border + '33',
                              border: `1px dashed ${t.border}`,
                            }}
                            title="Aprobó: datos del subcontratista en el pie del PDF (no se registra con tu perfil)."
                          >
                            A PDF
                          </span>
                        </>
                      )}
                      <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                      <button
                        type="button"
                        style={btnCcdToolbar(vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte', 'vista')}
                        onClick={abrirVistaPreviaCorte}
                        disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte'}
                        title="Vista previa PDF (mismo documento que imprimirías)"
                        aria-label="Vista previa PDF"
                      >
                        {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte'
                          ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                          : <IconoVistaPrevia size={ui.iconSvg} />}
                      </button>
                      <button
                        type="button"
                        style={btnCcdToolbar(firmaCorteBusy, 'pdf')}
                        onClick={descargarPdfCorteConSello}
                        disabled={firmaCorteBusy}
                        title="Descargar PDF con página de sello (firma del perfil, fecha, huella SHA-256)"
                        aria-label="Descargar PDF firmado con sello"
                      >
                        {firmaCorteBusy
                          ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                          : <IconoPdfSello size={ui.iconSvg} />}
                      </button>
                      {puedeExportarCcd && (
                      <button
                        type="button"
                        style={btnCcdToolbar(!!excelBusy, 'excel')}
                        onClick={descargarExcelCorteSubcontratista}
                        disabled={!!excelBusy}
                        title="Descargar Excel (mismo contenido que el informe)"
                        aria-label="Descargar Excel"
                      >
                        {excelBusy === 'corte'
                          ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                          : <IconoDescargaExcel size={ui.iconSvg} />}
                      </button>
                      )}
                      {puedeValidarCcd && (
                      <button
                        type="button"
                        style={btnCcdToolbar(registrarFirmaBusy, 'firma')}
                        onClick={() => registrarMiFirmaCcd('CC-SUB-001')}
                        disabled={registrarFirmaBusy}
                        title="Registrar tu firma del perfil para Elaboró o Revisó (según Biblioteca CCD)"
                        aria-label="Registrar mi firma en este corte"
                      >
                        {registrarFirmaBusy
                          ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                          : <IconoFirmaRegistrar size={ui.iconSvg} />}
                      </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Plantilla 2: memorias por ítem */}
            {subCcd002Vis && (
            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoMemorias002Abierto((v) => !v)}
                aria-expanded={formatoMemorias002Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Memorias por ítem (CC-SUB-002)
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Detalle por ítem, evidencias fotográficas y firmas (una memoria por fila o todas en un solo PDF).
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoMemorias002Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoMemorias002Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px` }}>
                  {cargandoIt ? (
                    <div style={{ color: t.textMuted, fontSize: ui.body + 'px' }}>Cargando ítems...</div>
                  ) : items.length === 0 ? (
                    <div style={{ color: t.textMuted, fontSize: ui.body + 'px' }}>
                      No hay registros aprobados por el subcontratista en este corte.
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          border: `1px solid ${t.border}`,
                          background: t.bgCard,
                        }}
                        title="CC-SUB-002: mismas reglas de firma que el informe de corte; se aplican a las memorias PDF."
                      >
                        {firmasCcd['CC-SUB-002']?.tabla_disponible === false ? (
                          <span
                            style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                            title="Ejecuta en Supabase backend/sql/ccd_corte_firma_registro.sql para persistir firmas por corte."
                          >
                            ⚠ SQL firmas
                          </span>
                        ) : (
                          <>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-SUB-002']?.elaboro)}
                              title={firmasCcd['CC-SUB-002']?.elaboro ? 'Elaboró: firma registrada (memorias CC-SUB-002)' : 'Elaboró: pendiente en este corte'}
                            >
                              E {firmasCcd['CC-SUB-002']?.elaboro ? '✓' : '·'}
                            </span>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-SUB-002']?.reviso)}
                              title={firmasCcd['CC-SUB-002']?.reviso ? 'Revisó: firma registrada (memorias CC-SUB-002)' : 'Revisó: pendiente en este corte'}
                            >
                              R {firmasCcd['CC-SUB-002']?.reviso ? '✓' : '·'}
                            </span>
                            <span
                              style={{
                                ...chipFirmaEstado(true),
                                opacity: 0.75,
                                fontWeight: '700',
                                background: t.border + '33',
                                border: `1px dashed ${t.border}`,
                              }}
                              title="Aprobó: subcontratista en el pie del PDF de cada memoria."
                            >
                              A PDF
                            </span>
                          </>
                        )}
                        <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                        {puedeValidarCcd && (
                        <button
                          type="button"
                          style={btnCcdToolbar(registrarFirmaBusy, 'firma')}
                          onClick={() => registrarMiFirmaCcd('CC-SUB-002')}
                          disabled={registrarFirmaBusy}
                          title="Registrar tu firma del perfil para Elaboró o Revisó en memorias (Biblioteca CCD)"
                          aria-label="Registrar mi firma para CC-SUB-002"
                        >
                          {registrarFirmaBusy
                            ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                            : <IconoFirmaRegistrar size={ui.iconSvg} />}
                        </button>
                        )}
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setCcSub002ListadoItemsAbierto((v) => !v)}
                          aria-expanded={ccSub002ListadoItemsAbierto}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: `1px solid ${t.border}`,
                            background: t.bgCard,
                            color: t.text,
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: '800', color: t.text, fontSize: ui.itemEm + 'px' }}>
                              Todos los ítems · PDF y listado por fila
                            </div>
                            <div style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                              {items.length} ítem{items.length !== 1 ? 's' : ''} — expandir para ver el PDF único, Excel y cada código
                            </div>
                          </span>
                          <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                            {ccSub002ListadoItemsAbierto ? '▼' : '▶'}
                          </span>
                        </button>
                      </div>

                      {ccSub002ListadoItemsAbierto && (
                      <>
                      <div
                        style={{
                          ...itemRowFmt,
                          marginBottom: '6px',
                          padding: '6px 10px',
                          background: t.primary + '0d',
                          border: `1px solid ${t.primary}35`,
                        }}
                      >
                        <div
                          style={{ minWidth: 0 }}
                          title="Un PDF con todos los ítems en orden de código (NP-490…); cada ítem = detalle, fotos y firmas. Mismo orden en Excel que en el informe de corte."
                        >
                          <div style={{ fontWeight: '800', color: t.text, fontSize: ui.itemEm + 'px' }}>
                            Todos los ítems · PDF único
                          </div>
                          <div style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: t.textMuted, marginTop: '2px' }}>
                            Orden ascendente por código de ítem — pasar el cursor para más detalle
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            style={btnCcdToolbar(vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria-todos', 'vista')}
                            onClick={abrirVistaPreviaMemoriaCorteCompleto}
                            disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria-todos'}
                            title="Vista previa: todas las memorias en un solo PDF"
                            aria-label="Vista previa todas las memorias"
                          >
                            {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria-todos'
                              ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                              : <IconoVistaPrevia size={ui.iconSvg} />}
                          </button>
                          {puedeExportarCcd && (
                          <button
                            type="button"
                            style={btnCcdToolbar(!!excelBusy, 'excel')}
                            onClick={descargarExcelMemoriaCorteCompleto}
                            disabled={!!excelBusy}
                            title="Excel: todos los ítems (mismo orden)"
                            aria-label="Descargar Excel todas las memorias"
                          >
                            {excelBusy === 'todos'
                              ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                              : <IconoDescargaExcel size={ui.iconSvg} />}
                          </button>
                          )}
                        </div>
                      </div>
                      {items.map((item) => {
                        const busy = vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria' && vistaPrevia?.itemNumero === item.item_numero
                        const busyX = excelBusy === item.item_numero
                        return (
                          <div key={item.item_numero} style={{ ...itemRowFmt, padding: '6px 10px' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: '700', color: t.primary, fontSize: ui.itemEm + 'px' }}>
                                {item.item_numero}
                              </span>
                              <span style={{ color: t.text, fontSize: ui.body + 'px', marginLeft: '6px' }}>
                                {item.item_descripcion}
                              </span>
                              <span style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginLeft: '4px' }}>
                                [{item.unidad}]
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                type="button"
                                style={btnCcdToolbar(busy, 'vista')}
                                onClick={() => abrirVistaPreviaMemoria(item.item_numero)}
                                disabled={busy}
                                title={`Vista previa PDF · ${item.item_numero}`}
                                aria-label={`Vista previa ${item.item_numero}`}
                              >
                                {busy
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoVistaPrevia size={ui.iconSvg} />}
                              </button>
                              {puedeExportarCcd && (
                              <button
                                type="button"
                                style={btnCcdToolbar(!!excelBusy, 'excel')}
                                onClick={() => descargarExcelMemoriaItem(item.item_numero)}
                                disabled={!!excelBusy}
                                title={`Excel · ${item.item_numero}`}
                                aria-label={`Descargar Excel ${item.item_numero}`}
                              >
                                {busyX
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoDescargaExcel size={ui.iconSvg} />}
                              </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
      )}

      <div style={{ ...cardFormatosSub, marginTop: '14px' }}>
        <button
          type="button"
          onClick={toggleFormatosSem}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '0',
            marginBottom: formatosSemAbierto ? '14px' : '0',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            borderBottom: formatosSemAbierto ? `1px solid ${t.border}` : 'none',
            paddingBottom: formatosSemAbierto ? '14px' : '0',
          }}
        >
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text }}>
              Formatos Semanales
            </div>
            <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '3px', fontWeight: '500', lineHeight: 1.35 }}>
              Conciliación por semana (CC-SEM-001 / CC-SEM-002). Elige la semana y usa las mismas acciones que en Formatos Subcontratista.
            </div>
          </span>
          <span style={{ color: t.textMuted, fontSize: f.section + 2 + 'px', flexShrink: 0 }} aria-hidden>
            {formatosSemAbierto ? '▼' : '▶'}
          </span>
        </button>

        {formatosSemAbierto && (
        <>
        <div style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginBottom: ui.gap + 'px', lineHeight: 1.45 }}>
          Solo registros nivel 3 aprobados y bloqueados. Configura Elaboró, Revisó y Aprobó en la biblioteca CCD para cada código.
        </div>

        <div style={{ marginBottom: ui.gap + 'px' }}>
          <label style={labelSub}>Semana</label>
          <select
            style={selectSub}
            value={semanaConcId}
            onChange={(e) => setSemanaConcId(e.target.value)}
            disabled={cargandoSemanasConc}
          >
            <option value="">
              {cargandoSemanasConc ? 'Cargando semanas…' : '— Selecciona la semana —'}
            </option>
            {semanasConc.map((s) => (
              <option key={s.id} value={s.id}>
                N° {s.numero_semana} · {fmtFecha(s.fecha_inicio)} → {fmtFecha(s.fecha_fin)}
              </option>
            ))}
          </select>
        </div>

        {semanaConcId && (
          <div
            style={{
              borderTop: `1px solid ${t.border}`,
              paddingTop: ui.gap + 'px',
              display: 'flex',
              flexDirection: 'column',
              gap: ui.gap + 'px',
            }}
          >
            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoSem001Abierto((v) => !v)}
                aria-expanded={formatoSem001Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Informe corte semanal (CC-SEM-001)
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Resumen por ítem y total — conciliación interventoría–contratista por semana de aprobación
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoSem001Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoSem001Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${t.border}`,
                      background: t.bgCard,
                    }}
                    title="CC-SEM-001: firmas por semana (contexto semana en biblioteca CCD)."
                  >
                    {firmasCcd['CC-SEM-001']?.tabla_disponible === false ? (
                      <span
                        style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                        title="Ejecuta en Supabase el SQL de ccd_firma_registro por contexto."
                      >
                        ⚠ SQL firmas
                      </span>
                    ) : (
                      <>
                        <span
                          style={chipFirmaEstado(!!firmasCcd['CC-SEM-001']?.elaboro)}
                          title={firmasCcd['CC-SEM-001']?.elaboro ? 'Elaboró: firma registrada para esta semana' : 'Elaboró: pendiente'}
                        >
                          E {firmasCcd['CC-SEM-001']?.elaboro ? '✓' : '·'}
                        </span>
                        <span
                          style={chipFirmaEstado(!!firmasCcd['CC-SEM-001']?.reviso)}
                          title={firmasCcd['CC-SEM-001']?.reviso ? 'Revisó: firma registrada para esta semana' : 'Revisó: pendiente'}
                        >
                          R {firmasCcd['CC-SEM-001']?.reviso ? '✓' : '·'}
                        </span>
                        <span
                          style={chipFirmaEstado(!!firmasCcd['CC-SEM-001']?.aprobo)}
                          title={firmasCcd['CC-SEM-001']?.aprobo ? 'Aprobó: firma registrada' : 'Aprobó: pendiente'}
                        >
                          A {firmasCcd['CC-SEM-001']?.aprobo ? '✓' : '·'}
                        </span>
                      </>
                    )}
                    <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                    <button
                      type="button"
                      style={btnCcdToolbar(vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-sem', 'vista')}
                      onClick={abrirVistaPreviaCorteSemanal}
                      disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-sem'}
                      title="Vista previa PDF"
                      aria-label="Vista previa PDF CC-SEM-001"
                    >
                      {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-sem'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoVistaPrevia size={ui.iconSvg} />}
                    </button>
                    <button
                      type="button"
                      style={btnCcdToolbar(concPdfBusy, 'pdf')}
                      onClick={() =>
                        descargarPdfConc(
                          rutaPdfConcConSello(
                            `/informes/${contratoId}/pdf/cc-sem-001/semana/${encodeURIComponent(semanaConcId)}`
                          ),
                          'CC-SEM-001.pdf'
                        )
                      }
                      disabled={concPdfBusy}
                      title="Descargar PDF con página de sello (firma del perfil, fecha, huella SHA-256)"
                      aria-label="Descargar PDF CC-SEM-001 con sello"
                    >
                      {concPdfBusy
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoPdfSello size={ui.iconSvg} />}
                    </button>
                    {puedeExportarCcd && (
                    <button
                      type="button"
                      style={btnCcdToolbar(!!excelBusy, 'excel')}
                      onClick={descargarExcelCcSem001}
                      disabled={!!excelBusy}
                      title="Descargar Excel (mismo contenido que el informe semanal)"
                      aria-label="Descargar Excel CC-SEM-001"
                    >
                      {excelBusy === 'sem001'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoDescargaExcel size={ui.iconSvg} />}
                    </button>
                    )}
                    {puedeValidarCcd && (
                    <button
                      type="button"
                      style={btnCcdToolbar(firmaRegistroBusy === 'CC-SEM-001', 'firma')}
                      onClick={() => registrarFirmaConc('CC-SEM-001', 'semana', semanaConcId)}
                      disabled={firmaRegistroBusy === 'CC-SEM-001'}
                      title="Registrar tu firma (Elaboró, Revisó o Aprobó según biblioteca CCD)"
                      aria-label="Registrar mi firma CC-SEM-001"
                    >
                      {firmaRegistroBusy === 'CC-SEM-001'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoFirmaRegistrar size={ui.iconSvg} />}
                    </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoSem002Abierto((v) => !v)}
                aria-expanded={formatoSem002Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Memorias corte semanal (CC-SEM-002)
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Detalle por ítem y anexo fotográfico — una memoria por fila o todas en un solo PDF
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoSem002Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoSem002Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px` }}>
                  {cargandoItemsSemanal ? (
                    <div style={{ color: t.textMuted, fontSize: ui.body + 'px' }}>Cargando ítems…</div>
                  ) : itemsSemanal.length === 0 ? (
                    <div style={{ color: t.textMuted, fontSize: ui.body + 'px' }}>
                      No hay registros de conciliación para esta semana.
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          border: `1px solid ${t.border}`,
                          background: t.bgCard,
                        }}
                        title="CC-SEM-002: firmas aplicadas al PDF de memorias de esta semana."
                      >
                        {firmasCcd['CC-SEM-002']?.tabla_disponible === false ? (
                          <span
                            style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                            title="Ejecuta en Supabase el SQL de ccd_firma_registro por contexto."
                          >
                            ⚠ SQL firmas
                          </span>
                        ) : (
                          <>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-SEM-002']?.elaboro)}
                              title={firmasCcd['CC-SEM-002']?.elaboro ? 'Elaboró: firma registrada' : 'Elaboró: pendiente'}
                            >
                              E {firmasCcd['CC-SEM-002']?.elaboro ? '✓' : '·'}
                            </span>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-SEM-002']?.reviso)}
                              title={firmasCcd['CC-SEM-002']?.reviso ? 'Revisó: firma registrada' : 'Revisó: pendiente'}
                            >
                              R {firmasCcd['CC-SEM-002']?.reviso ? '✓' : '·'}
                            </span>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-SEM-002']?.aprobo)}
                              title={firmasCcd['CC-SEM-002']?.aprobo ? 'Aprobó: firma registrada' : 'Aprobó: pendiente'}
                            >
                              A {firmasCcd['CC-SEM-002']?.aprobo ? '✓' : '·'}
                            </span>
                          </>
                        )}
                        <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                        {puedeValidarCcd && (
                        <button
                          type="button"
                          style={btnCcdToolbar(firmaRegistroBusy === 'CC-SEM-002', 'firma')}
                          onClick={() => registrarFirmaConc('CC-SEM-002', 'semana', semanaConcId)}
                          disabled={firmaRegistroBusy === 'CC-SEM-002'}
                          title="Registrar tu firma para memorias semanales"
                          aria-label="Registrar mi firma CC-SEM-002"
                        >
                          {firmaRegistroBusy === 'CC-SEM-002'
                            ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                            : <IconoFirmaRegistrar size={ui.iconSvg} />}
                        </button>
                        )}
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setCcSem002ListadoItemsAbierto((v) => !v)}
                          aria-expanded={ccSem002ListadoItemsAbierto}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: `1px solid ${t.border}`,
                            background: t.bgCard,
                            color: t.text,
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: '800', color: t.text, fontSize: ui.itemEm + 'px' }}>
                              Todos los ítems · PDF y listado por fila
                            </div>
                            <div style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                              {itemsSemanal.length} ítem{itemsSemanal.length !== 1 ? 's' : ''} — expandir para ver el PDF único y cada código
                            </div>
                          </span>
                          <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                            {ccSem002ListadoItemsAbierto ? '▼' : '▶'}
                          </span>
                        </button>
                      </div>

                      {ccSem002ListadoItemsAbierto && (
                      <>
                      <div
                        style={{
                          ...itemRowFmt,
                          marginBottom: '6px',
                          padding: '6px 10px',
                          background: t.primary + '0d',
                          border: `1px solid ${t.primary}35`,
                        }}
                      >
                        <div style={{ minWidth: 0 }} title="Un PDF con todos los ítems en orden de código.">
                          <div style={{ fontWeight: '800', color: t.text, fontSize: ui.itemEm + 'px' }}>
                            Todos los ítems · PDF único
                          </div>
                          <div style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: t.textMuted, marginTop: '2px' }}>
                            Orden ascendente por código de ítem
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            style={btnCcdToolbar(vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria-sem-todos', 'vista')}
                            onClick={abrirVistaPreviaMemoriaSemanalCompleto}
                            disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria-sem-todos'}
                            title="Vista previa: todas las memorias en un solo PDF"
                            aria-label="Vista previa todas las memorias semanales"
                          >
                            {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'memoria-sem-todos'
                              ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                              : <IconoVistaPrevia size={ui.iconSvg} />}
                          </button>
                          {puedeExportarCcd && (
                          <button
                            type="button"
                            style={btnCcdToolbar(!!excelBusy, 'excel')}
                            onClick={descargarExcelCcSem002Completo}
                            disabled={!!excelBusy}
                            title="Descargar Excel: todas las memorias (una hoja por ítem, mismo orden que el PDF)"
                            aria-label="Descargar Excel todas las memorias semanales"
                          >
                            {excelBusy === 'sem2-all'
                              ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                              : <IconoDescargaExcel size={ui.iconSvg} />}
                          </button>
                          )}
                          <button
                            type="button"
                            style={btnCcdToolbar(concPdfBusy, 'pdf')}
                            onClick={() =>
                              descargarPdfConc(
                                rutaPdfConcConSello(
                                  `/informes/${contratoId}/pdf/cc-sem-002/semana/${encodeURIComponent(semanaConcId)}/completo`
                                ),
                                'CC-SEM-002-todos.pdf'
                              )
                            }
                            disabled={concPdfBusy}
                            title="Descargar PDF con todos los ítems y página de sello (firma del perfil, huella SHA-256)"
                            aria-label="Descargar PDF todas las memorias semanales con sello"
                          >
                            {concPdfBusy
                              ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                              : <IconoPdfSello size={ui.iconSvg} />}
                          </button>
                        </div>
                      </div>

                      {itemsSemanal.map((item) => {
                        const busy =
                          vistaPrevia?.fase === 'cargando' &&
                          vistaPrevia?.tipo === 'memoria-sem' &&
                          vistaPrevia?.itemNumero === item.item_numero
                        const busyX = excelBusy === `s2:${item.item_numero}`
                        return (
                          <div key={item.item_numero} style={{ ...itemRowFmt, padding: '6px 10px' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: '700', color: t.primary, fontSize: ui.itemEm + 'px' }}>
                                {item.item_numero}
                              </span>
                              <span style={{ color: t.text, fontSize: ui.body + 'px', marginLeft: '6px' }}>
                                {item.item_descripcion}
                              </span>
                              <span style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginLeft: '4px' }}>
                                [{item.unidad}]
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                type="button"
                                style={btnCcdToolbar(busy, 'vista')}
                                onClick={() => abrirVistaPreviaMemoriaSemanal(item.item_numero)}
                                disabled={busy}
                                title={`Vista previa PDF · ${item.item_numero}`}
                                aria-label={`Vista previa ${item.item_numero}`}
                              >
                                {busy
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoVistaPrevia size={ui.iconSvg} />}
                              </button>
                              {puedeExportarCcd && (
                              <button
                                type="button"
                                style={btnCcdToolbar(!!excelBusy, 'excel')}
                                onClick={() => descargarExcelCcSem002Item(item.item_numero)}
                                disabled={!!excelBusy}
                                title={`Descargar Excel · ${item.item_numero}`}
                                aria-label={`Descargar Excel ${item.item_numero}`}
                              >
                                {busyX
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoDescargaExcel size={ui.iconSvg} />}
                              </button>
                              )}
                              <button
                                type="button"
                                style={btnCcdToolbar(concPdfBusy, 'pdf')}
                                onClick={() =>
                                  descargarPdfConc(
                                    rutaPdfConcConSello(
                                      `/informes/${contratoId}/pdf/cc-sem-002/semana/${encodeURIComponent(semanaConcId)}?item_numero=${encodeURIComponent(item.item_numero)}`
                                    ),
                                    `CC-SEM-002-${item.item_numero}.pdf`
                                  )
                                }
                                disabled={concPdfBusy}
                                title={`Descargar PDF con página de sello · ${item.item_numero}`}
                                aria-label={`Descargar PDF ${item.item_numero} con sello`}
                              >
                                {concPdfBusy
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoPdfSello size={ui.iconSvg} />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <div style={{ ...cardFormatosSub, marginTop: '14px' }}>
        <button
          type="button"
          onClick={toggleFormatosInformeGer}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '0',
            marginBottom: formatosInformeGerAbierto ? '14px' : '0',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            borderBottom: formatosInformeGerAbierto ? `1px solid ${t.border}` : 'none',
            paddingBottom: formatosInformeGerAbierto ? '14px' : '0',
          }}
        >
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text }}>
              Informe de gerencia
            </div>
            <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '3px', fontWeight: '500', lineHeight: 1.35 }}>
              <strong>CC-GER-001</strong> — matriz SICOE (4 columnas), acta de cobro vigente, totales de obra (AIU) y de ensayos
              (IVA), y valor total del acta. Abre el bloque para detalle y acciones.
            </div>
          </span>
          <span style={{ color: t.textMuted, fontSize: f.section + 2 + 'px', flexShrink: 0 }} aria-hidden>
            {formatosInformeGerAbierto ? '▼' : '▶'}
          </span>
        </button>
        {formatosInformeGerAbierto && (
        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: ui.gap + 4 + 'px',
            background: t.bgCard,
            boxShadow: t.shadow || '0 1px 4px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text, marginBottom: '6px' }}>CC-GER-001</div>
          <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginBottom: ui.gap + 'px', lineHeight: 1.45, fontWeight: '500' }}>
            Puedes abrir <strong>vista previa</strong> o descargar el <strong>PDF con sello</strong>, y registrar <strong>Elaboró / Revisó / Aprobó</strong> sobre el acta
            RPO asociada. Incluye totales por sección, tasas de contrato (AIU, IVA) y el monto de cierre (valor total acta) en
            <strong>columna 1</strong> (con la misma estructura en aprobados y pendientes en las otras columnas). «CCD» es el sello
            de <strong>ClaraCore Documentación</strong> (código de documento; la biblioteca define estilo y firmas por código).
          </div>
          {gerAutoActaId && (
            <div style={{ ...infoBoxSub, marginBottom: ui.gap + 'px' }}>
              <span>
                <b>Contexto de firma (acta):</b>{' '}
                <span style={{ color: t.text, fontWeight: 600 }}>{_etiquetaActaCobro(gerAutoActaId, actasConc)}</span>
              </span>
            </div>
          )}
          {gerMatDato && (
            <div
              style={{
                fontSize: ui.hint + 'px',
                color: t.textMuted,
                lineHeight: 1.4,
                marginBottom: ui.gap + 4 + 'px',
                fontWeight: 500,
              }}
            >
              <span style={{ color: t.text }}>Tasas contrato:</span> AIU{' '}
              <strong style={{ color: t.text }}>{_fmtPctAiuIva(gerMatDato.aiu_pactado)}</strong> · IVA{' '}
              <strong style={{ color: t.text }}>{_fmtPctAiuIva(gerMatDato.iva_pactado)}</strong> · totales
              (con AIU/IVA según criterio) col.1:{' '}
              <strong style={{ color: t.text }}>{_fmtCopEs(gerMatDato.totales?.c1)}</strong>
            </div>
          )}
          {gerAutoActaId && (
            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoGer001Abierto((v) => !v)}
                aria-expanded={formatoGer001Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>CC-GER-001 — PDF y firmas</div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Vista previa, descarga con sello, registro de firma
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoGer001Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoGer001Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${t.border}`,
                      background: t.bg,
                    }}
                    title="Firmas por acta RPO (mismo acta generador del informe de gerencia v2)"
                  >
                    {firmasCcd['CC-GER-001']?.tabla_disponible === false ? (
                      <span
                        style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                        title="SQL de firmas: backend/sql/ccd_firma_registro_contexto.sql"
                      >
                        ⚠ SQL firmas
                      </span>
                    ) : (
                      <>
                        <span style={chipFirmaEstado(!!firmasCcd['CC-GER-001']?.elaboro)} title="Elaboró">
                          E {firmasCcd['CC-GER-001']?.elaboro ? '✓' : '·'}
                        </span>
                        <span style={chipFirmaEstado(!!firmasCcd['CC-GER-001']?.reviso)} title="Revisó">
                          R {firmasCcd['CC-GER-001']?.reviso ? '✓' : '·'}
                        </span>
                        <span style={chipFirmaEstado(!!firmasCcd['CC-GER-001']?.aprobo)} title="Aprobó">
                          A {firmasCcd['CC-GER-001']?.aprobo ? '✓' : '·'}
                        </span>
                      </>
                    )}
                    <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                    <button
                      type="button"
                      style={btnCcdToolbar(
                        vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-ger',
                        'vista'
                      )}
                      onClick={abrirVistaPreviaInformeGerencia}
                      disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-ger'}
                      title="Vista previa PDF (horizontal, 4 columnas)"
                      aria-label="Vista previa CC-GER-001"
                    >
                      {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-ger'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoVistaPrevia size={ui.iconSvg} />}
                    </button>
                    <button
                      type="button"
                      style={btnCcdToolbar(concPdfBusy, 'pdf')}
                      onClick={() => descargarPdfConc(rutaInformeGerenciaPdf(true), 'CC-GER-001.pdf')}
                      disabled={concPdfBusy}
                      title="Descargar con página de sello (huella, fecha)"
                      aria-label="Descargar CC-GER-001 con sello"
                    >
                      {concPdfBusy
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoPdfSello size={ui.iconSvg} />}
                    </button>
                    {puedeValidarCcd && (
                    <button
                      type="button"
                      style={btnCcdToolbar(firmaRegistroBusy === 'CC-GER-001', 'firma')}
                      onClick={() => registrarFirmaConc('CC-GER-001', 'acta_rpo', gerAutoActaId)}
                      disabled={firmaRegistroBusy === 'CC-GER-001'}
                      title="Registrar mi firma según slot en biblioteca CCD"
                      aria-label="Registrar firma CC-GER-001"
                    >
                      {firmaRegistroBusy === 'CC-GER-001'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoFirmaRegistrar size={ui.iconSvg} />}
                    </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      <div style={{ ...cardFormatosSub, marginTop: '14px' }}>
        <button
          type="button"
          onClick={toggleFormatosMes}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '0',
            marginBottom: formatosMesAbierto ? '14px' : '0',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            borderBottom: formatosMesAbierto ? `1px solid ${t.border}` : 'none',
            paddingBottom: formatosMesAbierto ? '14px' : '0',
          }}
        >
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text }}>
              Preacta mensual (conciliación SICOE)
            </div>
            <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '3px', fontWeight: '500', lineHeight: 1.35 }}>
              <strong>CC-MES-001 / 002</strong> — corte o detalle de cantidades aprobadas <strong>por un acta RPO</strong> que tú
              eliges, con <strong>totales y cascada N1·N2·N3</strong> como en el módulo Actas (cierre real de aprobado, no solo
              registro CCD de firma). Plantillas, firmas y colores CCD se configuran en la biblioteca del contrato.
            </div>
          </span>
          <span style={{ color: t.textMuted, fontSize: f.section + 2 + 'px', flexShrink: 0 }} aria-hidden>
            {formatosMesAbierto ? '▼' : '▶'}
          </span>
        </button>

        {formatosMesAbierto && (
        <>
        <div style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginBottom: ui.gap + 'px', lineHeight: 1.45 }}>
          Misma lógica de costo directo que la lista de actas (cascada N1·N2·N3). Configura Elaboró, Revisó y Aprobó en la biblioteca CCD para CC-MES-001 y CC-MES-002.
        </div>

        <div
          style={{
            fontSize: f.base + 'px',
            fontWeight: '800',
            color: t.text,
            marginBottom: '8px',
            marginTop: '2px',
            letterSpacing: 0.2,
          }}
        >
          Formato: CC-MES-001 (tabla) y CC-MES-002 (memorias)
        </div>
        <div style={{ marginBottom: ui.gap + 'px' }}>
          <label style={labelSub}>Acta RPO (para preacta mensual)</label>
          <select
            style={selectSub}
            value={actaConcId}
            onChange={(e) => setActaConcId(e.target.value)}
          >
            <option value="">
              {actasConc.length === 0 ? 'Sin actas RPO en este contrato' : '— Selecciona el acta —'}
            </option>
            {actasConc.map((a) => (
              <option key={a.id} value={a.id}>
                RPO {a.numero_rpo ?? '—'} · cons. {a.consecutivo ?? '—'}
              </option>
            ))}
          </select>
          {actaSel && (
            <div style={infoBoxSub}>
              <span><b>RPO:</b> {actaSel.numero_rpo ?? '—'}</span>
              <span><b>Cons.:</b> {actaSel.consecutivo ?? '—'}</span>
            </div>
          )}
        </div>

        {actaConcId && (
          <div
            style={{
              borderTop: `1px solid ${t.border}`,
              paddingTop: ui.gap + 'px',
              display: 'flex',
              flexDirection: 'column',
              gap: ui.gap + 'px',
            }}
          >
            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoMes001Abierto((v) => !v)}
                aria-expanded={formatoMes001Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Informe ejecución mensual (CC-MES-001)
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Resumen por ítem y total — conciliación interventoría–contratista por acta RPO
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoMes001Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoMes001Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${t.border}`,
                      background: t.bgCard,
                    }}
                    title="CC-MES-001: firmas por acta RPO (contexto acta en biblioteca CCD)."
                  >
                    {firmasCcd['CC-MES-001']?.tabla_disponible === false ? (
                      <span
                        style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                        title="Ejecuta en Supabase backend/sql/ccd_firma_registro_contexto.sql (tabla ccd_firma_registro)."
                      >
                        ⚠ SQL firmas
                      </span>
                    ) : (
                      <>
                        <span
                          style={chipFirmaEstado(!!firmasCcd['CC-MES-001']?.elaboro)}
                          title={firmasCcd['CC-MES-001']?.elaboro ? 'Elaboró: firma registrada para este acta' : 'Elaboró: pendiente'}
                        >
                          E {firmasCcd['CC-MES-001']?.elaboro ? '✓' : '·'}
                        </span>
                        <span
                          style={chipFirmaEstado(!!firmasCcd['CC-MES-001']?.reviso)}
                          title={firmasCcd['CC-MES-001']?.reviso ? 'Revisó: firma registrada para este acta' : 'Revisó: pendiente'}
                        >
                          R {firmasCcd['CC-MES-001']?.reviso ? '✓' : '·'}
                        </span>
                        <span
                          style={chipFirmaEstado(!!firmasCcd['CC-MES-001']?.aprobo)}
                          title={firmasCcd['CC-MES-001']?.aprobo ? 'Aprobó: firma registrada' : 'Aprobó: pendiente'}
                        >
                          A {firmasCcd['CC-MES-001']?.aprobo ? '✓' : '·'}
                        </span>
                      </>
                    )}
                    <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                    <button
                      type="button"
                      style={btnCcdToolbar(vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-mes', 'vista')}
                      onClick={abrirVistaPreviaCorteMensual}
                      disabled={vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-mes'}
                      title="Vista previa PDF"
                      aria-label="Vista previa PDF CC-MES-001"
                    >
                      {vistaPrevia?.fase === 'cargando' && vistaPrevia?.tipo === 'corte-mes'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoVistaPrevia size={ui.iconSvg} />}
                    </button>
                    <button
                      type="button"
                      style={btnCcdToolbar(concPdfBusy, 'pdf')}
                      onClick={() =>
                        descargarPdfConc(
                          rutaPdfConcConSello(
                            `/informes/${contratoId}/pdf/cc-mes-001/acta/${encodeURIComponent(actaConcId)}`
                          ),
                          'CC-MES-001.pdf'
                        )
                      }
                      disabled={concPdfBusy}
                      title="Descargar PDF con página de sello (firma del perfil, fecha, huella SHA-256)"
                      aria-label="Descargar PDF CC-MES-001 con sello"
                    >
                      {concPdfBusy
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoPdfSello size={ui.iconSvg} />}
                    </button>
                    {puedeExportarCcd && (
                    <button
                      type="button"
                      style={btnCcdToolbar(true, 'excel')}
                      disabled
                      title="Exportación Excel aún no disponible para el informe mensual"
                      aria-label="Excel no disponible"
                    >
                      <IconoDescargaExcel size={ui.iconSvg} />
                    </button>
                    )}
                    {puedeValidarCcd && (
                    <button
                      type="button"
                      style={btnCcdToolbar(firmaRegistroBusy === 'CC-MES-001', 'firma')}
                      onClick={() => registrarFirmaConc('CC-MES-001', 'acta_rpo', actaConcId)}
                      disabled={firmaRegistroBusy === 'CC-MES-001'}
                      title="Registrar tu firma (Elaboró, Revisó o Aprobó según biblioteca CCD)"
                      aria-label="Registrar mi firma CC-MES-001"
                    >
                      {firmaRegistroBusy === 'CC-MES-001'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoFirmaRegistrar size={ui.iconSvg} />}
                    </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={tarjetaFormato}>
              <button
                type="button"
                style={tarjetaFormatoHead}
                onClick={() => setFormatoMes002Abierto((v) => !v)}
                aria-expanded={formatoMes002Abierto}
              >
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Memorias mensuales (CC-MES-002)
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                    Detalle por ítem y anexo fotográfico — una memoria por fila
                  </div>
                </span>
                <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                  {formatoMes002Abierto ? '▼' : '▶'}
                </span>
              </button>
              {formatoMes002Abierto && (
                <div style={{ padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px` }}>
                  {cargandoItemsMensual ? (
                    <div style={{ color: t.textMuted, fontSize: ui.body + 'px' }}>Cargando ítems…</div>
                  ) : itemsMensual.length === 0 ? (
                    <div style={{ color: t.textMuted, fontSize: ui.body + 'px' }}>
                      No hay registros de conciliación para este acta.
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px',
                          marginBottom: '8px',
                          borderRadius: '8px',
                          border: `1px solid ${t.border}`,
                          background: t.bgCard,
                        }}
                        title="CC-MES-002: firmas aplicadas al PDF de memorias de este acta."
                      >
                        {firmasCcd['CC-MES-002']?.tabla_disponible === false ? (
                          <span
                            style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: '#b45309', fontWeight: '600' }}
                            title="Ejecuta en Supabase backend/sql/ccd_firma_registro_contexto.sql (tabla ccd_firma_registro)."
                          >
                            ⚠ SQL firmas
                          </span>
                        ) : (
                          <>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-MES-002']?.elaboro)}
                              title={firmasCcd['CC-MES-002']?.elaboro ? 'Elaboró: firma registrada' : 'Elaboró: pendiente'}
                            >
                              E {firmasCcd['CC-MES-002']?.elaboro ? '✓' : '·'}
                            </span>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-MES-002']?.reviso)}
                              title={firmasCcd['CC-MES-002']?.reviso ? 'Revisó: firma registrada' : 'Revisó: pendiente'}
                            >
                              R {firmasCcd['CC-MES-002']?.reviso ? '✓' : '·'}
                            </span>
                            <span
                              style={chipFirmaEstado(!!firmasCcd['CC-MES-002']?.aprobo)}
                              title={firmasCcd['CC-MES-002']?.aprobo ? 'Aprobó: firma registrada' : 'Aprobó: pendiente'}
                            >
                              A {firmasCcd['CC-MES-002']?.aprobo ? '✓' : '·'}
                            </span>
                          </>
                        )}
                        <span style={{ flex: 1, minWidth: 4 }} aria-hidden />
                        {puedeValidarCcd && (
                        <button
                          type="button"
                          style={btnCcdToolbar(firmaRegistroBusy === 'CC-MES-002', 'firma')}
                          onClick={() => registrarFirmaConc('CC-MES-002', 'acta_rpo', actaConcId)}
                          disabled={firmaRegistroBusy === 'CC-MES-002'}
                          title="Registrar tu firma para memorias mensuales de este acta"
                          aria-label="Registrar mi firma CC-MES-002"
                        >
                          {firmaRegistroBusy === 'CC-MES-002'
                            ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                            : <IconoFirmaRegistrar size={ui.iconSvg} />}
                        </button>
                        )}
                      </div>

                      <div style={{ marginBottom: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setCcMes002ListadoItemsAbierto((v) => !v)}
                          aria-expanded={ccMes002ListadoItemsAbierto}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: `1px solid ${t.border}`,
                            background: t.bgCard,
                            color: t.text,
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: '800', color: t.text, fontSize: ui.itemEm + 'px' }}>
                              Listado por ítem
                            </div>
                            <div style={{ fontSize: Math.max(10, ui.hint - 1) + 'px', color: t.textMuted, marginTop: '2px', fontWeight: '500' }}>
                              {itemsMensual.length} ítem{itemsMensual.length !== 1 ? 's' : ''} — expandir para vista previa y PDF por código
                            </div>
                          </span>
                          <span style={{ color: t.textMuted, fontSize: f.section + 1 + 'px', flexShrink: 0 }} aria-hidden>
                            {ccMes002ListadoItemsAbierto ? '▼' : '▶'}
                          </span>
                        </button>
                      </div>

                      {ccMes002ListadoItemsAbierto &&
                      itemsMensual.map((item) => {
                        const busy =
                          vistaPrevia?.fase === 'cargando' &&
                          vistaPrevia?.tipo === 'memoria-mes' &&
                          vistaPrevia?.itemNumero === item.item_numero
                        return (
                          <div key={item.item_numero} style={{ ...itemRowFmt, padding: '6px 10px' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: '700', color: t.primary, fontSize: ui.itemEm + 'px' }}>
                                {item.item_numero}
                              </span>
                              <span style={{ color: t.text, fontSize: ui.body + 'px', marginLeft: '6px' }}>
                                {item.item_descripcion}
                              </span>
                              <span style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginLeft: '4px' }}>
                                [{item.unidad}]
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                type="button"
                                style={btnCcdToolbar(busy, 'vista')}
                                onClick={() => abrirVistaPreviaMemoriaMensual(item.item_numero)}
                                disabled={busy}
                                title={`Vista previa PDF · ${item.item_numero}`}
                                aria-label={`Vista previa ${item.item_numero}`}
                              >
                                {busy
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoVistaPrevia size={ui.iconSvg} />}
                              </button>
                              {puedeExportarCcd && (
                              <button
                                type="button"
                                style={btnCcdToolbar(true, 'excel')}
                                disabled
                                title="Excel no disponible aún para memorias mensuales"
                                aria-label="Excel no disponible"
                              >
                                <IconoDescargaExcel size={ui.iconSvg} />
                              </button>
                              )}
                              <button
                                type="button"
                                style={btnCcdToolbar(concPdfBusy, 'pdf')}
                                onClick={() =>
                                  descargarPdfConc(
                                    rutaPdfConcConSello(
                                      `/informes/${contratoId}/pdf/cc-mes-002/acta/${encodeURIComponent(actaConcId)}?item_numero=${encodeURIComponent(item.item_numero)}`
                                    ),
                                    `CC-MES-002-${item.item_numero}.pdf`
                                  )
                                }
                                disabled={concPdfBusy}
                                title={`Descargar PDF con página de sello · ${item.item_numero}`}
                                aria-label={`Descargar PDF ${item.item_numero} con sello`}
                              >
                                {concPdfBusy
                                  ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                                  : <IconoPdfSello size={ui.iconSvg} />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <div style={{ ...cardFormatosSub, marginTop: '14px' }}>
        <button
          type="button"
          onClick={() => setFormatosEntExtAbierto((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '0',
            marginBottom: formatosEntExtAbierto ? '14px' : '0',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            borderBottom: formatosEntExtAbierto ? `1px solid ${t.border}` : 'none',
            paddingBottom: formatosEntExtAbierto ? '14px' : '0',
          }}
        >
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: f.base + 'px', fontWeight: '800', color: t.text }}>
              Formatos Entidades Externas
            </div>
            <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '3px', fontWeight: '500', lineHeight: 1.35 }}>
              Plantillas exigidas por la entidad contratante (p. ej. IDU). Vista previa sin datos de obra.
            </div>
          </span>
          <span style={{ color: t.textMuted, fontSize: f.section + 2 + 'px', flexShrink: 0 }} aria-hidden>
            {formatosEntExtAbierto ? '▼' : '▶'}
          </span>
        </button>

        {formatosEntExtAbierto && (
          <>
            <div style={{ color: t.textMuted, fontSize: ui.hint + 'px', marginBottom: ui.gap + 'px', lineHeight: 1.45 }}>
              Configuración de firmas y colores (si aplica) sigue en la biblioteca CCD arriba; aquí solo la vista previa del diseño del formulario.
            </div>
            <div style={tarjetaFormato}>
              <div
                style={{
                  padding: `${Math.max(6, ui.pIn - 6)}px ${ui.pIn}px ${ui.pIn}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '800', color: t.text, fontSize: ui.cardTitle + 'px' }}>
                    Memorias IDU FO-EO-04 V2.0
                  </div>
                  <div style={{ fontSize: ui.hint + 'px', color: t.textMuted, marginTop: '4px', fontWeight: '500', lineHeight: 1.45 }}>
                    Código <span style={{ color: t.primary, fontWeight: '800' }}>FO-IDU-EO-04-V2</span> · Memoria de cálculo de cantidades de obra (Instituto de Desarrollo Urbano).
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: `1px solid ${t.border}`,
                    background: t.bgCard,
                  }}
                >
                  {/* Columna izquierda: Supervisor + Subdirección */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 200px', minWidth: '170px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: (ui.hint - 1) + 'px', color: t.textMuted, fontWeight: '600' }}>
                        Supervisor(a) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={supervisorFoEo04}
                        onChange={e => {
                          setSupervisorFoEo04(e.target.value)
                          localStorage.setItem(`supervisor_fo_eo_04_${contratoId}`, e.target.value)
                        }}
                        placeholder="Nombre del supervisor(a) delegado(a)"
                        style={{
                          fontSize: ui.hint + 'px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${supervisorFoEo04.trim() ? t.border : '#ef4444'}`,
                          background: t.bgCard,
                          color: t.text,
                          outline: 'none',
                        }}
                      />
                      {!supervisorFoEo04.trim() && (
                        <span style={{ fontSize: (ui.hint - 1) + 'px', color: '#ef4444' }}>
                          Requerido para generar el formato
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: (ui.hint - 1) + 'px', color: t.textMuted, fontWeight: '600' }}>
                        Subdirección Técnica
                      </label>
                      <select
                        value={subsistemaFoEo04}
                        onChange={e => setSubsistemaFoEo04(e.target.value)}
                        style={{ fontSize: ui.hint + 'px', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, cursor: 'pointer' }}
                      >
                        <option value="vial">De Ejecución del Subsistema Vial</option>
                        <option value="transporte">De Ejecución del Subsistema de Transporte</option>
                      </select>
                    </div>
                  </div>
                  {/* Separador */}
                  <span style={{ flex: '1 1 8px' }} aria-hidden />

                  {/* Columna derecha: Acta + badges + botones */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                      <label style={{ fontSize: (ui.hint - 1) + 'px', color: t.textMuted, fontWeight: '600' }}>
                        Acta / Recibo Parcial
                      </label>
                      <select
                        value={actaIdFoEo04}
                        onChange={e => setActaIdFoEo04(e.target.value)}
                        style={{ fontSize: ui.hint + 'px', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, cursor: 'pointer' }}
                      >
                        <option value="">— Sin acta —</option>
                        {actasRpoFoEo04.map(a => (
                          <option key={a.id} value={String(a.id)}>
                            Acta RPO {a.numero_rpo ?? a.consecutivo}
                            {a.fecha_inicio ? ` (${a.fecha_inicio.slice(0,10)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  {actaIdFoEo04 && (() => {
                    const fs = firmasCcd['FO-IDU-EO-04-V2']
                    if (!fs) return null
                    const badges = [
                      { key: 'elaboro',  label: 'E1', titulo: 'Elaboró 1' },
                      { key: 'elaboro2', label: 'E2', titulo: 'Elaboró 2' },
                      { key: 'reviso',   label: 'R1', titulo: 'Revisó 1'  },
                      { key: 'reviso2',  label: 'R2', titulo: 'Revisó 2'  },
                    ]
                    return (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {badges.map(({ key, label, titulo }) => (
                          <span
                            key={key}
                            style={chipFirmaEstado(!!fs[key])}
                            title={fs[key] ? `${titulo}: firma registrada` : `${titulo}: pendiente`}
                          >
                            {label} {fs[key] ? '✓' : '·'}
                          </span>
                        ))}
                      </div>
                    )
                  })()}
                  {/* Botón: vista previa con progreso */}
                  <button
                    type="button"
                    style={btnCcdToolbar(
                      ['cargando','progreso'].includes(vistaPrevia?.fase) && vistaPrevia?.tipo === 'idu-plantilla-vacia',
                      'vista'
                    )}
                    onClick={abrirPreviewFoEo04ConProgreso}
                    disabled={
                      !supervisorFoEo04.trim() ||
                      (['cargando','progreso'].includes(vistaPrevia?.fase) && vistaPrevia?.tipo === 'idu-plantilla-vacia')
                    }
                    title={!supervisorFoEo04.trim() ? 'Ingrese el nombre del supervisor(a) para continuar' : 'Vista previa PDF'}
                    aria-label="Vista previa FO-IDU-EO-04-V2"
                  >
                    {['cargando','progreso'].includes(vistaPrevia?.fase) && vistaPrevia?.tipo === 'idu-plantilla-vacia' ? (
                      <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                    ) : (
                      <IconoVistaPrevia size={ui.iconSvg} />
                    )}
                  </button>
                  {/* Botón: descargar PDF con sello */}
                  <button
                    type="button"
                    style={btnCcdToolbar(concPdfBusy, 'pdf')}
                    onClick={() => {
                      const qs = new URLSearchParams({
                        subsistema: subsistemaFoEo04 || 'vial',
                        supervisor: supervisorFoEo04.trim(),
                        ...(actaIdFoEo04 ? { acta_id: actaIdFoEo04 } : {}),
                      }).toString()
                      descargarPdfConc(
                        `/informes/${contratoId}/ccd/preview-plantilla-vacia/FO-IDU-EO-04-V2/con-sello-firma?${qs}`,
                        'FO-IDU-EO-04-V2.pdf'
                      )
                    }}
                    disabled={!supervisorFoEo04.trim() || concPdfBusy}
                    title={!supervisorFoEo04.trim() ? 'Ingrese el nombre del supervisor(a) para continuar' : 'Descargar PDF con página de sello (firma del perfil, fecha, huella SHA-256)'}
                    aria-label="Descargar PDF FO-IDU-EO-04-V2 con sello"
                  >
                    {concPdfBusy
                      ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                      : <IconoPdfSello size={ui.iconSvg} />}
                  </button>
                  {/* Botón: registrar firma */}
                  {puedeValidarCcd && (
                    <button
                      type="button"
                      style={btnCcdToolbar(firmaRegistroBusy === 'FO-IDU-EO-04-V2', 'firma')}
                      onClick={registrarFirmaFoEo04}
                      disabled={!actaIdFoEo04 || firmaRegistroBusy === 'FO-IDU-EO-04-V2'}
                      title={!actaIdFoEo04 ? 'Selecciona un acta para registrar tu firma' : 'Registrar tu firma del perfil (Elaboró o Revisó según Biblioteca CCD)'}
                      aria-label="Registrar mi firma FO-IDU-EO-04-V2"
                    >
                      {firmaRegistroBusy === 'FO-IDU-EO-04-V2'
                        ? <span style={{ fontSize: ui.body + 'px' }} aria-hidden>⏳</span>
                        : <IconoFirmaRegistrar size={ui.iconSvg} />}
                    </button>
                  )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal: vista previa = PDF embebido (misma ruta que descarga el backend).
          Fondos opacos fijos: en producción t.bgCard/t.bg pueden ser transparentes y el modal se mezcla con la página. */}
      {vistaPrevia && (() => {
        const esVistaPreviaGerencia =
          vistaPrevia.tipo === 'corte-ger' || vistaPrevia.tipo === 'corte-ger-pdf'
        const esVistaIDUEO04 =
          vistaPrevia.tipo === 'idu-plantilla-vacia' || vistaPrevia.tipo === 'idu-plantilla-vacia-pdf'
        return (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            boxSizing: 'border-box',
          }}
          onClick={cerrarVistaPrevia}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: esVistaPreviaGerencia ? 'min(100%, 1344px)' : esVistaIDUEO04 ? 'min(100%, 1400px)' : '960px',
              height: esVistaIDUEO04 ? 'min(98vh, 1800px)' : 'min(92vh, 880px)',
              maxHeight: esVistaIDUEO04 ? '98vh' : '92vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              padding: '16px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '12px',
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ fontSize: f.title - 2 + 'px', fontWeight: '800', color: '#0f172a' }}>
                  {(() => {
                    const tp = vistaPrevia.tipo
                    if (tp === 'corte' || tp === 'corte-pdf') return 'Vista previa · CC-SUB-001 (PDF)'
                    if (tp === 'corte-sem' || tp === 'corte-sem-pdf') return 'Vista previa · CC-SEM-001 (PDF)'
                    if (tp === 'corte-mes' || tp === 'corte-mes-pdf') return 'Vista previa · CC-MES-001 (PDF)'
                    if (tp === 'corte-ger' || tp === 'corte-ger-pdf') return 'Vista previa · CC-GER-001 — Informe de gerencia (PDF)'
                    if (tp === 'memoria-pdf-todos' || tp === 'memoria-todos') {
                      return 'Vista previa · CC-SUB-002 (PDF) · Todos los ítems'
                    }
                    if (tp === 'memoria-sem-todos' || tp === 'memoria-sem-todos-pdf') {
                      return 'Vista previa · CC-SEM-002 (PDF) · Todos los ítems'
                    }
                    if (tp === 'memoria-sem' || tp === 'memoria-sem-pdf') {
                      return `Vista previa · CC-SEM-002 (PDF) · ${vistaPrevia.itemNumero || ''}`
                    }
                    if (tp === 'memoria-mes' || tp === 'memoria-mes-pdf') {
                      return `Vista previa · CC-MES-002 (PDF) · ${vistaPrevia.itemNumero || ''}`
                    }
                    if (tp === 'memoria' || tp === 'memoria-pdf') {
                      return `Vista previa · CC-SUB-002 (PDF) · ${vistaPrevia.itemNumero || ''}`
                    }
                    if (tp === 'idu-plantilla-vacia' || tp === 'idu-plantilla-vacia-pdf') {
                      return 'Vista previa · FO-IDU-EO-04-V2 · plantilla vacía (PDF)'
                    }
                    return 'Vista previa · PDF'
                  })()}
                </div>
                <div style={{ fontSize: f.sub + 'px', color: '#64748b', marginTop: '4px' }}>
                  Mismo formato PDF que genera el sistema. Puedes usar el menú del visor del navegador para imprimir o guardar.
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarVistaPrevia}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                Cerrar
              </button>
            </div>

            {vistaPrevia.fase === 'cargando' && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                Generando vista previa PDF…
              </div>
            )}

            {vistaPrevia.fase === 'progreso' && (() => {
              const job = foEo04Job || {}
              const pct = Math.min(Math.max(job.pct || 0, 0), 100)
              const curr = job.currentItem
              const tot  = job.totalItems
              // Etiqueta de fase estable (no cambia con cada ítem)
              const fase = pct < 30
                ? 'Consultando información del acta…'
                : pct < 55
                ? 'Calculando cantidades…'
                : pct < 76
                ? `Generando memorias${tot ? ` (${curr || '…'} de ${tot})` : '…'}`
                : 'Creando archivo PDF…'
              return (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 32px',
                  gap: '20px',
                }}>
                  {/* Ícono */}
                  <div style={{ fontSize: '44px', lineHeight: 1, userSelect: 'none' }}>📄</div>

                  {/* Título estable */}
                  <div style={{ fontWeight: '700', fontSize: (f.body + 2) + 'px', color: '#1e293b', textAlign: 'center' }}>
                    Generando memorias de cálculo
                  </div>

                  {/* Barra de progreso */}
                  <div style={{ width: '100%', maxWidth: '520px' }}>
                    <div style={{
                      width: '100%',
                      height: '12px',
                      backgroundColor: '#e2e8f0',
                      borderRadius: '99px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        backgroundColor: pct >= 100 ? '#16a34a' : '#3b82f6',
                        borderRadius: '99px',
                        transition: 'width 0.8s ease',
                      }} />
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '6px',
                      fontSize: f.sub + 'px',
                      color: '#64748b',
                    }}>
                      <span>{fase}</span>
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>{pct}%</span>
                    </div>
                  </div>

                  {/* Nota solo si hay muchos ítems */}
                  {(tot || 0) > 20 && (
                    <div style={{ fontSize: (f.sub - 1) + 'px', color: '#94a3b8', textAlign: 'center', maxWidth: '400px' }}>
                      Por favor espere sin cerrar esta ventana.
                    </div>
                  )}
                </div>
              )
            })()}

            {vistaPrevia.fase === 'error' && (
              <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: f.sub + 'px' }}>
                {vistaPrevia.mensaje}
              </div>
            )}

            {vistaPrevia.fase === 'ok' && vistaPrevia.pdfUrl && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#e2e8f0',
                }}
              >
                <iframe
                  title="Vista previa PDF"
                  src={vistaPrevia.pdfUrl}
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: esVistaIDUEO04 ? 'min(90vh, 1600px)' : 'min(72vh, 640px)',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>
            )}
          </div>
        </div>
        )
      })()}
    </div>
  )
}
