import { useEffect, useState } from 'react'
import { esDesarrolladorUsuario } from '../../utils/permisosContrato'
import { ESTADOS, ORIGEN_COLOR, fmtFecha } from './seguimientoTheme'

export default function ItemDetalleModal({ t, api, itemId, usuario, permisos, onClose, onChanged }) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comentario, setComentario] = useState('')
  const [justForm, setJustForm] = useState({ motivo: '', nueva_fecha_vencimiento: '' })
  const [pdfUrl, setPdfUrl] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const d = await api.getItem(itemId)
      setItem(d)
      if (d.origen === 'compromiso' && d.acta_id) {
        try {
          const blob = await api.pdfActaBlob(d.acta_id)
          if (pdfUrl) URL.revokeObjectURL(pdfUrl)
          setPdfUrl(URL.createObjectURL(blob))
        } catch { /* preview opcional */ }
      }
    } catch (e) {
      setError(e.message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  if (loading || !item) {
    return (
      <Overlay t={t} onClose={onClose}>
        <div style={{ color: t.textMuted }}>{error || 'Cargando…'}</div>
      </Overlay>
    )
  }

  const origen = ORIGEN_COLOR[item.origen] || ORIGEN_COLOR.tarea
  const esCompromiso = item.origen === 'compromiso'
  const esDev = esDesarrolladorUsuario(usuario)
  const soyResponsable = esDev || Number(item.asignado_a_id) === Number(usuario?.id)
  const soySolicitante = esDev || Number(item.solicitante_id) === Number(usuario?.id)

  return (
    <Overlay t={t} onClose={onClose}>
      <div style={{
        borderLeft: `5px solid ${origen.border}`,
        paddingLeft: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: origen.border }}>{origen.label}</div>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, color: t.text }}>{item.titulo}</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          {item.asignado_a_nombre || '—'} · vence {fmtFecha(item.fecha_vencimiento)} · {item.estado_gestion}
        </div>
      </div>

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', marginBottom: 8 }}>{error}</div>}

      <p style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--cc-body)', color: t.text }}>
        {item.descripcion || 'Sin descripción'}
      </p>

      {permisos?.editar && (
        <div style={{ margin: '10px 0' }}>
          <label style={lbl(t)}>Estado de gestión</label>
          <select
            value={item.estado_gestion}
            onChange={async (e) => {
              try {
                await api.patchEstado(item.id, e.target.value)
                await reload()
                onChanged?.()
              } catch (err) { setError(err.message) }
            }}
            style={inp(t)}
          >
            {ESTADOS.filter((x) => x.value).map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </div>
      )}

      {esCompromiso && (
        <section style={{ marginTop: 16 }}>
          <h4 style={h4(t)}>Acta de origen</h4>
          {pdfUrl ? (
            <iframe title="Acta" src={pdfUrl} style={{ width: '100%', height: 280, border: `1px solid ${t.border}`, borderRadius: 8 }} />
          ) : (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
              {item.acta ? `Acta Nº ${item.acta.consecutivo}` : 'Sin vista previa de acta'}
            </div>
          )}
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <h4 style={h4(t)}>Comentarios</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflow: 'auto', marginBottom: 8 }}>
          {(item.comentarios || []).map((c) => (
            <div key={c.id} style={{ padding: 8, borderRadius: 8, background: t.bg || 'rgba(0,0,0,0.03)', fontSize: 'var(--cc-sm)' }}>
              <b style={{ color: t.text }}>{c.autor_nombre}</b>
              <span style={{ color: t.textMuted }}> · {fmtFecha(c.created_at)}</span>
              <div style={{ color: t.text, whiteSpace: 'pre-wrap' }}>{c.mensaje}</div>
            </div>
          ))}
          {(item.comentarios || []).length === 0 && (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin comentarios aún.</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Escriba un comentario…"
            style={{ ...inp(t), flex: 1 }}
          />
          <button
            type="button"
            disabled={busy || !comentario.trim()}
            style={primary(t)}
            onClick={async () => {
              setBusy(true)
              try {
                await api.comentar(item.id, comentario.trim())
                setComentario('')
                await reload()
                onChanged?.()
              } catch (e) { setError(e.message) }
              finally { setBusy(false) }
            }}
          >
            Enviar
          </button>
        </div>
      </section>

      {esCompromiso && soyResponsable && (
        <section style={{ marginTop: 16 }}>
          <h4 style={h4(t)}>Evidencia / respuesta</h4>
          <input
            type="file"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                await api.uploadEvidencia(item.id, f)
                await reload()
                onChanged?.()
              } catch (err) { setError(err.message) }
            }}
          />
          <ul style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            {(item.evidencias || []).map((ev) => (
              <li key={ev.id}>{ev.nombre_archivo} · {fmtFecha(ev.created_at)}</li>
            ))}
          </ul>

          <h4 style={{ ...h4(t), marginTop: 14 }}>Solicitar justificación</h4>
          <textarea
            rows={3}
            placeholder="Motivo"
            value={justForm.motivo}
            onChange={(e) => setJustForm((j) => ({ ...j, motivo: e.target.value }))}
            style={inp(t)}
          />
          <input
            type="date"
            value={justForm.nueva_fecha_vencimiento}
            onChange={(e) => setJustForm((j) => ({ ...j, nueva_fecha_vencimiento: e.target.value }))}
            style={{ ...inp(t), marginTop: 6 }}
          />
          <button
            type="button"
            style={{ ...primary(t), marginTop: 8 }}
            onClick={async () => {
              try {
                await api.solicitarJustificacion(item.id, justForm)
                setJustForm({ motivo: '', nueva_fecha_vencimiento: '' })
                await reload()
              } catch (e) { setError(e.message) }
            }}
          >
            Enviar justificación
          </button>
        </section>
      )}

      {esCompromiso && soySolicitante && (item.justificaciones || []).some((j) => j.estado === 'pendiente') && (
        <section style={{ marginTop: 16 }}>
          <h4 style={h4(t)}>Justificaciones pendientes</h4>
          {(item.justificaciones || []).filter((j) => j.estado === 'pendiente').map((j) => (
            <div key={j.id} style={{ padding: 10, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.text }}>{j.motivo}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Nueva fecha: {fmtFecha(j.nueva_fecha_vencimiento)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" style={primary(t)} onClick={async () => {
                  await api.revisarJustificacion(j.id, { aprobar: true })
                  await reload(); onChanged?.()
                }}>Aprobar</button>
                <button type="button" style={ghost(t)} onClick={async () => {
                  await api.revisarJustificacion(j.id, { aprobar: false })
                  await reload(); onChanged?.()
                }}>Rechazar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!esCompromiso && Array.isArray(item.imagenes) && item.imagenes.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h4 style={h4(t)}>Imágenes</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {item.imagenes.map((im, i) => (
              im.data_uri ? (
                <img key={i} src={im.data_uri} alt="" style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, border: `1px solid ${t.border}` }} />
              ) : (
                <span key={i} style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>{im.nombre}</span>
              )
            ))}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" onClick={onClose} style={ghost(t)}>Cerrar</button>
      </div>
    </Overlay>
  )
}

function Overlay({ t, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(820px, 100%)', maxHeight: '92vh', overflow: 'auto',
          background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12,
          padding: 20, boxShadow: t.shadow,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function lbl(t) { return { display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 } }
function h4(t) { return { margin: '0 0 8px', fontSize: 'var(--cc-lg)', fontWeight: 700, color: t.text } }
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg || t.bgCard, color: t.text,
  }
}
function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
