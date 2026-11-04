import { useCallback, useEffect, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import TemaProseHtml from './TemaProseHtml'
import { temaRichProseCss } from './temaRichProseCss'
import { ESTADOS_GESTION, fmtFecha } from './seguimientoTheme'
import { puedeMutarActividadPropia } from './planActividadesPermisos'

function fmtBogota(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return String(iso)
  }
}

export default function PlanActividadDetalleModal({
  t,
  api,
  usuario,
  permisos,
  itemId,
  onClose,
  onChanged,
  onEdit,
}) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comentario, setComentario] = useState('')
  const [editComentarioId, setEditComentarioId] = useState(null)
  const [editComentarioTxt, setEditComentarioTxt] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const row = await api.getPlanActividad(itemId)
      setItem(row)
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la actividad')
    } finally {
      setLoading(false)
    }
  }, [api, itemId])

  useEffect(() => { load() }, [load])

  async function enviarComentario() {
    if (!comentario.trim()) return
    setBusy(true)
    try {
      await api.comentarPlanActividad(itemId, comentario.trim())
      setComentario('')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'No se pudo comentar')
    } finally {
      setBusy(false)
    }
  }

  async function guardarEdicionComentario() {
    if (!editComentarioId || !editComentarioTxt.trim()) return
    setBusy(true)
    try {
      await api.editarComentarioPlan(editComentarioId, editComentarioTxt.trim())
      setEditComentarioId(null)
      setEditComentarioTxt('')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'No se pudo editar el comentario')
    } finally {
      setBusy(false)
    }
  }

  async function cambiarEstado(estado) {
    setBusy(true)
    try {
      await api.patchPlanActividadEstado(itemId, estado)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e?.message || 'No se pudo cambiar el estado')
    } finally {
      setBusy(false)
    }
  }

  async function eliminar() {
    if (!window.confirm('¿Eliminar esta actividad? Esta acción no se puede deshacer.')) return
    setBusy(true)
    try {
      await api.deletePlanActividad(itemId)
      onChanged?.()
      onClose?.()
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar')
      setBusy(false)
    }
  }

  const puedeEditar = item && puedeMutarActividadPropia(item, usuario, permisos, 'editar')
  const puedeEliminar = item && puedeMutarActividadPropia(item, usuario, permisos, 'eliminar')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100040,
        background: t.overlay || 'rgba(15,23,42,0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de actividad"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(780px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard || t.bg || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <style>{temaRichProseCss(t, { variant: 'readonly' })}</style>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--cc-h3)', fontWeight: 800, color: t.text }}>
              {item?.titulo || (loading ? 'Cargando…' : 'Actividad')}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
              {item?.grupo_nombre || '—'} · Prioridad {item?.prioridad ?? '—'} · {item?.estado_gestion || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {puedeEditar && (
              <button type="button" onClick={() => onEdit?.(item)} title="Editar actividad" style={btn(t)}>
                Editar
              </button>
            )}
            {puedeEliminar && (
              <button type="button" onClick={eliminar} disabled={busy} title="Eliminar actividad" style={{ ...btn(t), color: t.danger || '#dc2626' }}>
                Eliminar
              </button>
            )}
            <button type="button" onClick={onClose} title="Cerrar" style={btn(t)}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          {error && <div style={{ color: t.danger || '#dc2626', fontSize: 'var(--cc-sm)' }}>{error}</div>}
          {loading && <div style={{ color: t.textMuted }}>Cargando…</div>}
          {item && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 'var(--cc-sm)', color: t.text }}>
                <div><strong>Solicitante:</strong> {item.solicitante_nombre || '—'}</div>
                <div><strong>Asignado(s):</strong> {item.asignado_a_nombre || '—'}</div>
                <div><strong>Inicio:</strong> {fmtFecha(item.fecha_inicio) || 'Sin fecha'}</div>
                <div><strong>Fin:</strong> {fmtFecha(item.fecha_fin) || 'Sin vencimiento'}</div>
                <div><strong>Periodicidad:</strong> {item.periodicidad || 'ninguna'}</div>
                {item.periodicidad_hasta && (
                  <div><strong>Hasta:</strong> {fmtFecha(item.periodicidad_hasta)}</div>
                )}
              </div>

              <section>
                <div style={secTitle(t)}>Descripción</div>
                <TemaProseHtml html={item.descripcion || ''} emptyLabel="Sin descripción" />
              </section>
              <section>
                <div style={secTitle(t)}>Comentario comité</div>
                <TemaProseHtml html={item.comentario_comite || ''} emptyLabel="Sin comentario" />
              </section>

              {item.puede_cambiar_estado && (
                <section>
                  <div style={secTitle(t)}>Estado</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ESTADOS_GESTION.map((e) => (
                      <button
                        key={e.value}
                        type="button"
                        disabled={busy || item.estado_gestion === e.value}
                        onClick={() => cambiarEstado(e.value)}
                        style={{
                          ...btn(t),
                          background: item.estado_gestion === e.value ? `${t.primary}22` : 'transparent',
                          fontWeight: item.estado_gestion === e.value ? 800 : 600,
                        }}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div style={secTitle(t)}>Comentarios</div>
                <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                  {(item.comentarios || []).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 'var(--cc-sm)',
                        color: t.text,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{c.autor_nombre || 'Usuario'}</div>
                      <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                        {fmtBogota(c.created_at)}
                        {c.editado_en ? ` · editado ${fmtBogota(c.editado_en)} por ${c.editado_por_nombre || '—'}` : ''}
                      </div>
                      {editComentarioId === c.id ? (
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          <textarea
                            value={editComentarioTxt}
                            onChange={(e) => setEditComentarioTxt(e.target.value)}
                            rows={3}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              borderRadius: 8,
                              border: `1px solid ${t.border}`,
                              background: t.bg || '#fff',
                              color: t.text,
                              padding: 8,
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" style={btn(t)} onClick={guardarEdicionComentario} disabled={busy}>Guardar</button>
                            <button type="button" style={btn(t)} onClick={() => setEditComentarioId(null)}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.mensaje}</div>
                          {c.mensaje_anterior && (
                            <div style={{ marginTop: 4, color: t.textMuted, fontStyle: 'italic' }}>
                              Antes: {c.mensaje_anterior}
                            </div>
                          )}
                          {Number(c.autor_id) === Number(usuario?.id || usuario?.sub) && (
                            <button
                              type="button"
                              style={{ ...btn(t), marginTop: 6, height: 26, fontSize: 'var(--cc-caption)' }}
                              onClick={() => {
                                setEditComentarioId(c.id)
                                setEditComentarioTxt(c.mensaje || '')
                              }}
                            >
                              Editar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {!(item.comentarios || []).length && (
                    <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin comentarios aún.</div>
                  )}
                </div>
                {item.puede_comentar && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <textarea
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      rows={3}
                      placeholder="Escriba un comentario…"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        background: t.bg || '#fff',
                        color: t.text,
                        padding: 8,
                      }}
                    />
                    <button type="button" disabled={busy || !comentario.trim()} onClick={enviarComentario} style={{ ...btn(t), justifySelf: 'start', background: t.primary, color: '#fff', border: 'none' }}>
                      Comentar
                    </button>
                  </div>
                )}
              </section>

              <section>
                <div style={secTitle(t)}>Historial de estados</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(item.eventos || [])
                    .filter((ev) => String(ev.tipo_evento || '').includes('estado') || ev.tipo_evento === 'cambio_estado' || ev.tipo_evento === 'plan_actividad_creada')
                    .map((ev) => (
                      <div key={ev.id} style={{ fontSize: 'var(--cc-sm)', color: t.text, borderBottom: `1px solid ${t.border}`, paddingBottom: 4 }}>
                        <strong>{ev.tipo_evento}</strong>
                        {' · '}
                        {fmtBogota(ev.created_at)}
                        {ev.payload?.antes != null && (
                          <span style={{ color: t.textMuted }}>
                            {' '}
                            (
                            {typeof ev.payload.antes === 'object'
                              ? JSON.stringify(ev.payload.antes)
                              : String(ev.payload.antes)}
                            {' → '}
                            {typeof ev.payload.despues === 'object'
                              ? JSON.stringify(ev.payload.despues)
                              : String(ev.payload.despues)}
                            )
                          </span>
                        )}
                      </div>
                    ))}
                  {!(item.eventos || []).length && (
                    <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin eventos registrados.</div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function btn(t) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }
}

function secTitle(t) {
  return {
    fontSize: 'var(--cc-caption)',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: t.textMuted,
    marginBottom: 6,
  }
}
