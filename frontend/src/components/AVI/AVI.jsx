/**
 * AVI — Asistente Virtual Inteligente de ClaraCore.
 *
 * Botón flotante + panel lateral deslizante (redimensionable por el borde izquierdo).
 * Historial de conversación en burbujas (usuario / Clara) con scroll vertical.
 *
 * Props:
 *   usuario  — objeto de sesión desde App.jsx. Cuando es null (logout) se limpia el historial.
 *
 * Dependencias del proyecto (sin librerías nuevas):
 *   lucide-react  — ya instalado
 *   ModuloContext — frontend/src/context/ModuloContext.jsx
 *   apiBase.js    — API_BASE
 */
import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { Bot, X, Send, Paperclip } from 'lucide-react'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE } from '../../apiBase'
import { base64DesdeDataUrl, comprimirImagenADataUrl } from '../../comprimirImagen'

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_IMAGEN_BYTES    = 4 * 1024 * 1024
const PANEL_ANCHO_DEFAULT = 380
const PANEL_ANCHO_MIN     = 320
const PANEL_ANCHO_MAX     = 700

const BIENVENIDA_TEXTO =
  '¡Hola! Soy Clara. Cuéntame en qué te puedo ayudar hoy con ClaraCore.'

function getToken() {
  return localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
}

function generarId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `avi-${Date.now()}-${Math.random()}`
}

// ── Parser de markdown liviano ────────────────────────────────────────────────
// Soporta: **negritas**, listas con guión (- ), saltos de línea.
function parseMarkdown(texto) {
  if (!texto) return []
  const lines = texto.split('\n')
  const elements = []
  let listItems = []
  let key = 0

  function flushList() {
    if (listItems.length === 0) return
    elements.push(
      <ul key={`ul-${key++}`} style={{ margin: '4px 0', paddingLeft: '18px' }}>
        {listItems}
      </ul>
    )
    listItems = []
  }

  function renderInline(str) {
    return str.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : (part || null)
    )
  }

  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1
    if (/^- /.test(line)) {
      listItems.push(
        <li key={`li-${key++}`} style={{ marginBottom: '2px' }}>
          {renderInline(line.slice(2))}
        </li>
      )
    } else {
      flushList()
      if (line === '') {
        if (!isLast) elements.push(<br key={`br-${key++}`} />)
      } else {
        elements.push(<span key={`s-${key++}`}>{renderInline(line)}</span>)
        if (!isLast) elements.push(<br key={`br-${key++}`} />)
      }
    }
  })
  flushList()
  return elements
}

// ── Contexto (botón en header + panel global) ─────────────────────────────────

const AviContext = createContext(null)

/** Botón de Clara para la barra superior (entre usuario y notificaciones). */
export function AVITriggerButton({ t }) {
  const ctx = useContext(AviContext)
  if (!ctx) return null
  return ctx.renderTrigger(t)
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function AVI({ usuario, fontSize: _fontSize = 'normal', children }) {
  const { moduloActivo } = useModulo()

  // Estado del panel
  const [abierto, setAbierto]                       = useState(false)
  const [badgeVisible, setBadgeVisible]             = useState(true)
  const [bienvenidaMostrada, setBienvenidaMostrada] = useState(false)
  const [panelAncho, setPanelAncho]                 = useState(PANEL_ANCHO_DEFAULT)

  // Conversación
  const [mensajes, setMensajes]                     = useState([])
  const [enviando, setEnviando]                     = useState(false)
  const [mensajesRestantes, setMensajesRestantes]   = useState(null)

  // Input
  const [input, setInput]                           = useState('')
  const [imagenPreview, setImagenPreview]           = useState(null)
  const [imagenBase64, setImagenBase64]             = useState(null)
  const [imagenError, setImagenError]               = useState('')

  // Encuesta al cerrar
  const [vistaFeedback, setVistaFeedback]               = useState(false)
  const [feedbackDadoEnSesion, setFeedbackDadoEnSesion] = useState(false)
  const [feedbackUtil, setFeedbackUtil]                 = useState(null)
  const [feedbackComentario, setFeedbackComentario]     = useState('')
  const [enviandoFeedback, setEnviandoFeedback]         = useState(false)
  const [fabPressed, setFabPressed]                     = useState(false)

  // Refs
  const historialRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef  = useRef(null)
  const dragData     = useRef({ dragging: false, startX: 0, startAncho: PANEL_ANCHO_DEFAULT })

  // ── CSS de animación (inyectado una sola vez) ─────────────────────────────────
  useEffect(() => {
    if (document.getElementById('avi-keyframes')) return
    const s = document.createElement('style')
    s.id = 'avi-keyframes'
    s.textContent = `
      @keyframes _avi_bounce {
        0%, 80%, 100% { opacity: 0.25; transform: translateY(0);    }
        40%            { opacity: 1;    transform: translateY(-4px); }
      }
      ._avi_dot {
        display: inline-block; width: 6px; height: 6px;
        border-radius: 50%; background: #999; margin: 0 2px;
        animation: _avi_bounce 1.3s infinite ease-in-out;
      }
      ._avi_dot:nth-child(2) { animation-delay: 0.18s; }
      ._avi_dot:nth-child(3) { animation-delay: 0.36s; }
      .cc-avi-trigger {
        position: relative;
        pointer-events: auto;
        flex-shrink: 0;
      }
      .cc-avi-trigger-btn {
        animation: _avi_trigger_float 3.6s ease-in-out infinite;
      }
      .cc-avi-trigger-btn--pressed,
      .cc-avi-trigger-btn--open {
        animation: none !important;
      }
      @keyframes _avi_trigger_float {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-3px); }
      }
    `
    document.head.appendChild(s)
  }, [])

  // ── GET /avi/status al montar ─────────────────────────────────────────────────
  useEffect(() => {
    const tok = getToken()
    if (!tok) return
    fetch(`${API_BASE}/avi/status`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMensajesRestantes(data.mensajes_restantes_hoy) })
      .catch(() => {})
  }, [])

  // ── Limpiar al cerrar sesión ───────────────────────────────────────────────────
  useEffect(() => {
    if (!usuario) {
      setMensajes([])
      setBienvenidaMostrada(false)
      setBadgeVisible(true)
      setAbierto(false)
      setInput('')
      setImagenPreview(null)
      setImagenBase64(null)
      setMensajesRestantes(null)
      setVistaFeedback(false)
      setFeedbackDadoEnSesion(false)
      setFeedbackUtil(null)
      setFeedbackComentario('')
    }
  }, [usuario])

  // ── Escape cierra el panel ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!abierto) return
    const handler = e => { if (e.key === 'Escape') handleCerrarPanel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, mensajes, feedbackDadoEnSesion])

  // ── Auto-scroll al último mensaje ──────────────────────────────────────────────
  useEffect(() => {
    if (historialRef.current) {
      historialRef.current.scrollTop = historialRef.current.scrollHeight
    }
  }, [mensajes, enviando])

  // ── Foco al textarea al abrir ──────────────────────────────────────────────────
  useEffect(() => {
    if (abierto && !vistaFeedback) {
      setTimeout(() => textareaRef.current?.focus(), 60)
    }
  }, [abierto, vistaFeedback])

  // ── Resize: listeners globales de arrastre ─────────────────────────────────────
  useEffect(() => {
    function onMouseMove(e) {
      if (!dragData.current.dragging) return
      const dx = dragData.current.startX - e.clientX
      const nuevoAncho = Math.min(
        PANEL_ANCHO_MAX,
        Math.max(PANEL_ANCHO_MIN, dragData.current.startAncho + dx)
      )
      setPanelAncho(nuevoAncho)
    }
    function onMouseUp() {
      if (dragData.current.dragging) {
        dragData.current.dragging = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // ── Abrir panel ───────────────────────────────────────────────────────────────
  function handleAbrirPanel() {
    setAbierto(true)
    setBadgeVisible(false)
    if (!bienvenidaMostrada) {
      setMensajes([{
        id: generarId(), role: 'avi', content: BIENVENIDA_TEXTO,
        esLocal: true, esError: false, colorFondo: null, imagen: null,
      }])
      setBienvenidaMostrada(true)
    }
  }

  // ── Cerrar panel: decide si mostrar encuesta o cerrar directo ──────────────────
  function handleCerrarPanel() {
    const hayConversacionReal = mensajes.some(m => !m.esLocal)
    if (!hayConversacionReal || feedbackDadoEnSesion) {
      setAbierto(false)
      setVistaFeedback(false)
      return
    }
    setVistaFeedback(true)
  }

  // ── Enviar encuesta y cerrar ───────────────────────────────────────────────────
  async function handleEnviarFeedback() {
    setEnviandoFeedback(true)
    try {
      await fetch(`${API_BASE}/avi/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          util: feedbackUtil ?? false,
          comentario: feedbackComentario.trim() || null,
          modulo: moduloActivo || 'general',
        }),
      })
    } catch { /* best-effort */ }
    finally { setEnviandoFeedback(false) }
    setFeedbackDadoEnSesion(true)
    setVistaFeedback(false)
    setAbierto(false)
    setFeedbackUtil(null)
    setFeedbackComentario('')
  }

  // ── Selección de imagen ────────────────────────────────────────────────────────
  async function aplicarImagenAdjunta(file) {
    if (!file) return
    setImagenError('')
    try {
      const dataUrl = await comprimirImagenADataUrl(file)
      const b64 = base64DesdeDataUrl(dataUrl)
      const approxBytes = Math.ceil(b64.length * 3 / 4)
      if (approxBytes > MAX_IMAGEN_BYTES) {
        setImagenError('La imagen supera 4 MB incluso comprimida. Usa una captura más pequeña.')
        return
      }
      setImagenPreview(dataUrl)
      setImagenBase64(b64)
    } catch {
      setImagenError('No se pudo procesar la imagen.')
    }
  }

  function handleSeleccionarImagen(e) {
    const file = e.target.files?.[0]
    if (!file) return
    void aplicarImagenAdjunta(file)
    e.target.value = ''
  }

  function handleQuitarImagen() {
    setImagenPreview(null)
    setImagenBase64(null)
    setImagenError('')
  }

  // ── Pegar imagen desde el portapapeles (Ctrl+V en el textarea) ───────────────
  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    // Buscar el primer ítem de tipo imagen
    let imageItem = null
    for (const item of items) {
      if (item.type.startsWith('image/')) { imageItem = item; break }
    }
    // Sin imagen en el clipboard → dejar comportamiento normal del paste
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    void aplicarImagenAdjunta(file)
  }

  // ── Construir historial para la API ───────────────────────────────────────────
  function buildHistorialApi() {
    return mensajes
      .filter(m => !m.esLocal && !m.esError)
      .slice(-10)
      .map(m => ({ role: m.role === 'avi' ? 'assistant' : 'user', content: m.content }))
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────────────────
  const handleEnviar = useCallback(async () => {
    const texto = input.trim()
    if ((!texto && !imagenBase64) || enviando) return

    const historialParaApi = buildHistorialApi()
    const imagenParaApi    = imagenBase64
    const imagenParaShow   = imagenPreview

    setMensajes(prev => [...prev, {
      id: generarId(), role: 'user',
      content: texto || '(imagen adjunta)',
      esLocal: false, esError: false, colorFondo: null,
      imagen: imagenParaShow,
    }])
    setInput('')
    setImagenPreview(null)
    setImagenBase64(null)
    setImagenError('')
    setEnviando(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const resp = await fetch(`${API_BASE}/avi/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          mensaje: texto || '(imagen adjunta)',
          modulo_actual: moduloActivo || 'general',
          historial: historialParaApi,
          imagen_base64: imagenParaApi || null,
        }),
      })
      const data = await resp.json().catch(() => ({}))

      if (resp.ok) {
        setMensajesRestantes(data.mensajes_restantes_hoy ?? null)
        setMensajes(prev => [...prev, {
          id: generarId(), role: 'avi', content: data.respuesta || '',
          esLocal: false, esError: false, colorFondo: null, imagen: null,
        }])
      } else if (resp.status === 429) {
        setMensajesRestantes(0)
        setMensajes(prev => [...prev, {
          id: generarId(), role: 'avi',
          content: data.detail || 'Hoy ya usaste todas tus consultas. Mañana tienes más cupo.',
          esLocal: false, esError: true, colorFondo: '#fff3cd', imagen: null,
        }])
      } else {
        setMensajes(prev => [...prev, {
          id: generarId(), role: 'avi',
          content: data.detail || 'Clara no está disponible en este momento. Intenta en un momentico.',
          esLocal: false, esError: true, colorFondo: '#f8d7da', imagen: null,
        }])
      }
    } catch {
      setMensajes(prev => [...prev, {
        id: generarId(), role: 'avi',
        content: 'No me pude conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
        esLocal: false, esError: true, colorFondo: '#f8d7da', imagen: null,
      }])
    } finally {
      setEnviando(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, imagenBase64, imagenPreview, enviando, moduloActivo, mensajes])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }
  }

  const puedEnviar = (input.trim().length > 0 || !!imagenBase64) && !enviando

  const renderTrigger = useCallback((t) => {
    const title = abierto ? 'Cerrar chat con Clara' : 'Abrir asistente Clara — ayuda con ClaraCore'
    const primary = t?.primary || '#0077B6'
    const bg = t?.bgCard || t?.bg || '#f3f4f6'
    const textColor = t?.text || '#1e293b'
    const borderColor = abierto ? '#00B4C6' : primary

    return (
      <div className="cc-avi-trigger" style={{ position: 'relative' }}>
        <button
          type="button"
          className={`cc-avi-trigger-btn${fabPressed ? ' cc-avi-trigger-btn--pressed' : ''}${abierto ? ' cc-avi-trigger-btn--open' : ''}`}
          onClick={abierto ? handleCerrarPanel : handleAbrirPanel}
          onMouseDown={() => setFabPressed(true)}
          onMouseUp={() => setFabPressed(false)}
          onMouseLeave={() => setFabPressed(false)}
          aria-label={title}
          aria-expanded={abierto}
          title={title}
          style={{
            background: bg,
            color: textColor,
            border: `2px solid ${borderColor}`,
            borderRadius: '999px',
            padding: '6px 16px 6px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            minHeight: '36px',
            fontSize: 'var(--cc-sm)',
            fontWeight: '700',
            letterSpacing: '0.02em',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            transform: fabPressed ? 'scale(0.98) translateY(1px)' : undefined,
            transition: 'transform 0.12s ease, box-shadow 0.2s ease, border-color 0.15s ease',
            boxShadow: abierto
              ? `0 8px 22px rgba(0,119,182,0.2), 0 4px 10px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.65)`
              : `0 6px 18px rgba(0,0,0,0.1), 0 3px 8px rgba(0,119,182,0.14), inset 0 1px 0 rgba(255,255,255,0.55)`,
          }}
        >
          <span aria-hidden style={{ position: 'relative', width: '26px', height: '26px', display: 'block', flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 40 40" style={{ display: 'block' }}>
              <defs>
                <clipPath id="aviHeaderLogoClip">
                  <circle cx="20" cy="20" r="18" />
                </clipPath>
              </defs>
              <image
                href="/favicon.png?v=3"
                x="2"
                y="2"
                width="36"
                height="36"
                clipPath="url(#aviHeaderLogoClip)"
                preserveAspectRatio="xMidYMid slice"
              />
            </svg>
            <span
              style={{
                position: 'absolute', bottom: '-2px', right: '-3px',
                width: '13px', height: '13px', borderRadius: '50%',
                background: '#00B4C6',
                border: '1.5px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,50,90,0.35)',
                pointerEvents: 'none',
              }}
            >
              <i className="ti ti-robot" style={{ fontSize: '9px', color: '#fff', lineHeight: 1 }} />
            </span>
          </span>
          <span>Asistente</span>
        </button>
        {badgeVisible && !abierto && (
          <span style={{
            position: 'absolute', top: '-3px', right: '-3px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#E53E3E', color: '#fff', fontSize: '10px',
            fontWeight: '700', display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: '2px solid #fff',
            lineHeight: 1, pointerEvents: 'none',
            boxShadow: '0 1px 6px rgba(229,62,62,0.45)',
          }}>
            1
          </span>
        )}
      </div>
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, fabPressed, badgeVisible, handleAbrirPanel, handleCerrarPanel])

  const panel = (
      <div
        role="complementary"
        aria-label="Clara — Asistente ClaraCore"
        aria-hidden={!abierto}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: `${panelAncho}px`, maxWidth: '100vw',
          zIndex: 100040, background: '#fff',
          boxShadow: '-4px 0 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transform: abierto ? 'translateX(0)' : 'translateX(100%)',
          transition: dragData.current.dragging
            ? 'none'
            : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          fontFamily: "'Segoe UI', sans-serif",
          pointerEvents: abierto ? 'auto' : 'none',
        }}
      >
        {/* ── Borde de redimensionado ──────────────────────────────────────────── */}
        <div
          title="Arrastrar para cambiar el ancho"
          style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', cursor: 'ew-resize', zIndex: 10 }}
          onMouseDown={e => {
            e.preventDefault()
            dragData.current = { dragging: true, startX: e.clientX, startAncho: panelAncho }
            document.body.style.cursor = 'ew-resize'
            document.body.style.userSelect = 'none'
          }}
        />

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div style={{
          background: '#0077B6', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
          flexShrink: 0, userSelect: 'none',
        }}>
          <Bot size={20} color="#fff" aria-hidden />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: '#fff', fontWeight: '700', fontSize: 'var(--cc-md)',
              lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Clara · Asistente ClaraCore
            </div>
            {mensajesRestantes !== null && (
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 'var(--cc-caption)', marginTop: '2px', lineHeight: 1 }}>
                {mensajesRestantes} consulta{mensajesRestantes !== 1 ? 's' : ''} disponible{mensajesRestantes !== 1 ? 's' : ''} hoy
              </div>
            )}
          </div>
          <button
            onClick={handleCerrarPanel}
            aria-label="Cerrar Clara"
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px',
              cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.30)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          >
            <X size={18} color="#fff" aria-hidden />
          </button>
        </div>

        {/* ── Cuerpo del panel (feedback o historial+footer) ─────────────────── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {vistaFeedback ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '32px 24px', gap: '20px',
          }}>
            <div style={{ fontSize: 'var(--cc-h2)', fontWeight: '700', color: '#1a1a2e', textAlign: 'center', lineHeight: 1.4 }}>
              ¿Clara te fue útil hoy? 🙂
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              {[{ value: true, emoji: '👍', label: 'Sí' }, { value: false, emoji: '👎', label: 'No' }].map(({ value, emoji, label }) => (
                <button
                  key={String(value)}
                  onClick={() => setFeedbackUtil(value)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    width: '90px', padding: '16px 12px', borderRadius: '14px',
                    border: `2px solid ${feedbackUtil === value ? '#0077B6' : '#ddd'}`,
                    background: feedbackUtil === value ? '#e8f4fd' : '#f9f9f9',
                    cursor: 'pointer', fontSize: 'var(--cc-h1)',
                    color: feedbackUtil === value ? '#0077B6' : '#555',
                    transition: 'all 0.15s',
                  }}
                >
                  <span role="img" aria-label={label}>{emoji}</span>
                  <span style={{ fontSize: 'var(--cc-sm)', fontWeight: '700' }}>{label}</span>
                </button>
              ))}
            </div>
            <div style={{ width: '100%' }}>
              <textarea
                value={feedbackComentario}
                onChange={e => setFeedbackComentario(e.target.value.slice(0, 500))}
                placeholder="¿Algún comentario o sugerencia? (opcional)"
                rows={3}
                style={{
                  width: '100%', resize: 'none', border: '1px solid #ddd',
                  borderRadius: '10px', padding: '10px 12px', fontSize: 'var(--cc-input)',
                  fontFamily: "'Segoe UI', sans-serif", lineHeight: 1.45,
                  outline: 'none', boxSizing: 'border-box', display: 'block',
                }}
                onFocus={e => e.target.style.borderColor = '#0077B6'}
                onBlur={e => e.target.style.borderColor = '#ddd'}
              />
              <div style={{ fontSize: 'var(--cc-caption)', color: '#aaa', textAlign: 'right', marginTop: '4px' }}>
                {feedbackComentario.length}/500
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                onClick={() => { setVistaFeedback(false); setAbierto(false) }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #ddd',
                  background: '#f5f5f5', color: '#555', fontSize: 'var(--cc-sm)', cursor: 'pointer', fontWeight: '600',
                }}
              >
                Cerrar sin responder
              </button>
              <button
                onClick={handleEnviarFeedback}
                disabled={feedbackUtil === null || enviandoFeedback}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                  background: feedbackUtil !== null ? '#0077B6' : '#c8d6e0',
                  color: '#fff', fontSize: 'var(--cc-sm)',
                  cursor: feedbackUtil !== null ? 'pointer' : 'not-allowed',
                  fontWeight: '700', transition: 'background 0.15s',
                }}
              >
                {enviandoFeedback ? 'Enviando...' : 'Enviar y cerrar'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* ── Área de historial (burbujas) ─────────────────────────────────── */}
            <div
              ref={historialRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {mensajes.map(msg => {
                const esUsuario = msg.role === 'user'
                const alinear = esUsuario ? 'flex-end' : 'flex-start'
                const fondo = msg.esError
                  ? (msg.colorFondo || '#f8d7da')
                  : esUsuario
                    ? '#0077B6'
                    : '#f0f0f0'
                const color = (esUsuario && !msg.esError) ? '#fff' : '#333'
                const radio = esUsuario ? '16px 16px 4px 16px' : '16px 16px 16px 4px'

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: alinear,
                      gap: '6px',
                      width: '100%',
                    }}
                  >
                    {esUsuario && msg.imagen && (
                      <img
                        src={msg.imagen}
                        alt="Imagen adjunta"
                        style={{
                          maxWidth: '160px',
                          borderRadius: '8px',
                          border: '2px solid #0077B6',
                          display: 'block',
                        }}
                      />
                    )}
                    <div style={{
                      maxWidth: '92%',
                      padding: '9px 13px',
                      borderRadius: radio,
                      background: fondo,
                      color,
                      fontSize: 'var(--cc-sm)',
                      lineHeight: 1.55,
                      wordBreak: 'break-word',
                    }}>
                      {msg.role === 'avi' ? parseMarkdown(msg.content) : msg.content}
                    </div>
                  </div>
                )
              })}

              {enviando && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{
                    maxWidth: '92%',
                    padding: '9px 13px',
                    borderRadius: '16px 16px 16px 4px',
                    background: '#f0f0f0',
                    color: '#666',
                    fontSize: 'var(--cc-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}>
                    <span style={{ marginRight: '6px' }}>Clara está escribiendo</span>
                    <span className="_avi_dot" aria-hidden />
                    <span className="_avi_dot" aria-hidden />
                    <span className="_avi_dot" aria-hidden />
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <div style={{
              borderTop: '1px solid #e8e8e8',
              padding: '8px 10px',
              flexShrink: 0,
              background: '#fff',
            }}>
              {imagenPreview && (
                <div style={{ marginBottom: '6px', position: 'relative', display: 'inline-block' }}>
                  <img
                    src={imagenPreview}
                    alt="Vista previa"
                    style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #0077B6', display: 'block' }}
                  />
                  <button
                    onClick={handleQuitarImagen}
                    aria-label="Quitar imagen adjunta"
                    style={{
                      position: 'absolute', top: '-5px', right: '-5px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: '#E53E3E', border: '2px solid #fff',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <X size={9} color="#fff" aria-hidden />
                  </button>
                </div>
              )}

              {imagenError && (
                <div style={{ fontSize: 'var(--cc-caption)', color: '#c53030', marginBottom: '6px', lineHeight: 1.4 }}>
                  {imagenError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Adjuntar imagen (máximo 4 MB)"
                  title="Adjuntar imagen (máx. 4 MB)"
                  style={{
                    background: 'none', border: '1px solid #ddd', borderRadius: '8px',
                    cursor: 'pointer', padding: '7px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', color: '#666',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#0077B6'; e.currentTarget.style.color = '#0077B6' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#ddd';    e.currentTarget.style.color = '#666' }}
                >
                  <Paperclip size={15} aria-hidden />
                </button>

                <input
                  ref={fileInputRef}
                  type="file" accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleSeleccionarImagen}
                  aria-hidden
                />

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pregúntale a Clara sobre ClaraCore..."
                  rows={1}
                  aria-label="Escribe tu mensaje para Clara"
                  style={{
                    flex: 1, resize: 'none', border: '1px solid #ddd', borderRadius: '8px',
                    padding: '7px 10px', fontSize: 'var(--cc-input)', fontFamily: "'Segoe UI', sans-serif",
                    lineHeight: 1.45, outline: 'none', maxHeight: '96px', overflowY: 'auto',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#0077B6'}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                  onPaste={handlePaste}
                  onInput={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
                  }}
                />

                <button
                  onClick={handleEnviar}
                  disabled={!puedEnviar}
                  aria-label="Enviar mensaje"
                  style={{
                    background: puedEnviar ? '#0077B6' : '#c8d6e0',
                    border: 'none', borderRadius: '8px', cursor: puedEnviar ? 'pointer' : 'not-allowed',
                    padding: '7px', flexShrink: 0, display: 'flex', alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                >
                  <Send size={15} color="#fff" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
  )

  if (!usuario) return children ?? null

  return (
    <AviContext.Provider value={{ renderTrigger }}>
      {children}
      {typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </AviContext.Provider>
  )
}
