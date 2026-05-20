/**
 * AVI — Asistente Virtual Inteligente de ClaraCore.
 *
 * Botón flotante + panel lateral deslizante (redimensionable por el borde izquierdo).
 * Historial de conversación con pares colapsables pregunta/respuesta.
 *
 * Props:
 *   usuario  — objeto de sesión desde App.jsx. Cuando es null (logout) se limpia el historial.
 *
 * Dependencias del proyecto (sin librerías nuevas):
 *   lucide-react  — ya instalado
 *   ModuloContext — frontend/src/context/ModuloContext.jsx
 *   apiBase.js    — API_BASE
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MessageCircle, Bot, X, Send, Paperclip, ChevronDown, ChevronUp } from 'lucide-react'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE } from '../../apiBase'

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

// ── Agrupador de mensajes ─────────────────────────────────────────────────────
// Tipos de grupo:
//   'standalone' — bienvenida (esLocal) o error (esError): siempre visible
//   'pair'       — mensaje usuario + respuesta Clara completa
//   'pending'    — mensaje usuario sin respuesta todavía (Clara escribiendo)
function buildGroups(messages) {
  const groups = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    if (msg.esLocal || msg.esError) {
      groups.push({ type: 'standalone', id: msg.id, msg })
      i++
      continue
    }
    if (msg.role === 'user') {
      const next = messages[i + 1]
      if (next && next.role === 'avi' && !next.esLocal && !next.esError) {
        groups.push({ type: 'pair', id: msg.id, userMsg: msg, aviMsg: next })
        i += 2
      } else {
        groups.push({ type: 'pending', id: msg.id, msg })
        i++
      }
      continue
    }
    // Mensaje avi huérfano (no debería ocurrir en flujo normal)
    groups.push({ type: 'standalone', id: msg.id, msg })
    i++
  }
  return groups
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function AVI({ usuario }) {
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

  // Historial colapsable
  const [expandedItems, setExpandedItems]           = useState(new Set())

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

  // Refs
  const historialRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef  = useRef(null)
  const dragData     = useRef({ dragging: false, startX: 0, startAncho: PANEL_ANCHO_DEFAULT })

  // ── Grupos calculados ─────────────────────────────────────────────────────────
  const grupos = useMemo(() => buildGroups(mensajes), [mensajes])

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
      setExpandedItems(new Set())
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
  }, [mensajes, enviando, expandedItems])

  // ── Foco al textarea al abrir ──────────────────────────────────────────────────
  useEffect(() => {
    if (abierto && !vistaFeedback) {
      setTimeout(() => textareaRef.current?.focus(), 60)
    }
  }, [abierto, vistaFeedback])

  // ── Auto-expandir el par más reciente, colapsar anteriores ────────────────────
  useEffect(() => {
    // Busca el id del último par completo (userMsg seguido de aviMsg)
    let lastPairId = null
    for (let i = mensajes.length - 2; i >= 0; i--) {
      const m = mensajes[i]
      const n = mensajes[i + 1]
      if (m && n &&
          m.role === 'user' && !m.esLocal && !m.esError &&
          n.role === 'avi'  && !n.esLocal && !n.esError) {
        lastPairId = m.id
        break
      }
    }
    if (lastPairId) setExpandedItems(new Set([lastPairId]))
  // Solo reejecutar cuando cambia el tamaño del array (nueva respuesta llegó)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes.length])

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

  // ── Toggle de colapso de un par ────────────────────────────────────────────────
  function toggleExpand(pairId) {
    setExpandedItems(prev => {
      const next = new Set(prev)
      next.has(pairId) ? next.delete(pairId) : next.add(pairId)
      return next
    })
  }

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
  function handleSeleccionarImagen(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImagenError('')
    if (file.size > MAX_IMAGEN_BYTES) {
      setImagenError('La imagen supera 4 MB. Por favor usa una más pequeña.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target.result
      setImagenPreview(dataUrl)
      setImagenBase64(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl)
    }
    reader.readAsDataURL(file)
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
    if (!file) return
    setImagenError('')
    if (file.size > MAX_IMAGEN_BYTES) {
      setImagenError('La imagen supera 4 MB. Por favor usa una más pequeña.')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target.result
      setImagenPreview(dataUrl)
      setImagenBase64(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl)
    }
    reader.readAsDataURL(file)
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

  // ── Estilos reutilizables para pares colapsables ───────────────────────────────
  const pairContainer = {
    border: '1px solid #e4e9ee',
    borderLeft: '3px solid #0077B6',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#fff',
  }

  const pairHeader = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    cursor: 'pointer',
    background: '#f6f9fb',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.12s',
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Botón flotante ──────────────────────────────────────────────────── */}
      <button
        onClick={abierto ? handleCerrarPanel : handleAbrirPanel}
        aria-label="Abrir asistente Clara"
        aria-expanded={abierto}
        style={{
          position: 'fixed', bottom: '28px', right: '28px', zIndex: 9100,
          width: '56px', height: '56px', borderRadius: '50%',
          background: '#0077B6', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,119,182,0.45)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08)'
          e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,119,182,0.60)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,119,182,0.45)'
        }}
      >
        <MessageCircle size={24} color="#fff" aria-hidden />
        {badgeVisible && !abierto && (
          <span style={{
            position: 'absolute', top: '4px', right: '4px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: '#E53E3E', color: '#fff', fontSize: '10px',
            fontWeight: '700', display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: '2px solid #fff',
            lineHeight: 1, pointerEvents: 'none',
          }}>
            1
          </span>
        )}
      </button>

      {/* ── Panel lateral deslizante ─────────────────────────────────────────── */}
      <div
        role="complementary"
        aria-label="Clara — Asistente ClaraCore"
        aria-hidden={!abierto}
        style={{
          position: 'fixed', top: 0, right: 0,
          width: `${panelAncho}px`, maxWidth: '100vw', height: '100dvh',
          zIndex: 9200, background: '#fff',
          boxShadow: '-4px 0 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
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
              color: '#fff', fontWeight: '700', fontSize: '14px',
              lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Clara · Asistente ClaraCore
            </div>
            {mensajesRestantes !== null && (
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: '11px', marginTop: '2px', lineHeight: 1 }}>
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

        {/* ── Vista encuesta de feedback ───────────────────────────────────────── */}
        {vistaFeedback ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '32px 24px', gap: '20px',
          }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', textAlign: 'center', lineHeight: 1.4 }}>
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
                    cursor: 'pointer', fontSize: '28px',
                    color: feedbackUtil === value ? '#0077B6' : '#555',
                    transition: 'all 0.15s',
                  }}
                >
                  <span role="img" aria-label={label}>{emoji}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700' }}>{label}</span>
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
                  borderRadius: '10px', padding: '10px 12px', fontSize: '13px',
                  fontFamily: "'Segoe UI', sans-serif", lineHeight: 1.45,
                  outline: 'none', boxSizing: 'border-box', display: 'block',
                }}
                onFocus={e => e.target.style.borderColor = '#0077B6'}
                onBlur={e => e.target.style.borderColor = '#ddd'}
              />
              <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'right', marginTop: '4px' }}>
                {feedbackComentario.length}/500
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                onClick={() => { setVistaFeedback(false); setAbierto(false) }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #ddd',
                  background: '#f5f5f5', color: '#555', fontSize: '13px', cursor: 'pointer', fontWeight: '600',
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
                  color: '#fff', fontSize: '13px',
                  cursor: feedbackUtil !== null ? 'pointer' : 'not-allowed',
                  fontWeight: '700', transition: 'background 0.15s',
                }}
              >
                {enviandoFeedback ? 'Enviando...' : 'Enviar y cerrar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Área de historial (pares colapsables) ───────────────────────── */}
            <div
              ref={historialRef}
              style={{
                flex: 1, overflowY: 'auto',
                padding: '8px 10px',
                display: 'flex', flexDirection: 'column', gap: '4px',
              }}
            >
              {grupos.map(grupo => {

                /* ─ Standalone: bienvenida o error ─ */
                if (grupo.type === 'standalone') {
                  const msg = grupo.msg
                  return (
                    <div key={grupo.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '92%', padding: '9px 13px',
                        borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: msg.esError ? (msg.colorFondo || '#f8d7da') : msg.role === 'user' ? '#0077B6' : '#f0f0f0',
                        color: (msg.role === 'user' && !msg.esError) ? '#fff' : '#333',
                        fontSize: '13px', lineHeight: 1.55, wordBreak: 'break-word',
                      }}>
                        {msg.role === 'avi' ? parseMarkdown(msg.content) : msg.content}
                      </div>
                    </div>
                  )
                }

                /* ─ Par completo: colapsable ─ */
                if (grupo.type === 'pair') {
                  const isExpanded = expandedItems.has(grupo.id)
                  const { userMsg, aviMsg } = grupo
                  const headerText = userMsg.imagen && !userMsg.content ? '📷 Imagen adjunta' : userMsg.content
                  return (
                    <div key={grupo.id} style={pairContainer}>
                      {/* Cabecera clickeable */}
                      <button
                        onClick={() => toggleExpand(grupo.id)}
                        style={{
                          ...pairHeader,
                          background: isExpanded ? '#eef4f9' : '#f6f9fb',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8f2f8'}
                        onMouseLeave={e => e.currentTarget.style.background = isExpanded ? '#eef4f9' : '#f6f9fb'}
                      >
                        <span style={{ color: '#0077B6', fontSize: '12px', flexShrink: 0, lineHeight: 1 }}>›</span>
                        <span style={{
                          flex: 1, fontSize: '13px', fontWeight: '600', color: '#1a2a3a',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          lineHeight: 1.35,
                        }}>
                          {headerText}
                        </span>
                        {isExpanded
                          ? <ChevronUp size={14} color="#888" style={{ flexShrink: 0 }} aria-hidden />
                          : <ChevronDown size={14} color="#888" style={{ flexShrink: 0 }} aria-hidden />
                        }
                      </button>

                      {/* Respuesta expandible */}
                      <div style={{
                        maxHeight: isExpanded ? '3000px' : '0',
                        overflow: 'hidden',
                        transition: 'max-height 0.22s ease-in-out',
                      }}>
                        <div style={{
                          borderTop: '1px solid #e4e9ee',
                          padding: '8px 12px 10px',
                          fontSize: '13px', lineHeight: 1.55, color: '#333',
                          background: '#fff',
                        }}>
                          {/* Imagen adjunta (si la había en la pregunta) */}
                          {userMsg.imagen && (
                            <img
                              src={userMsg.imagen}
                              alt="Imagen adjunta"
                              style={{ maxWidth: '160px', borderRadius: '6px', marginBottom: '8px', display: 'block' }}
                            />
                          )}
                          {parseMarkdown(aviMsg.content)}
                        </div>
                      </div>
                    </div>
                  )
                }

                /* ─ Pending: pregunta enviada, esperando respuesta ─ */
                if (grupo.type === 'pending') {
                  const { msg } = grupo
                  const headerText = msg.imagen && !msg.content ? '📷 Imagen adjunta' : msg.content
                  return (
                    <div key={grupo.id} style={{ ...pairContainer, borderLeftColor: '#888' }}>
                      {/* Cabecera no interactiva mientras espera */}
                      <div style={{ ...pairHeader, cursor: 'default', background: '#f6f9fb' }}>
                        <span style={{ color: '#888', fontSize: '12px', flexShrink: 0, lineHeight: 1 }}>›</span>
                        <span style={{
                          flex: 1, fontSize: '13px', fontWeight: '600', color: '#1a2a3a',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {headerText}
                        </span>
                      </div>
                      {/* Typing indicator integrado en el par */}
                      {enviando && (
                        <div style={{
                          borderTop: '1px solid #e4e9ee',
                          padding: '8px 12px',
                          display: 'flex', alignItems: 'center', gap: '2px',
                          background: '#fff',
                        }}>
                          <span style={{ fontSize: '11px', color: '#888', marginRight: '6px' }}>
                            Clara está escribiendo
                          </span>
                          <span className="_avi_dot" aria-hidden />
                          <span className="_avi_dot" aria-hidden />
                          <span className="_avi_dot" aria-hidden />
                        </div>
                      )}
                    </div>
                  )
                }

                return null
              })}
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
                <div style={{ fontSize: '12px', color: '#c53030', marginBottom: '6px', lineHeight: 1.4 }}>
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
                    padding: '7px 10px', fontSize: '13px', fontFamily: "'Segoe UI', sans-serif",
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
          </>
        )}
      </div>
    </>
  )
}
