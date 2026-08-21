import { useEffect, useRef, useState } from 'react'
import { esDesarrolladorUsuario } from '../../utils/permisosContrato'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import { textoCompromisoCelda } from './compromisoTextoCelda'
import {
  ESTADOS_GESTION,
  ORIGEN_COLOR,
  fmtFecha,
  numeroActaLabel,
} from './seguimientoTheme'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

export { textoCompromisoCelda } from './compromisoTextoCelda'

function iconSvgProps(size = 16) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
}

function IconComment() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
    </svg>
  )
}

function IconClip() {
  return (
    <svg {...iconSvgProps()}>
      <path d="m21.4 11.6-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a1.4 1.4 0 0 1-2-2l8.2-8.2" />
    </svg>
  )
}

function IconPostpone() {
  return (
    <svg {...iconSvgProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconPdf() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <circle cx="11" cy="14" r="2.5" />
      <path d="m13 16 2.5 2.5" />
    </svg>
  )
}

function IconNotify() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function iconBtn(t, { danger = false } = {}) {
  return {
    width: 30,
    height: 30,
    padding: 0,
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    cursor: 'pointer',
    border: `1px solid ${danger ? 'var(--cc-color-danger,#b91c1c)' : t.border}`,
    background: 'transparent',
    color: danger ? 'var(--cc-color-danger,#b91c1c)' : t.text,
  }
}

function cellInp(t) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 'var(--cc-sm)',
    padding: '4px 6px',
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: t.bg || t.bgCard,
    color: t.text,
    minWidth: 0,
  }
}

/**
 * Tabla tipo hoja de cálculo de compromisos abiertos (revisión en el acta actual).
 * Edición inline de fecha/estado; PDF y acciones auxiliares bajo demanda.
 */
export default function ActaCompromisosAbiertosTable({
  t,
  api,
  items = [],
  usuario,
  usuarios = [],
  permisos,
  viewportCompact = false,
  onChanged,
}) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState(null) // { type, item }
  const fileRef = useRef(null)
  const fileTargetIdRef = useRef(null)

  const puedeEditar = !!permisos?.editar
  const esDev = esDesarrolladorUsuario(usuario) || permisos?.esDesarrollador

  const refresh = async () => {
    await onChanged?.()
  }

  const patchFecha = async (row, fecha) => {
    if (!fecha || fecha === String(row.fecha_vencimiento || '').slice(0, 10)) return
    setBusyId(row.id)
    setError('')
    try {
      await api.patchFechaCompromiso(row.id, {
        fecha_vencimiento: fecha,
        hora_vencimiento: row.hora_vencimiento || null,
      })
      await refresh()
    } catch (e) {
      setError(e.message || 'No se pudo actualizar la fecha')
    } finally {
      setBusyId(null)
    }
  }

  const patchEstado = async (row, estado) => {
    if (!estado || estado === row.estado_gestion) return
    setBusyId(row.id)
    setError('')
    try {
      await api.patchEstado(row.id, estado)
      await refresh()
    } catch (e) {
      setError(e.message || 'No se pudo actualizar el estado')
    } finally {
      setBusyId(null)
    }
  }

  const openPanel = (type, item) => setPanel({ type, item })
  const closePanel = () => setPanel(null)

  if (!items.length) {
    return (
      <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
        No hay compromisos abiertos previos de actas del mismo tipo.
      </div>
    )
  }

  return (
    <div className="cc-seguim-compromisos-abiertos-table">
      {error && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--cc-color-danger,#b91c1c)',
          color: 'var(--cc-color-danger,#b91c1c)',
          fontSize: 'var(--cc-sm)',
        }}
        >
          {error}
          <button type="button" onClick={() => setError('')} style={{ ...iconBtn(t), marginLeft: 8, width: 24, height: 24 }}>×</button>
        </div>
      )}
      <div
        className="cc-seguim-table-scroll"
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: `1px solid ${t.border}`,
          borderRadius: 10,
        }}
      >
        <table
          className="cc-seguim-table cc-seguim-table--sheet"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--cc-sm)',
            minWidth: viewportCompact ? 720 : 880,
          }}
        >
          <thead>
            <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
              <th style={th}>Vence</th>
              <th style={th}>Estado</th>
              <th style={{ ...th, minWidth: 160 }}>Compromiso</th>
              <th style={th}>Notificar a</th>
              <th style={{ ...th, textAlign: 'center', whiteSpace: 'nowrap' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const { short, full } = textoCompromisoCelda(c)
              const busy = busyId === c.id
              const fechaVal = String(c.fecha_vencimiento || '').slice(0, 10)
              const actaLabel = c.acta_numero
                || (c.acta_consecutivo != null ? numeroActaLabel(c.acta_consecutivo) : null)
              return (
                <tr
                  key={c.id}
                  style={{
                    borderTop: `1px solid ${t.border}`,
                    background: ORIGEN_COLOR.compromiso.bg,
                    opacity: busy ? 0.65 : 1,
                  }}
                >
                  <td data-label="Vence" style={td}>
                    <input
                      type="date"
                      disabled={!puedeEditar || busy}
                      value={fechaVal}
                      onChange={(e) => patchFecha(c, e.target.value)}
                      title={c.hora_vencimiento ? `Hora: ${String(c.hora_vencimiento).slice(0, 5)}` : 'Fecha de vencimiento'}
                      style={cellInp(t)}
                    />
                  </td>
                  <td data-label="Estado" style={td}>
                    <select
                      disabled={!puedeEditar || busy}
                      value={c.estado_gestion || 'abierto'}
                      onChange={(e) => patchEstado(c, e.target.value)}
                      title="Estado de gestión"
                      style={cellInp(t)}
                    >
                      {ESTADOS_GESTION.filter((x) => x.value !== 'reprogramado').map((x) => (
                        <option key={x.value} value={x.value}>{x.label}</option>
                      ))}
                    </select>
                  </td>
                  <td
                    data-label="Compromiso"
                    style={{ ...td, maxWidth: 260, cursor: 'default' }}
                    title={full || short}
                  >
                    <div style={{ fontWeight: 600, color: t.text, lineHeight: 1.35 }}>{short}</div>
                    {actaLabel && (
                      <div style={{ fontSize: 'var(--cc-xs)', color: ORIGEN_COLOR.compromiso.border, marginTop: 2 }}>
                        {actaLabel}
                        {c.acta_fecha ? ` · ${fmtFecha(c.acta_fecha)}` : ''}
                      </div>
                    )}
                  </td>
                  <td data-label="Notificar a" style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: t.text,
                        flex: 1,
                      }}
                        title={c.asignado_a_nombre || (c.asignado_a_id ? `#${c.asignado_a_id}` : 'Sin destinatario')}
                      >
                        {c.asignado_a_nombre || (c.asignado_a_id ? `#${c.asignado_a_id}` : '—')}
                      </span>
                      {(esDev || Number(c.created_by) === Number(usuario?.id) || Number(c.solicitante_id) === Number(usuario?.id)) && puedeEditar && (
                        <button
                          type="button"
                          style={iconBtn(t)}
                          title="Notificar a (asignar o enviar referencia)"
                          aria-label="Notificar a"
                          disabled={busy}
                          onClick={() => openPanel('notify', c)}
                        >
                          <IconNotify />
                        </button>
                      )}
                    </div>
                  </td>
                  <td data-label="Acciones" style={{ ...td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button
                        type="button"
                        style={iconBtn(t)}
                        title="Comentarios"
                        aria-label="Comentarios"
                        disabled={busy}
                        onClick={() => openPanel('comment', c)}
                      >
                        <IconComment />
                      </button>
                      <button
                        type="button"
                        style={iconBtn(t)}
                        title="Adjuntar archivo / evidencia"
                        aria-label="Adjuntar archivo"
                        disabled={busy}
                        onClick={() => {
                          fileTargetIdRef.current = c.id
                          fileRef.current?.click()
                        }}
                      >
                        <IconClip />
                      </button>
                      <button
                        type="button"
                        style={iconBtn(t)}
                        title="Solicitar aplazamiento (justificación)"
                        aria-label="Solicitar aplazamiento"
                        disabled={busy}
                        onClick={() => openPanel('postpone', c)}
                      >
                        <IconPostpone />
                      </button>
                      <button
                        type="button"
                        style={iconBtn(t)}
                        title="Ver PDF del acta de origen (carga bajo demanda)"
                        aria-label="Ver PDF del acta"
                        disabled={busy || !c.acta_id}
                        onClick={() => openPanel('pdf', c)}
                      >
                        <IconPdf />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <input
        ref={fileRef}
        type="file"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          const id = fileTargetIdRef.current
          e.target.value = ''
          if (!f || !id) return
          setBusyId(id)
          setError('')
          try {
            await api.uploadEvidencia(id, f)
            await refresh()
          } catch (err) {
            setError(err.message || 'No se pudo adjuntar el archivo')
          } finally {
            setBusyId(null)
            fileTargetIdRef.current = null
          }
        }}
      />

      {panel && (
        <ActionPanel
          t={t}
          api={api}
          panel={panel}
          usuario={usuario}
          usuarios={usuarios}
          viewportCompact={viewportCompact}
          onClose={closePanel}
          onChanged={refresh}
          setError={setError}
        />
      )}
    </div>
  )
}

const th = { padding: '7px 8px', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 'var(--cc-xs)' }
const td = { padding: '6px 8px', verticalAlign: 'middle', color: 'inherit' }

function ActionPanel({
  t, api, panel, usuario, usuarios, viewportCompact, onClose, onChanged, setError,
}) {
  const { type, item } = panel
  const [loading, setLoading] = useState(type === 'comment' || type === 'postpone')
  const [detail, setDetail] = useState(null)
  const [comentario, setComentario] = useState('')
  const [justForm, setJustForm] = useState({ motivo: '', nueva_fecha_vencimiento: '' })
  const [busy, setBusy] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [localErr, setLocalErr] = useState('')
  const [destPick, setDestPick] = useState(null)
  const pdfUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (type === 'comment' || type === 'postpone') {
      setLoading(true)
      api.getItem(item.id).then((d) => {
        if (!cancelled) setDetail(d)
      }).catch((e) => {
        if (!cancelled) setLocalErr(e.message || 'Error')
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }
    return () => { cancelled = true }
  }, [type, item.id, api])

  useEffect(() => () => {
    if (pdfUrlRef.current) {
      try { URL.revokeObjectURL(pdfUrlRef.current) } catch { /* ignore */ }
    }
  }, [])

  const title = {
    comment: 'Comentarios',
    postpone: 'Solicitar aplazamiento',
    pdf: 'PDF del acta de origen',
    notify: 'Notificar a',
  }[type] || 'Detalle'

  const loadPdf = async () => {
    if (!item.acta_id || pdfBusy) return
    setPdfBusy(true)
    setLocalErr('')
    try {
      const blob = await api.pdfActaBlob(item.acta_id)
      if (pdfUrlRef.current) {
        try { URL.revokeObjectURL(pdfUrlRef.current) } catch { /* ignore */ }
      }
      const url = URL.createObjectURL(blob)
      pdfUrlRef.current = url
      setPdfUrl(url)
    } catch (e) {
      setLocalErr(e.message || 'No se pudo generar el PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex: 12200 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={viewportCompact ? 'cc-seguim-modal-sheet' : 'cc-seguim-modal-sheet--desktop'}
        style={{
          ...seguimientoModalSheetStyle(viewportCompact),
          width: viewportCompact ? '100%' : 'min(560px, 96vw)',
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--cc-title)', color: t.text }}>{title}</div>
          <button type="button" onClick={onClose} style={ghost(t)}>Cerrar</button>
        </div>
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 10 }}>
          {(item.titulo || item.descripcion || '').slice(0, 140)}
        </div>
        {(localErr) && (
          <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{localErr}</div>
        )}

        {type === 'comment' && (
          loading ? <div style={{ color: t.textMuted }}>Cargando…</div> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto', marginBottom: 10 }}>
                {(detail?.comentarios || []).map((c) => (
                  <div key={c.id} style={{ padding: 8, borderRadius: 8, background: t.bg || 'rgba(0,0,0,0.03)', fontSize: 'var(--cc-sm)' }}>
                    <b style={{ color: t.text }}>{c.autor_nombre}</b>
                    <span style={{ color: t.textMuted }}> · {fmtFecha(c.created_at)}</span>
                    <div style={{ color: t.text, whiteSpace: 'pre-wrap' }}>{c.mensaje}</div>
                  </div>
                ))}
                {(detail?.comentarios || []).length === 0 && (
                  <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin comentarios aún.</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Observación / motivo…"
                  style={{ ...inp(t), flex: 1 }}
                />
                <button
                  type="button"
                  disabled={busy || !comentario.trim()}
                  style={primary(t)}
                  onClick={async () => {
                    setBusy(true)
                    setLocalErr('')
                    try {
                      await api.comentar(item.id, comentario.trim())
                      setComentario('')
                      const d = await api.getItem(item.id)
                      setDetail(d)
                      await onChanged?.()
                    } catch (e) {
                      setLocalErr(e.message || 'No se pudo comentar')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Enviar
                </button>
              </div>
            </>
          )
        )}

        {type === 'postpone' && (
          loading ? <div style={{ color: t.textMuted }}>Cargando…</div> : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.4 }}>
                Solicita una nueva fecha con justificación. Queda pendiente hasta que quien corresponde la apruebe o rechace (mismo flujo de la plataforma).
              </p>
              {(detail?.justificaciones || []).filter((j) => j.estado === 'pendiente').map((j) => (
                <div key={j.id} style={{ padding: 10, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
                  <div style={{ color: t.text }}>{j.motivo}</div>
                  <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
                    Nueva fecha: {fmtFecha(j.nueva_fecha_vencimiento)} · Pendiente
                  </div>
                  {(esDesarrolladorUsuario(usuario)
                    || Number(detail?.solicitante_id) === Number(usuario?.id)
                    || Number(detail?.acta?.elaborador_id) === Number(usuario?.id)) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        style={primary(t)}
                        onClick={async () => {
                          await api.revisarJustificacion(j.id, { aprobar: true })
                          const d = await api.getItem(item.id)
                          setDetail(d)
                          await onChanged?.()
                        }}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        style={ghost(t)}
                        onClick={async () => {
                          await api.revisarJustificacion(j.id, { aprobar: false })
                          const d = await api.getItem(item.id)
                          setDetail(d)
                          await onChanged?.()
                        }}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <textarea
                rows={3}
                placeholder="Justificación / motivo"
                value={justForm.motivo}
                onChange={(e) => setJustForm((j) => ({ ...j, motivo: e.target.value }))}
                style={inp(t)}
              />
              <input
                type="date"
                value={justForm.nueva_fecha_vencimiento}
                onChange={(e) => setJustForm((j) => ({ ...j, nueva_fecha_vencimiento: e.target.value }))}
                style={{ ...inp(t), marginTop: 8 }}
              />
              <button
                type="button"
                disabled={busy || !justForm.motivo.trim() || !justForm.nueva_fecha_vencimiento}
                style={{ ...primary(t), marginTop: 10 }}
                onClick={async () => {
                  setBusy(true)
                  setLocalErr('')
                  try {
                    await api.solicitarJustificacion(item.id, justForm)
                    setJustForm({ motivo: '', nueva_fecha_vencimiento: '' })
                    const d = await api.getItem(item.id)
                    setDetail(d)
                    await onChanged?.()
                  } catch (e) {
                    setLocalErr(e.message || 'No se pudo solicitar el aplazamiento')
                    setError?.(e.message || 'No se pudo solicitar el aplazamiento')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Enviar solicitud
              </button>
            </>
          )
        )}

        {type === 'pdf' && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-sm)', color: t.textMuted }}>
              La generación del PDF puede tardar varios segundos; no bloquea la tabla de compromisos.
            </p>
            <button
              type="button"
              disabled={pdfBusy || !item.acta_id}
              style={{ ...primary(t), opacity: pdfBusy ? 0.6 : 1 }}
              onClick={loadPdf}
            >
              {pdfBusy ? 'Generando PDF…' : (pdfUrl ? 'Actualizar PDF' : 'Cargar PDF del acta')}
            </button>
            {pdfUrl && (
              <>
                <div style={{ marginTop: 8 }}>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: t.primary, fontSize: 'var(--cc-sm)' }}>
                    Abrir en pestaña
                  </a>
                </div>
                <iframe
                  title="PDF acta compromiso"
                  src={pdfUrl}
                  style={{
                    width: '100%',
                    height: 'min(55vh, 420px)',
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    marginTop: 10,
                  }}
                />
              </>
            )}
          </>
        )}

        {type === 'notify' && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-sm)', color: t.textMuted }}>
              Destinatario actual: <b style={{ color: t.text }}>{item.asignado_a_nombre || '—'}</b>
            </p>
            <UserSearchSelect
              t={t}
              usuarios={usuarios}
              mode="strict"
              placeholder="Buscar a quién notificar…"
              style={inp(t)}
              onSelect={setDestPick}
            />
            {destPick && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  disabled={busy}
                  style={primary(t)}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await api.destinarItem(item.id, {
                        destinatario_id: destPick.id,
                        destinatario_nombre: nombreUser(destPick),
                        relacion_destinatario: 'asignacion',
                      })
                      await onChanged?.()
                      onClose()
                    } catch (e) {
                      setLocalErr(e.message || 'No se pudo notificar')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Asignación formal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  style={ghost(t)}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await api.destinarItem(item.id, {
                        destinatario_id: destPick.id,
                        destinatario_nombre: nombreUser(destPick),
                        relacion_destinatario: 'referencia',
                      })
                      await onChanged?.()
                      onClose()
                    } catch (e) {
                      setLocalErr(e.message || 'No se pudo notificar')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Solo referencia
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

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
