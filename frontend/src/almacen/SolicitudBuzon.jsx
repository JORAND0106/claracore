import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

function fmtCuando(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Botón Mensajes y popup de la conversación.
 * Ver exige Almacén · ver. Enviar exige Crear.
 * Los mensajes enviados no se editan ni se borran.
 */
export default function SolicitudBuzon({
  solicitudId,
  consecutivo,
  titulo = '',
  items = [],
  puedeEnviar = false,
  noLeidosInicial = 0,
  onNoLeidos,
  onOpenChange,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [noLeidos, setNoLeidos] = useState(Number(noLeidosInicial) || 0)
  const [disponible, setDisponible] = useState(true)
  const [texto, setTexto] = useState('')
  const [asunto, setAsunto] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [lineaId, setLineaId] = useState('')
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState([])
  const [destinatarios, setDestinatarios] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [avisoPendiente, setAvisoPendiente] = useState(null)

  const lineas = useMemo(() => (items || []).filter((it) => it?.id != null), [items])
  const etiquetaSolicitud = useMemo(() => {
    const num = consecutivo != null && consecutivo !== '' ? `Solicitud #${consecutivo}` : 'Solicitud'
    const nombre = String(titulo || '').trim()
    return nombre && nombre !== num ? `${num} · ${nombre}` : num
  }, [consecutivo, titulo])

  useEffect(() => {
    onOpenChange?.(abierto)
  }, [abierto, onOpenChange])

  useEffect(() => {
    setNoLeidos(Number(noLeidosInicial) || 0)
  }, [noLeidosInicial])

  const cargar = () => {
    if (!solicitudId) return Promise.resolve()
    return api.listMensajesSolicitud(solicitudId)
      .then((data) => {
        const itemsMsg = Array.isArray(data?.items) ? data.items : []
        setMensajes(itemsMsg)
        setDisponible(data?.disponible !== false)
        const n = Number(data?.mensajes_no_leidos) || 0
        setNoLeidos(n)
        onNoLeidos?.(n)
        const pendiente = itemsMsg.find((m) => (m.avisos_pendientes || []).length > 0)
        if (pendiente) {
          setAvisoPendiente({
            id: pendiente.id,
            fallidos: pendiente.avisos_pendientes,
          })
        }
      })
      .catch((e) => setError(e.message || 'No se pudo cargar los mensajes.'))
  }

  useEffect(() => {
    if (!abierto) return undefined
    setEtiqueta(etiquetaSolicitud)
    void cargar()
    return undefined
  }, [abierto, solicitudId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!puedeEnviar || !abierto) return undefined
    const handle = setTimeout(() => {
      api.buscarDestinatariosMensaje(q.trim())
        .then((data) => setOpciones(Array.isArray(data?.items) ? data.items : []))
        .catch(() => setOpciones([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [q, puedeEnviar, abierto, api])

  const agregar = (u) => {
    if (!u?.id) return
    setDestinatarios((prev) => (prev.some((d) => d.id === u.id) ? prev : [...prev, u]))
    setQ('')
  }

  const enviar = async () => {
    const limpio = texto.trim()
    if (!limpio || !destinatarios.length) {
      setError('Indique al menos un destinatario y el mensaje.')
      return
    }
    setBusy(true)
    setError('')
    setAvisoPendiente(null)
    try {
      const r = await api.enviarMensajeSolicitud(solicitudId, {
        texto: limpio,
        asunto: asunto.trim(),
        linea_etiqueta: etiqueta.trim() || etiquetaSolicitud,
        destinatario_ids: destinatarios.map((d) => d.id),
        solicitud_item_id: lineaId ? Number(lineaId) : null,
      })
      const fallidos = Array.isArray(r?.avisos_fallidos) ? r.avisos_fallidos : []
      setTexto('')
      setAsunto('')
      setLineaId('')
      setDestinatarios([])
      if (fallidos.length) {
        setAvisoPendiente({ id: r.id, fallidos })
        const quienes = fallidos.map((f) => f.nombre || `Usuario #${f.id}`).join(', ')
        setError(`El mensaje quedó enviado, pero no se pudo avisar a ${quienes}. Use Reintentar aviso.`)
      }
      await cargar()
    } catch (e) {
      setError(e.message || 'No se pudo enviar el mensaje. Nadie recibió el aviso.')
    } finally {
      setBusy(false)
    }
  }

  const reintentar = async () => {
    if (!avisoPendiente?.id) return
    setBusy(true)
    setError('')
    try {
      const ids = (avisoPendiente.fallidos || []).map((f) => f.id).filter(Boolean)
      const r = await api.reintentarAvisoMensaje(solicitudId, avisoPendiente.id, {
        destinatario_ids: ids,
      })
      const fallidos = Array.isArray(r?.avisos_fallidos) ? r.avisos_fallidos : []
      if (fallidos.length) {
        setAvisoPendiente({ id: avisoPendiente.id, fallidos })
        const quienes = fallidos.map((f) => f.nombre || `Usuario #${f.id}`).join(', ')
        setError(`Sigue sin poder avisarse a ${quienes}. Intente de nuevo.`)
      } else {
        setAvisoPendiente(null)
      }
      await cargar()
    } catch (e) {
      setError(e.message || 'No se pudo reintentar el aviso.')
    } finally {
      setBusy(false)
    }
  }

  const label = {
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: ui.textMuted,
    marginBottom: 6,
  }

  const popup = abierto ? createPortal(
    <div
      data-testid="solicitud-mensajes-popup"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100060,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!busy) setAbierto(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitud-mensajes-titulo"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ui.card,
          width: 'min(640px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div id="solicitud-mensajes-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)' }}>
            Mensajes
          </div>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => setAbierto(false)} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
          {etiquetaSolicitud}. Los mensajes enviados no se editan ni se borran.
        </div>

        {!disponible && (
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
            Los mensajes todavía no están disponibles en este contrato.
          </div>
        )}
        {error && (
          <div style={{ color: '#991b1b', fontSize: 'var(--cc-sm)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
            {error}
            {avisoPendiente?.id && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  data-testid="solicitud-mensajes-reintentar"
                  style={ui.btnSecondary}
                  disabled={busy}
                  onClick={() => { void reintentar() }}
                >
                  Reintentar aviso
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {mensajes.length === 0 && (
            <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
              Aún no hay mensajes en esta solicitud.
            </div>
          )}
          {mensajes.map((m) => (
            <article
              key={m.id}
              style={{
                border: `1px solid ${ui.textMuted}22`,
                borderRadius: 8,
                padding: '8px 10px',
                background: m.es_destinatario && !m.leido_para_mi ? '#eff6ff' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 'var(--cc-sm)' }}>{m.remitente_nombre || 'Usuario'}</strong>
                <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{fmtCuando(m.created_at)}</span>
              </div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                Para: {(m.destinatarios || []).map((d) => d.nombre).filter(Boolean).join(', ') || '—'}
                {m.es_destinatario && (
                  <span style={{ marginLeft: 8, fontWeight: 700, color: m.leido_para_mi ? '#065f46' : '#b45309' }}>
                    {m.leido_para_mi ? 'Leído' : 'Sin leer'}
                  </span>
                )}
              </div>
              {m.linea_etiqueta && (
                <div style={{ fontSize: 'var(--cc-xs)', marginTop: 4, color: '#1e3a8a' }}>
                  {m.linea_etiqueta}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 'var(--cc-sm)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                {m.texto}
              </div>
            </article>
          ))}
        </div>

        {puedeEnviar && disponible && (
          <div data-testid="solicitud-buzon-composer">
            <div style={label}>Destinatario</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {destinatarios.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0 }}
                  onClick={() => setDestinatarios((prev) => prev.filter((x) => x.id !== d.id))}
                >
                  {d.nombre}{d.cargo ? ` · ${d.cargo}` : ''} ×
                </button>
              ))}
            </div>
            <input
              style={{ ...ui.input, marginBottom: 10 }}
              value={q}
              placeholder="Buscar por nombre o cargo"
              disabled={busy}
              onChange={(e) => setQ(e.target.value)}
            />
            {q.trim() && opciones.length > 0 && (
              <div style={{
                border: `1px solid ${ui.textMuted}33`,
                borderRadius: 8,
                marginBottom: 10,
                maxHeight: 140,
                overflow: 'auto',
              }}
              >
                {opciones.filter((u) => !destinatarios.some((d) => d.id === u.id)).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => agregar(u)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: ui.text,
                      fontSize: 'var(--cc-sm)',
                    }}
                  >
                    {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
                  </button>
                ))}
              </div>
            )}
            <label style={{ display: 'block', marginBottom: 10 }}>
              <div style={label}>Etiqueta</div>
              <input
                style={ui.input}
                value={etiqueta}
                disabled={busy}
                onChange={(e) => setEtiqueta(e.target.value)}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <div style={label}>Asunto</div>
              <input
                style={ui.input}
                value={asunto}
                disabled={busy}
                onChange={(e) => setAsunto(e.target.value)}
              />
            </label>
            <label style={{ display: 'block', fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 10 }}>
              Línea (opcional)
              <select
                style={{ ...ui.input, marginTop: 4 }}
                value={lineaId}
                disabled={busy}
                onChange={(e) => setLineaId(e.target.value)}
              >
                <option value="">Sin línea concreta</option>
                {lineas.map((it) => {
                  const n = it.numero_linea ?? ''
                  const desc = String(it.descripcion_solicitada || it.material_descripcion || '').trim()
                  return (
                    <option key={it.id} value={it.id}>
                      {n ? `Línea ${n}` : `Línea ${it.id}`}{desc ? `: ${desc.slice(0, 80)}` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <div style={label}>Mensaje</div>
            <textarea
              style={{ ...ui.input, minHeight: 88, width: '100%', boxSizing: 'border-box' }}
              value={texto}
              disabled={busy}
              placeholder="Escriba el mensaje. No se puede editar ni borrar después de enviarlo."
              onChange={(e) => setTexto(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                style={ui.btnPrimary}
                disabled={busy || !texto.trim() || destinatarios.length === 0}
                onClick={() => { void enviar() }}
              >
                {busy ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        type="button"
        data-testid="solicitud-mensajes"
        style={{ ...ui.btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        onClick={() => setAbierto(true)}
      >
        Mensajes
        {noLeidos > 0 && (
          <span
            data-testid="solicitud-buzon-no-leidos"
            style={{
              background: '#dc2626',
              color: '#fff',
              borderRadius: 10,
              padding: '1px 7px',
              fontSize: 'var(--cc-xs)',
              fontWeight: 700,
            }}
          >
            {noLeidos}
          </span>
        )}
      </button>
      {popup}
    </>
  )
}
