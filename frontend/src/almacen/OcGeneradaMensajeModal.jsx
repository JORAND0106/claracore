import { useEffect, useMemo, useState } from 'react'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'
import {
  asuntoInicialOc,
  avisosEnvioOc,
  etiquetasInicialesOc,
  mensajeInicialOc,
} from './ocGeneradaMensaje'

/**
 * Aviso interno al generar la OC. Se puede cerrar sin enviar; la orden ya quedó creada.
 * Destinatarios: usuarios con acceso a Almacén en el contrato.
 */
export default function OcGeneradaMensajeModal({
  solicitudId,
  sol,
  ocs = [],
  envios = [],
  onClose,
  onEnviado,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [destinatarios, setDestinatarios] = useState([])
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState([])
  const [etiquetas, setEtiquetas] = useState(() => etiquetasInicialesOc(sol, ocs))
  const [etiquetaNueva, setEtiquetaNueva] = useState('')
  const [asunto, setAsunto] = useState(() => asuntoInicialOc(sol, ocs))
  const [mensaje, setMensaje] = useState(() => mensajeInicialOc(sol, ocs))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [enviosLocal, setEnviosLocal] = useState(envios)
  const [correos, setCorreos] = useState({})
  const [reintentando, setReintentando] = useState(null)

  const avisos = useMemo(() => avisosEnvioOc(enviosLocal), [enviosLocal])
  const pendientes = useMemo(
    () => (enviosLocal || []).filter((e) => e && e.resultado !== 'enviado' && e.orden_compra_id),
    [enviosLocal],
  )

  const reenviar = async (envio) => {
    const id = envio.orden_compra_id
    if (!id) return
    setReintentando(id)
    setError('')
    try {
      const correo = (correos[id] || '').trim()
      const r = await api.reenviarOcCorreo(id, correo ? { correo } : {})
      setEnviosLocal((prev) => prev.map((e) => (
        e.orden_compra_id === id ? { ...e, ...r } : e
      )))
    } catch (e) {
      setError(e.message || 'No se pudo reenviar. La orden de compra sigue generada.')
    } finally {
      setReintentando(null)
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      api.buscarDestinatariosMensaje(q.trim())
        .then((data) => setOpciones(Array.isArray(data?.items) ? data.items : []))
        .catch(() => setOpciones([]))
    }, 200)
    return () => clearTimeout(handle)
  }, [api, q])

  const agregarDest = (u) => {
    if (!u?.id) return
    setDestinatarios((prev) => (prev.some((d) => d.id === u.id) ? prev : [...prev, u]))
    setQ('')
  }

  const agregarEtiqueta = () => {
    const txt = etiquetaNueva.trim()
    if (!txt) return
    setEtiquetas((prev) => (prev.includes(txt) ? prev : [...prev, txt]))
    setEtiquetaNueva('')
  }

  const enviar = async () => {
    const texto = mensaje.trim()
    if (!texto || !destinatarios.length || !solicitudId) {
      setError('Indique al menos un destinatario y el mensaje.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.enviarMensajeSolicitud(solicitudId, {
        texto,
        asunto: asunto.trim(),
        linea_etiqueta: etiquetas.join(' · '),
        destinatario_ids: destinatarios.map((d) => d.id),
      })
      onEnviado?.()
      onClose?.()
    } catch (e) {
      setError(e.message || 'No se pudo enviar el mensaje. La orden de compra sigue generada.')
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

  return (
    <div
      data-testid="oc-generada-mensaje"
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
        if (!busy) onClose?.()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oc-generada-titulo"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ui.card,
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div id="oc-generada-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)' }}>
            Avisar que la OC fue generada
          </div>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => onClose?.()} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
          La orden ya quedó generada. Puede cerrar este aviso sin enviar el mensaje.
        </div>
        {avisos.length > 0 && (
          <div
            data-testid="oc-envio-pendiente"
            style={{
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 8,
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              color: '#92400e',
              fontSize: 'var(--cc-sm)',
              lineHeight: 1.45,
            }}
          >
            {avisos.map((t) => (
              <div key={t}>{t}</div>
            ))}
            {pendientes.map((envio) => (
              <div key={envio.orden_compra_id} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input
                  style={{ ...ui.input, flex: 1, minWidth: 180, color: ui.text }}
                  value={correos[envio.orden_compra_id] || ''}
                  placeholder="Corregir correo y reintentar"
                  aria-label={`Correo de la OC ${envio.numero_oc || envio.orden_compra_id}`}
                  disabled={busy || reintentando != null}
                  onChange={(e) => setCorreos((prev) => ({ ...prev, [envio.orden_compra_id]: e.target.value }))}
                />
                <button
                  type="button"
                  style={ui.btnSecondary}
                  data-testid="oc-reintentar-correo"
                  disabled={busy || reintentando != null}
                  onClick={() => { void reenviar(envio) }}
                >
                  {reintentando === envio.orden_compra_id ? 'Reintentando…' : 'Reintentar envío'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={label}>DESTINATARIO</div>
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
          style={{ ...ui.input, marginBottom: 6 }}
          value={q}
          placeholder="Buscar por nombre o cargo"
          aria-label="Destinatario"
          disabled={busy}
          onChange={(e) => setQ(e.target.value)}
        />
        {q.trim() && (
          <div style={{ border: `1px solid ${ui.textMuted}33`, borderRadius: 8, marginBottom: 10, maxHeight: 140, overflow: 'auto' }}>
            {opciones.filter((u) => !destinatarios.some((d) => d.id === u.id)).length === 0 ? (
              <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Ningún usuario coincide.</div>
            ) : opciones.filter((u) => !destinatarios.some((d) => d.id === u.id)).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => agregarDest(u)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                  border: 'none', background: 'transparent', cursor: 'pointer', color: ui.text, fontSize: 'var(--cc-sm)',
                }}
              >
                {u.nombre}{u.cargo ? ` · ${u.cargo}` : ''}
              </button>
            ))}
          </div>
        )}

        <div style={label}>ETIQUETA</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {etiquetas.map((et) => (
            <button
              key={et}
              type="button"
              data-testid="oc-etiqueta"
              style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0 }}
              onClick={() => setEtiquetas((prev) => prev.filter((x) => x !== et))}
            >
              {et} ×
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            style={{ ...ui.input, flex: 1 }}
            value={etiquetaNueva}
            placeholder="Agregar otra etiqueta"
            aria-label="Etiqueta"
            disabled={busy}
            onChange={(e) => setEtiquetaNueva(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarEtiqueta() } }}
          />
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={agregarEtiqueta}>
            Agregar
          </button>
        </div>

        <div style={label}>ASUNTO</div>
        <input
          style={{ ...ui.input, marginBottom: 12 }}
          value={asunto}
          aria-label="Asunto"
          disabled={busy}
          onChange={(e) => setAsunto(e.target.value)}
        />

        <div style={label}>MENSAJE</div>
        <textarea
          style={{ ...ui.input, minHeight: 96, marginBottom: 12, width: '100%', boxSizing: 'border-box' }}
          value={mensaje}
          aria-label="Mensaje"
          disabled={busy}
          onChange={(e) => setMensaje(e.target.value)}
        />

        {error && (
          <div style={{ color: '#dc2626', fontSize: 'var(--cc-sm)', marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => onClose?.()}>
            Cerrar
          </button>
          <button type="button" style={ui.btnPrimary} disabled={busy} data-testid="oc-mensaje-enviar" onClick={() => { void enviar() }}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
