import { useState, useEffect, useCallback, useRef } from 'react'
import CcModalBrandHeader from './CcModalBrandHeader'
import { createPortal } from 'react-dom'
import { Copy, Headset, Trash2, Wand2 } from 'lucide-react'
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../apiBase'
import { createRealtimeDebouncer, isEfectivoOffline } from '../realtimeUtils'
import { supabase } from '../supabaseClient'
import { useClaraViewport } from '../useClaraViewport'

const SOPORTE_Z_PANEL = 11000
const SOPORTE_Z_MODAL = 11001
const SOPORTE_Z_PANEL_MOBILE = 13000
const SOPORTE_Z_MODAL_MOBILE = 14000

function formatFechaLogBogota(iso) {
  if (!iso) return '—'
  try {
    let s = String(iso).trim().replace(' ', 'T')
    if (!/Z$/i.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z'
    return new Date(s).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

function tiempoRelativo(iso) {
  if (!iso) return '—'
  try {
    let s = String(iso).trim().replace(' ', 'T')
    if (!/Z$/i.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    const sec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (sec < 45) return 'hace un momento'
    if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`
    if (sec < 604800) return `hace ${Math.floor(sec / 86400)} d`
    return formatFechaLogBogota(iso)
  } catch {
    return '—'
  }
}

function etiquetaContrato(r) {
  if (r?.contrato_numero) return String(r.contrato_numero)
  if (r?.contrato_id != null && r?.contrato_id !== '') return String(r.contrato_id)
  return null
}

function esDesarrollador(usuario) {
  return usuario?.cargo_nombre?.trim().toLowerCase() === 'desarrollador'
}

function getToken() {
  return localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
}

function badgeContrato(contratoLabel, t) {
  if (!contratoLabel) return null
  return (
    <span
      style={{
        fontSize: 'var(--cc-caption)',
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: '20px',
        background: `${t.primary}14`,
        color: t.primary,
        border: `1px solid ${t.primary}44`,
        flexShrink: 0,
      }}
    >
      Contrato {contratoLabel}
    </span>
  )
}

function iconoReporte(r) {
  if (r.tipo_reporte === 'error') return '🛟'
  if (r.tipo_reporte === 'sugerencia') return '💡'
  return '📩'
}

function accionGestionar(r) {
  if (r.tipo_reporte === 'sugerencia') return 'anotado'
  return 'gestionado'
}

function labelGestionar(r) {
  if (r.tipo_reporte === 'sugerencia') return '💡 Anotado'
  return '✅ Gestionado'
}

function puedeGestionar(r) {
  return (
    !r.soporte_estado &&
    (r.tipo_reporte === 'error' || r.tipo_reporte === 'sugerencia' || r.tipo_reporte === 'otro')
  )
}

function colorBtnGestionar(r) {
  if (r.tipo_reporte === 'sugerencia') return '#CA8A04'
  return '#16A34A'
}

function textoImagenAdjunta(val) {
  if (val === true) return 'Sí (indicada en el reporte; no hay archivo almacenado)'
  if (val === false) return 'No'
  return '—'
}

async function fetchSoporteApi(url, headers) {
  const r = await fetch(url, { headers }).catch(() => null)
  if (!r) {
    return { ok: false, error: 'No se pudo conectar con el servidor. Verifica tu conexión.' }
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    const detail = err?.detail
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d) => d.msg || d).join(', ') : null
    return { ok: false, error: msg || `Error al cargar reportes (${r.status}).` }
  }
  return { ok: true, data: await r.json() }
}

function CampoDetalle({ label, value, t }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 'var(--cc-caption)',
          fontWeight: 700,
          color: t.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 'var(--cc-sm)', color: t.text, lineHeight: 1.45, wordBreak: 'break-word' }}>
        {value || '—'}
      </div>
    </div>
  )
}

/** Prompt listo para pegar en Cursor a partir de un reporte SOPORTE. */
function construirPromptCursorBug(r) {
  const modulo = (r?.modulo || '').trim() || '—'
  const contrato = etiquetaContrato(r) || '—'
  const urgencia = (r?.urgencia || '').trim() || '—'
  const usuario = (r?.remitente_nombre || '').trim() || '—'
  const sector = (r?.sector || '').trim() || '—'
  const ubicacion = (r?.ubicacion || '').trim()
  const mensajeBase = (
    r?.descripcion_completa || r?.mensaje || r?.descripcion_resumen || ''
  ).trim() || '—'

  const mensajeAmpliado = (() => {
    const yaTieneSector = /sector\s*:/i.test(mensajeBase)
    if (yaTieneSector) return mensajeBase
    const extras = []
    if (ubicacion) extras.push(`Ubicación: ${ubicacion}`)
    extras.push(`Sector: ${sector}`)
    return `${extras.join('\n')}\n\n${mensajeBase}`
  })()

  return [
    `Bug reportado en ClaraCore — ${modulo}`,
    `Contrato: ${contrato}`,
    `Urgencia: ${urgencia}`,
    `Reportado por: ${usuario}`,
    '',
    mensajeAmpliado,
    '',
    `Revisar el componente correspondiente al módulo ${modulo} en la sección ${sector} y corregir el comportamiento descrito.`,
  ].join('\n')
}

export function PanelSoporteTecnico({ t, usuario, token, onOpenChange, fullWidthTrigger = false, hideTrigger = false, openSignal = 0 }) {
  const { isMobile: soporteVpMobile, isLandscapeMobile: soporteLandscapeMobile } = useClaraViewport()
  const soporteMobile = soporteVpMobile || soporteLandscapeMobile
  const zPanel = soporteMobile ? SOPORTE_Z_PANEL_MOBILE : SOPORTE_Z_PANEL
  const zModal = soporteMobile ? SOPORTE_Z_MODAL_MOBILE : SOPORTE_Z_MODAL

  const [abierto, setAbierto] = useState(false)
  const [tab, setTab] = useState('pendientes')
  const [pendientes, setPendientes] = useState([])
  const [gestionados, setGestionados] = useState([])
  const [pendientesCount, setPendientesCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [accionId, setAccionId] = useState(null)
  const [eliminandoId, setEliminandoId] = useState(null)
  const [limpiando, setLimpiando] = useState(false)
  const [detalleActivo, setDetalleActivo] = useState(null)
  const [promptCursor, setPromptCursor] = useState('')
  const [copiadoPrompt, setCopiadoPrompt] = useState(false)
  const copiadoTimerRef = useRef(null)

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${getToken()}` }),
    [],
  )

  const cerrarDetalle = useCallback(() => {
    setDetalleActivo(null)
    setPromptCursor('')
    setCopiadoPrompt(false)
    if (copiadoTimerRef.current) {
      clearTimeout(copiadoTimerRef.current)
      copiadoTimerRef.current = null
    }
  }, [])

  const generarPromptCursor = useCallback(() => {
    if (!detalleActivo) return
    setPromptCursor(construirPromptCursorBug(detalleActivo))
    setCopiadoPrompt(false)
  }, [detalleActivo])

  const copiarPromptCursor = useCallback(async () => {
    if (!promptCursor) return
    try {
      await navigator.clipboard.writeText(promptCursor)
      setCopiadoPrompt(true)
      if (copiadoTimerRef.current) clearTimeout(copiadoTimerRef.current)
      copiadoTimerRef.current = setTimeout(() => {
        setCopiadoPrompt(false)
        copiadoTimerRef.current = null
      }, 2000)
    } catch {
      /* clipboard no disponible */
    }
  }, [promptCursor])

  useEffect(() => () => {
    if (copiadoTimerRef.current) clearTimeout(copiadoTimerRef.current)
  }, [])

  const cargarPendientes = useCallback(async () => {
    const res = await fetchSoporteApi(`${API_BASE}/admin/soporte?filtro=todos`, authHeaders())
    if (!res.ok) {
      setApiError(res.error)
      return false
    }
    setApiError(null)
    const data = res.data
    setPendientesCount(data?.kpis?.pendientes ?? 0)
    setPendientes((data?.reportes || []).filter((x) => !x.soporte_estado))
    return true
  }, [authHeaders])

  const cargarGestionados = useCallback(async () => {
    const res = await fetchSoporteApi(`${API_BASE}/admin/soporte?filtro=gestionados`, authHeaders())
    if (!res.ok) {
      setApiError(res.error)
      return false
    }
    setApiError(null)
    setGestionados(res.data?.reportes || [])
    return true
  }, [authHeaders])

  const cargarCount = useCallback(async () => {
    const res = await fetchSoporteApi(`${API_BASE}/admin/soporte?filtro=todos`, authHeaders())
    if (!res.ok) {
      setApiError(res.error)
      return false
    }
    setApiError(null)
    setPendientesCount(res.data?.kpis?.pendientes ?? 0)
    return true
  }, [authHeaders])

  const refrescarTodo = useCallback(async () => {
    await cargarPendientes()
    await cargarGestionados()
    await cargarCount()
  }, [cargarPendientes, cargarGestionados, cargarCount])

  const cargarTab = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'pendientes') {
        await cargarPendientes()
      } else {
        await cargarGestionados()
      }
    } finally {
      setLoading(false)
    }
  }, [tab, cargarPendientes, cargarGestionados])

  const cargarCountRef = useRef(cargarCount)
  cargarCountRef.current = cargarCount
  const cargarTabRef = useRef(cargarTab)
  cargarTabRef.current = cargarTab
  const abiertoRef = useRef(abierto)
  abiertoRef.current = abierto

  useEffect(() => {
    if (!esDesarrollador(usuario) || !token) return
    void cargarCount()
    const iv = setInterval(() => { void cargarCountRef.current?.() }, 60000)
    return () => clearInterval(iv)
  }, [usuario?.id, token, cargarCount])

  /** Al cambiar de contrato activo, recargar (el panel es global: todos los contratos). */
  useEffect(() => {
    if (!esDesarrollador(usuario) || !token) return
    void cargarCount()
    if (abiertoRef.current) void cargarTabRef.current?.()
  }, [usuario?.contrato_id, token, cargarCount, cargarTab])

  /** Realtime: cualquier reporte SOPORTE nuevo/actualizado, sin filtrar por contrato. */
  useEffect(() => {
    if (!esDesarrollador(usuario) || isEfectivoOffline() || !SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase) return
    const onFlush = () => {
      void cargarCountRef.current?.()
      if (abiertoRef.current) void cargarTabRef.current?.()
    }
    const debouncer = createRealtimeDebouncer(onFlush)
    const channel = supabase
      .channel('soporte-tecnico-global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones', filter: 'tipo=eq.SOPORTE' },
        () => debouncer.schedule(),
      )
      .subscribe()
    return () => {
      debouncer.dispose()
      void supabase.removeChannel(channel)
    }
  }, [usuario?.id])

  useEffect(() => {
    if (!abierto || !esDesarrollador(usuario)) return
    void cargarTab()
    const iv = setInterval(() => {
      if (abiertoRef.current) void cargarTabRef.current?.()
    }, 20000)
    return () => clearInterval(iv)
  }, [abierto, tab, usuario, cargarTab])

  useEffect(() => {
    if (!soporteMobile || (!abierto && !detalleActivo)) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [soporteMobile, abierto, detalleActivo])

  /** Al abrir panel o detalle en móvil: cerrar menú hamburguesa del Dashboard. */
  useEffect(() => {
    if (soporteMobile && (abierto || detalleActivo)) {
      onOpenChange?.(true)
    }
  }, [soporteMobile, abierto, detalleActivo, onOpenChange])

  const setAbiertoSafe = (val) => {
    setAbierto(val)
    if (val && soporteMobile) onOpenChange?.(true)
    if (!val) cerrarDetalle()
  }

  const abrirDetalle = (r) => {
    setPromptCursor('')
    setCopiadoPrompt(false)
    if (copiadoTimerRef.current) {
      clearTimeout(copiadoTimerRef.current)
      copiadoTimerRef.current = null
    }
    setDetalleActivo(r)
    if (soporteMobile) onOpenChange?.(true)
  }

  useEffect(() => {
    if (!openSignal) return
    setAbierto(true)
    cerrarDetalle()
  }, [openSignal, cerrarDetalle])

  const marcar = async (id, accion) => {
    setAccionId(id)
    try {
      const r = await fetch(`${API_BASE}/admin/soporte/${id}/gestionar`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err?.detail || 'No se pudo actualizar el reporte')
        return
      }
      if (detalleActivo?.id === id) cerrarDetalle()
      await refrescarTodo()
    } finally {
      setAccionId(null)
    }
  }

  const eliminar = async (id, e) => {
    e?.stopPropagation?.()
    setEliminandoId(id)
    try {
      const r = await fetch(`${API_BASE}/admin/soporte/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err?.detail || 'No se pudo eliminar el reporte')
        return
      }
      if (detalleActivo?.id === id) cerrarDetalle()
      await refrescarTodo()
    } finally {
      setEliminandoId(null)
    }
  }

  const limpiarTodo = async () => {
    const items = tab === 'pendientes' ? pendientes : gestionados
    const n = items.length
    if (!n) return
    const msg =
      tab === 'pendientes'
        ? `¿Eliminar los ${n} reportes pendientes? Esta acción no se puede deshacer.`
        : `¿Eliminar los ${n} reportes gestionados? Esta acción no se puede deshacer.`
    if (!window.confirm(msg)) return
    setLimpiando(true)
    try {
      const r = await fetch(`${API_BASE}/admin/soporte/limpiar?pestana=${encodeURIComponent(tab)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err?.detail || 'No se pudo limpiar los reportes')
        return
      }
      setDetalleActivo(null)
      setPromptCursor('')
      setCopiadoPrompt(false)
      await refrescarTodo()
    } finally {
      setLimpiando(false)
    }
  }

  const btnGestionar = (r, { stopProp = false } = {}) => {
    if (!puedeGestionar(r)) return null
    const busy = accionId === r.id
    const borrando = eliminandoId === r.id
    return (
      <button
        type="button"
        disabled={busy || borrando}
        onClick={(e) => {
          if (stopProp) e.stopPropagation()
          void marcar(r.id, accionGestionar(r))
        }}
        style={{
          background: colorBtnGestionar(r),
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '5px 12px',
          fontSize: 'var(--cc-label)',
          fontWeight: '700',
          cursor: busy || borrando ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? '…' : labelGestionar(r)}
      </button>
    )
  }

  const btnEliminar = (r, { stopProp = false } = {}) => {
    const busy = accionId === r.id
    const borrando = eliminandoId === r.id
    return (
      <button
        type="button"
        title="Eliminar reporte"
        disabled={borrando || busy}
        onClick={(e) => eliminar(r.id, e)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '2px',
          cursor: borrando || busy ? 'wait' : 'pointer',
          color: t.textMuted,
          flexShrink: 0,
          lineHeight: 0,
          opacity: borrando ? 0.5 : 1,
        }}
      >
        <Trash2 size={15} strokeWidth={2} aria-hidden />
      </button>
    )
  }

  if (!esDesarrollador(usuario)) return null

  const lista = tab === 'pendientes' ? pendientes : gestionados

  const btnTab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      style={{
        background: tab === key ? t.primary : 'transparent',
        color: tab === key ? '#fff' : t.textMuted,
        border: `1px solid ${tab === key ? t.primary : t.border}`,
        borderRadius: '20px',
        padding: soporteMobile ? '10px 14px' : '4px 14px',
        fontSize: soporteMobile ? 'var(--cc-sm)' : 'var(--cc-sm)',
        fontWeight: tab === key ? '700' : '400',
        cursor: 'pointer',
        minHeight: soporteMobile ? 44 : undefined,
        flex: soporteMobile ? 1 : undefined,
      }}
    >
      {label}
    </button>
  )

  const urgenciaBadge = (urgencia) => {
    if (!urgencia) return null
    return (
      <span
        style={{
          fontSize: 'var(--cc-caption)',
          fontWeight: 700,
          padding: '1px 7px',
          borderRadius: '20px',
          background: '#FFF7ED',
          color: '#9A3412',
          border: '1px solid #FDBA7444',
          flexShrink: 0,
        }}
      >
        {urgencia}
      </span>
    )
  }

  const renderTarjeta = (r) => {
    const gestionado = !!r.soporte_estado

    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        onClick={() => abrirDetalle(r)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            abrirDetalle(r)
          }
        }}
        className={soporteMobile ? 'cc-soporte-item' : undefined}
        style={{
          padding: soporteMobile ? '12px 14px' : '10px 12px',
          borderRadius: '8px',
          marginBottom: '6px',
          background: gestionado ? t.bg : `${t.primary}08`,
          border: `1px solid ${gestionado ? t.border : `${t.primary}33`}`,
          opacity: gestionado ? 0.85 : 1,
          cursor: 'pointer',
          minHeight: soporteMobile ? 44 : undefined,
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 'var(--cc-lg)', lineHeight: 1, flexShrink: 0 }}>{iconoReporte(r)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <div
                style={{
                  fontSize: 'var(--cc-sm)',
                  fontWeight: '700',
                  color: t.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '4px',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {r.asunto || 'Sin asunto'}
              </div>
              {btnEliminar(r, { stopProp: true })}
            </div>
            {r.descripcion_resumen ? (
              <div
                style={{
                  fontSize: 'var(--cc-label)',
                  color: t.textMuted,
                  lineHeight: 1.4,
                  marginBottom: '6px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {r.descripcion_resumen}
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: 'var(--cc-label)', color: t.textMuted }}>
                {r.remitente_nombre || 'Usuario'}
              </span>
              <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>·</span>
              <span style={{ fontSize: 'var(--cc-label)', color: t.textMuted }}>
                {tiempoRelativo(r.created_at)}
              </span>
              {badgeContrato(etiquetaContrato(r), t)}
              {urgenciaBadge(r.urgencia)}
            </div>
            {gestionado && (
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: '2px' }}>
                {r.soporte_estado === 'anotado' ? '💡 Anotado' : '✅ Gestionado'}
                {r.soporte_gestionado_por_nombre ? ` · ${r.soporte_gestionado_por_nombre}` : ''}
              </div>
            )}
            {puedeGestionar(r) && (
              <div style={{ marginTop: '8px' }} onClick={(e) => e.stopPropagation()} role="presentation">
                {btnGestionar(r)}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const detalle = detalleActivo

  const triggerBtn = (
    <div style={{ position: 'relative', width: fullWidthTrigger ? '100%' : undefined }}>
      <button
        type="button"
        title="Soporte técnico"
        className={soporteMobile ? 'cc-soporte-trigger' : undefined}
        onClick={() => setAbiertoSafe(!abierto)}
        style={{
          background: abierto ? `${t.primary}22` : (fullWidthTrigger ? t.bg : 'transparent'),
          border: `1px solid ${abierto ? t.primary : t.border}`,
          borderRadius: fullWidthTrigger ? 12 : 8,
          padding: soporteMobile && fullWidthTrigger ? '12px 14px' : '6px 12px',
          cursor: 'pointer',
          color: abierto ? t.primary : t.textMuted,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: fullWidthTrigger ? 'center' : 'flex-start',
          gap: fullWidthTrigger ? 8 : 4,
          width: fullWidthTrigger ? '100%' : undefined,
          minHeight: soporteMobile ? 44 : undefined,
          fontWeight: fullWidthTrigger ? 600 : undefined,
          fontSize: fullWidthTrigger ? 'var(--cc-sm)' : (soporteMobile ? '1.25rem' : 'var(--cc-lg)'),
        }}
      >
        <Headset size={fullWidthTrigger ? 20 : 18} strokeWidth={2} aria-hidden />
        {fullWidthTrigger ? 'Soporte técnico' : null}
        {pendientesCount > 0 && (
          <span
            className="cc-soporte-badge"
            style={{
              background: '#EF4444',
              color: '#fff',
              borderRadius: '20px',
              fontSize: soporteMobile ? 11 : 'var(--cc-caption)',
              fontWeight: '700',
              padding: soporteMobile ? '2px 6px' : '1px 6px',
              minWidth: soporteMobile ? 18 : 16,
              height: soporteMobile ? 18 : undefined,
              textAlign: 'center',
              lineHeight: soporteMobile ? '14px' : undefined,
              marginLeft: fullWidthTrigger ? 4 : undefined,
              position: fullWidthTrigger ? undefined : (soporteMobile ? 'absolute' : undefined),
              top: fullWidthTrigger ? undefined : (soporteMobile ? -4 : undefined),
              right: fullWidthTrigger ? undefined : (soporteMobile ? -4 : undefined),
            }}
          >
            {pendientesCount > 99 ? '99+' : pendientesCount}
          </span>
        )}
      </button>
    </div>
  )

  const panelEl = abierto && !(soporteMobile && detalleActivo) ? (
    <>
      {soporteMobile && (
        <div
          role="presentation"
          className="cc-soporte-backdrop"
          onClick={() => setAbiertoSafe(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: zPanel - 1,
            background: 'rgba(0,0,0,0.45)',
          }}
        />
      )}
      <div
        className={soporteMobile ? 'cc-soporte-panel cc-soporte-panel--mobile' : 'cc-soporte-panel'}
        role="dialog"
        aria-modal="true"
        aria-label="Soporte técnico"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          left: soporteMobile ? 0 : undefined,
          bottom: 0,
          width: soporteMobile ? '100%' : '400px',
          maxWidth: soporteMobile ? '100vw' : undefined,
          background: t.bgCard,
          borderLeft: soporteMobile ? 'none' : `1px solid ${t.border}`,
          zIndex: zPanel,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: soporteMobile ? '0 8px 32px rgba(0,0,0,0.28)' : '-4px 0 24px rgba(0,0,0,0.2)',
          paddingTop: soporteMobile ? 'env(safe-area-inset-top, 0px)' : undefined,
          paddingBottom: soporteMobile ? 'env(safe-area-inset-bottom, 0px)' : undefined,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            padding: soporteMobile ? '12px 14px' : '16px 20px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
            <Headset size={20} strokeWidth={2} color={t.primary} aria-hidden />
            <div style={{ fontSize: soporteMobile ? 'var(--cc-lg)' : 'var(--cc-md)', fontWeight: '700', color: t.text }}>
              Soporte técnico
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, width: soporteMobile ? '100%' : undefined }}>
              Todos los contratos
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={limpiarTodo}
              disabled={limpiando || !lista.length || !!apiError}
              style={{
                background: 'transparent',
                border: `1px solid ${lista.length && !apiError ? '#DC2626' : t.border}`,
                borderRadius: '8px',
                padding: soporteMobile ? '10px 12px' : '4px 10px',
                fontSize: soporteMobile ? 'var(--cc-sm)' : 'var(--cc-label)',
                fontWeight: '600',
                cursor: limpiando || !lista.length || apiError ? 'not-allowed' : 'pointer',
                color: lista.length && !apiError ? '#DC2626' : t.textMuted,
                opacity: limpiando ? 0.7 : 1,
                minHeight: soporteMobile ? 44 : undefined,
              }}
            >
              {limpiando ? 'Limpiando…' : 'Limpiar todo'}
            </button>
            <button
              type="button"
              onClick={() => setAbiertoSafe(false)}
              aria-label="Cerrar soporte técnico"
              style={{
                background: soporteMobile ? t.bg : 'transparent',
                border: soporteMobile ? `1px solid ${t.border}` : 'none',
                borderRadius: 8,
                width: soporteMobile ? 44 : undefined,
                height: soporteMobile ? 44 : undefined,
                fontSize: 'var(--cc-lg)',
                cursor: 'pointer',
                color: t.textMuted,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style={{
            padding: soporteMobile ? '10px 14px' : '10px 16px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {btnTab('pendientes', `Pendientes${pendientesCount > 0 ? ` (${pendientesCount})` : ''}`)}
          {btnTab('gestionados', 'Gestionados')}
        </div>

        {apiError && (
          <div
            style={{
              margin: soporteMobile ? '12px 14px 0' : '12px 16px 0',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: soporteMobile ? 'var(--cc-body)' : 'var(--cc-sm)',
              lineHeight: 1.45,
              flexShrink: 0,
            }}
          >
            {apiError}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: soporteMobile ? '12px 14px' : '12px 16px', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
          {loading && !lista.length && !apiError ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: t.textMuted, fontSize: soporteMobile ? 'var(--cc-body)' : 'var(--cc-sm)' }}>
              Cargando reportes…
            </div>
          ) : apiError && !lista.length ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: t.textMuted, fontSize: soporteMobile ? 'var(--cc-body)' : 'var(--cc-sm)' }}>
              No se pudo cargar la lista de reportes.
            </div>
          ) : !lista.length ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: t.textMuted, fontSize: soporteMobile ? 'var(--cc-body)' : 'var(--cc-sm)' }}>
              {tab === 'pendientes' ? 'No hay reportes pendientes.' : 'No hay reportes gestionados.'}
            </div>
          ) : (
            lista.map(renderTarjeta)
          )}
        </div>
      </div>
    </>
  ) : null

  const detalleModal = detalle ? (
    <div
      className={soporteMobile ? 'cc-soporte-detalle-overlay' : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        background: soporteMobile ? 'rgba(15, 23, 42, 0.55)' : 'rgba(15, 23, 42, 0.52)',
        zIndex: zModal,
        display: 'flex',
        alignItems: soporteMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
      onClick={cerrarDetalle}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={soporteMobile ? 'cc-soporte-detalle-sheet' : undefined}
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: soporteMobile ? 14 : 14,
          width: soporteMobile ? '100%' : '520px',
          maxWidth: soporteMobile ? '100%' : '95vw',
          height: soporteMobile ? '100%' : undefined,
          maxHeight: soporteMobile ? '100%' : '88vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          boxSizing: 'border-box',
          minHeight: 0,
          padding: soporteMobile ? 0 : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />
        <div
          className={soporteMobile ? 'cc-soporte-detalle-header' : undefined}
          style={{
            padding: soporteMobile ? '12px 14px' : '16px 18px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{iconoReporte(detalle)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: soporteMobile ? 'var(--cc-md)' : 'var(--cc-md)', fontWeight: '700', color: t.text, lineHeight: 1.3 }}>
                {detalle.asunto || 'Sin asunto'}
              </div>
              <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginTop: '4px' }}>
                {formatFechaLogBogota(detalle.created_at)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              title="Generar prompt para Cursor"
              aria-label="Generar prompt para Cursor"
              onClick={generarPromptCursor}
              style={{
                background: promptCursor ? `${t.primary}18` : 'transparent',
                border: `1px solid ${promptCursor ? t.primary + '55' : t.border}`,
                borderRadius: 8,
                width: 32,
                height: 32,
                padding: 0,
                cursor: 'pointer',
                color: promptCursor ? t.primary : t.textMuted,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wand2 size={15} strokeWidth={2} aria-hidden />
            </button>
            {!soporteMobile && (
              <button
                type="button"
                onClick={cerrarDetalle}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 'var(--cc-lg)',
                  cursor: 'pointer',
                  color: t.textMuted,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div
          className={soporteMobile ? 'cc-soporte-detalle-body' : undefined}
          style={{
            padding: soporteMobile ? '12px 14px' : '16px 18px',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            className={soporteMobile ? 'cc-soporte-detalle-grid' : undefined}
            style={{
              display: 'grid',
              gridTemplateColumns: soporteMobile ? '1fr' : '1fr 1fr',
              gap: soporteMobile ? '8px' : '4px 16px',
              marginBottom: 14,
            }}
          >
            <CampoDetalle label="Usuario" value={detalle.remitente_nombre} t={t} />
            <CampoDetalle label="Contrato" value={etiquetaContrato(detalle)} t={t} />
            <CampoDetalle label="Módulo" value={detalle.modulo} t={t} />
            <CampoDetalle label="Ubicación" value={detalle.ubicacion} t={t} />
            <CampoDetalle label="Sector" value={detalle.sector} t={t} />
            <CampoDetalle label="Urgencia" value={detalle.urgencia} t={t} />
            <CampoDetalle label="Imagen adjunta" value={textoImagenAdjunta(detalle.imagen_adjunta)} t={t} />
          </div>

          <CampoDetalle
            label="Mensaje"
            value={detalle.descripcion_completa || detalle.mensaje || detalle.descripcion_resumen}
            t={t}
          />

          {promptCursor && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${t.primary}44`,
                background: `${t.primary}0A`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 700,
                    color: t.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Prompt para Cursor
                </div>
                <button
                  type="button"
                  title={copiadoPrompt ? 'Copiado' : 'Copiar prompt'}
                  aria-label={copiadoPrompt ? 'Copiado' : 'Copiar prompt'}
                  onClick={() => void copiarPromptCursor()}
                  style={{
                    background: copiadoPrompt ? `${t.primary}22` : 'transparent',
                    border: `1px solid ${copiadoPrompt ? t.primary + '66' : t.border}`,
                    borderRadius: 8,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    color: copiadoPrompt ? t.primary : t.textMuted,
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 28,
                  }}
                >
                  {copiadoPrompt ? (
                    'Copiado ✓'
                  ) : (
                    <>
                      <Copy size={13} strokeWidth={2} aria-hidden />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <textarea
                readOnly
                value={promptCursor}
                rows={10}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  minHeight: 140,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg || t.inputBg || t.bgCard,
                  color: t.text,
                  fontSize: 'var(--cc-sm)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  lineHeight: 1.45,
                  outline: 'none',
                }}
              />
            </div>
          )}

          {detalle.soporte_estado && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                borderRadius: '8px',
                background: `${t.primary}11`,
                border: `1px solid ${t.primary}33`,
                fontSize: 'var(--cc-label)',
                color: t.textMuted,
              }}
            >
              {detalle.soporte_estado === 'anotado' ? '💡 Anotado' : '✅ Gestionado'}
              {detalle.soporte_gestionado_por_nombre ? ` · ${detalle.soporte_gestionado_por_nombre}` : ''}
              {detalle.soporte_gestion_origen ? ` (${detalle.soporte_gestion_origen})` : ''}
            </div>
          )}
        </div>

        {soporteMobile ? (
          <div
            className="cc-soporte-detalle-footer"
            style={{
              borderTop: `1px solid ${t.border}`,
              flexShrink: 0,
              background: t.bgCard,
            }}
          >
            <button
              type="button"
              className="cc-soporte-detalle-footer-btn"
              onClick={() => eliminar(detalle.id)}
              disabled={eliminandoId === detalle.id || accionId === detalle.id}
              style={{
                flex: '1 1 calc(33.33% - 6px)',
                minHeight: 44,
                minWidth: 0,
                padding: '10px 8px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: '#DC2626',
                fontSize: 'var(--cc-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden />
              Eliminar
            </button>
            <button
              type="button"
              className="cc-soporte-detalle-footer-btn"
              onClick={cerrarDetalle}
              style={{
                flex: '1 1 calc(33.33% - 6px)',
                minHeight: 44,
                minWidth: 0,
                padding: '10px 8px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: t.textMuted,
                fontSize: 'var(--cc-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
            {puedeGestionar(detalle) && (
              <button
                type="button"
                className="cc-soporte-detalle-footer-btn"
                disabled={accionId === detalle.id || eliminandoId === detalle.id}
                onClick={() => void marcar(detalle.id, accionGestionar(detalle))}
                style={{
                  flex: '1 1 calc(33.33% - 6px)',
                  minHeight: 44,
                  minWidth: 0,
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: 'none',
                  background: colorBtnGestionar(detalle),
                  color: '#fff',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 700,
                  cursor: accionId === detalle.id ? 'wait' : 'pointer',
                  opacity: accionId === detalle.id ? 0.7 : 1,
                }}
              >
                {accionId === detalle.id ? '…' : labelGestionar(detalle)}
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '12px 18px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => eliminar(detalle.id)}
              disabled={eliminandoId === detalle.id || accionId === detalle.id}
              style={{
                background: 'transparent',
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: 'var(--cc-label)',
                fontWeight: '600',
                cursor: 'pointer',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden />
              Eliminar
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={cerrarDetalle}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: 'var(--cc-label)',
                  cursor: 'pointer',
                  color: t.textMuted,
                }}
              >
                Cerrar
              </button>
              {btnGestionar(detalle, { stopProp: true })}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null

  const overlays = (
    <>
      {panelEl}
      {detalleModal}
    </>
  )

  return (
    <>
      {!hideTrigger && triggerBtn}
      {(abierto || detalleActivo) && typeof document !== 'undefined'
        ? createPortal(overlays, document.body)
        : null}
    </>
  )
}

export default PanelSoporteTecnico
