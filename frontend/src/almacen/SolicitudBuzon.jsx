import { useEffect, useMemo, useState } from 'react'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

function fmtCuando(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Buzón de una solicitud. Ver exige Almacén · ver (el padre no lo monta si no).
 * Enviar exige Crear. Los mensajes enviados no se editan ni se borran.
 */
export default function SolicitudBuzon({
  solicitudId,
  items = [],
  puedeEnviar = false,
  noLeidosInicial = 0,
  onNoLeidos,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [mensajes, setMensajes] = useState([])
  const [noLeidos, setNoLeidos] = useState(Number(noLeidosInicial) || 0)
  const [disponible, setDisponible] = useState(true)
  const [texto, setTexto] = useState('')
  const [lineaId, setLineaId] = useState('')
  const [q, setQ] = useState('')
  const [opciones, setOpciones] = useState([])
  const [destinatarios, setDestinatarios] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(true)

  const lineas = useMemo(() => (items || []).filter((it) => it?.id != null), [items])

  const cargar = () => {
    if (!solicitudId) return Promise.resolve()
    return api.listMensajesSolicitud(solicitudId)
      .then((data) => {
        setMensajes(Array.isArray(data?.items) ? data.items : [])
        setDisponible(data?.disponible !== false)
        const n = Number(data?.mensajes_no_leidos) || 0
        setNoLeidos(n)
        onNoLeidos?.(n)
      })
      .catch((e) => setError(e.message || 'No se pudo cargar el buzón.'))
  }

  useEffect(() => {
    void cargar()
  }, [solicitudId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!puedeEnviar) return undefined
    const handle = setTimeout(() => {
      api.buscarDestinatariosMensaje(q.trim())
        .then((data) => setOpciones(Array.isArray(data?.items) ? data.items : []))
        .catch(() => setOpciones([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [q, puedeEnviar, api])

  const agregar = (u) => {
    if (!u?.id) return
    setDestinatarios((prev) => (prev.some((d) => d.id === u.id) ? prev : [...prev, u]))
    setQ('')
  }

  const enviar = async () => {
    const limpio = texto.trim()
    if (!limpio || !destinatarios.length) return
    setBusy(true)
    setError('')
    try {
      await api.enviarMensajeSolicitud(solicitudId, {
        texto: limpio,
        destinatario_ids: destinatarios.map((d) => d.id),
        solicitud_item_id: lineaId ? Number(lineaId) : null,
      })
      setTexto('')
      setLineaId('')
      setDestinatarios([])
      await cargar()
    } catch (e) {
      setError(e.message || 'No se pudo enviar el mensaje.')
    } finally {
      setBusy(false)
    }
  }

  const aviso = noLeidos > 0
    ? `${noLeidos} sin leer`
    : ''

  return (
    <section style={{ marginTop: 18 }} data-testid="solicitud-buzon">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          border: `1px solid ${ui.textMuted}33`,
          borderRadius: 8,
          background: ui.accentSoft,
          cursor: 'pointer',
          color: ui.text,
          textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
          Mensajes de la solicitud
          {aviso && (
            <span
              data-testid="solicitud-buzon-no-leidos"
              style={{
                marginLeft: 8,
                background: '#dc2626',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 'var(--cc-xs)',
                fontWeight: 700,
              }}
            >
              {aviso}
            </span>
          )}
        </span>
        <span style={{ color: ui.textMuted }}>{abierto ? '▾' : '▸'}</span>
      </button>

      {abierto && (
        <div style={{
          marginTop: 8,
          border: `1px solid ${ui.textMuted}33`,
          borderRadius: 8,
          padding: 12,
        }}
        >
          {!disponible && (
            <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
              El buzón todavía no está disponible en este contrato.
            </div>
          )}
          {error && (
            <div style={{ color: '#991b1b', fontSize: 'var(--cc-sm)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
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
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 4 }}>
                Destinatarios con acceso a Almacén
              </div>
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
                disabled={busy}
                onChange={(e) => setQ(e.target.value)}
              />
              {q.trim() && opciones.length > 0 && (
                <div style={{
                  border: `1px solid ${ui.textMuted}33`,
                  borderRadius: 8,
                  marginBottom: 8,
                  maxHeight: 160,
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
              <label style={{ display: 'block', fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 6 }}>
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
              <textarea
                style={{ ...ui.input, minHeight: 72, width: '100%', boxSizing: 'border-box' }}
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
                  {busy ? 'Enviando…' : 'Enviar mensaje'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
