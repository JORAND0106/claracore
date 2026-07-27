import { useEffect, useState } from 'react'
import { esDesarrolladorUsuario } from '../../utils/permisosContrato'
import TareaChecklistEditor, { seedChecklistFromItem } from './TareaChecklistEditor'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import VencimientoIcon from './VencimientoIcon'
import { ESTADOS_GESTION, ORIGEN_COLOR, fmtFecha, fmtFechaHora } from './seguimientoTheme'
import { calcularAvanceTarea, labelAvance } from './tareaAvance'
import { fechaVencimientoEfectiva, nivelVencimientoItem, tipoLaborLabel } from './vencimientoLevels'

export default function ItemDetalleModal({
  t, api, itemId, usuario, usuarios = [], permisos, onClose, onChanged,
  allowEstadoGestion = null, // null = auto (solo tareas); true/false fuerza
  revisionEnActa = false, // revisión de compromisos en el siguiente comité
}) {
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comentario, setComentario] = useState('')
  const [justForm, setJustForm] = useState({ motivo: '', nueva_fecha_vencimiento: '' })
  const [pdfUrl, setPdfUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [estadoSel, setEstadoSel] = useState('')
  const [fechaReprog, setFechaReprog] = useState('')
  const [horaReprog, setHoraReprog] = useState('')
  const [destCtx, setDestCtx] = useState(null)
  const [destPick, setDestPick] = useState(null)
  const [checklist, setChecklist] = useState([])
  const [checklistDirty, setChecklistDirty] = useState(false)

  const applyItem = (d) => {
    setItem(d)
    if (d?.origen === 'tarea') {
      setChecklist(seedChecklistFromItem(d))
      setChecklistDirty(false)
    }
  }

  const reload = async () => {
    setLoading(true)
    try {
      const d = await api.getItem(itemId)
      applyItem(d)
      setEstadoSel('')
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

  const wide = item?.origen === 'tarea'

  if (loading || !item) {
    return (
      <Overlay t={t} onClose={onClose} wide={false}>
        <div style={{ color: t.textMuted }}>{error || 'Cargando…'}</div>
      </Overlay>
    )
  }

  const origen = ORIGEN_COLOR[item.origen] || ORIGEN_COLOR.tarea
  const esCompromiso = item.origen === 'compromiso'
  const esTarea = item.origen === 'tarea'
  const esDev = esDesarrolladorUsuario(usuario) || permisos?.esDesarrollador
  const soyResponsable = esDev || Number(item.asignado_a_id) === Number(usuario?.id)
  const soySolicitante = esDev || Number(item.solicitante_id) === Number(usuario?.id)
  const soyCreador = esDev || Number(item.created_by) === Number(usuario?.id)
  const due = fechaVencimientoEfectiva(item)
  const nivel = nivelVencimientoItem(item)
  const avance = esTarea ? calcularAvanceTarea(checklist.length ? checklist : item) : null
  const tieneChecklist = esTarea && (checklist.length > 0 || (item.campos_libres?.checklist || []).length > 0)
  const puedeEditarTarea = esTarea && permisos?.editar && (soyCreador || soyResponsable || esDev)
  const estadosDisponibles = ESTADOS_GESTION.filter((x) => {
    if (x.value === 'reprogramado') return esTarea
    return true
  })
  const puedeEditarEstado = (() => {
    if (!permisos?.editar) return false
    if (allowEstadoGestion === true) return true
    if (allowEstadoGestion === false) return false
    // Tareas con checklist: estado por sub-ítem (solo reprogramar global queda aquí)
    if (esTarea && tieneChecklist) return false
    return esTarea
  })()

  const confirmarDestino = async (modo) => {
    if (!destPick) return
    setBusy(true)
    setError('')
    try {
      await api.destinarItem(item.id, {
        destinatario_id: destPick.id,
        destinatario_nombre: nombreUser(destPick),
        relacion_destinatario: modo,
      })
      setDestCtx(null)
      setDestPick(null)
      await reload()
      onChanged?.()
    } catch (e) {
      setError(e.message || 'No se pudo destinar')
    } finally {
      setBusy(false)
    }
  }

  const guardarChecklist = async () => {
    setBusy(true)
    setError('')
    try {
      const checklistPayload = checklist.map((it) => ({
        id: it.id,
        texto: it.texto || '',
        hecho: !!it.hecho,
        estado_gestion: it.estado_gestion || (it.hecho ? 'cumplido' : 'abierto'),
        fecha: it.fecha || null,
        hora: it.hora || null,
        notas: it.notas || '',
        enlace: it.enlace || '',
        comentarios: Array.isArray(it.comentarios) ? it.comentarios : [],
        // Media nueva (pending) se sube después; la persistida se conserva en merge backend
        imagen: it.imagen?.pending ? null : (it.imagen || null),
        esquema: it.esquema?.pending ? null : (it.esquema || null),
      }))
      const updated = await api.updateTarea(item.id, {
        campos_libres: { checklist: checklistPayload },
      })
      for (const it of checklist) {
        if (it.imagen?.pending && it.imagen?.data_uri) {
          await api.pegarImagenTarea(item.id, {
            nombre: it.imagen.nombre || `checklist-${it.id}.png`,
            data_base64: it.imagen.data_uri,
            mime_type: it.imagen.mime_type || 'image/png',
            destino: 'checklist',
            checklist_id: it.id,
          })
        }
        if (it.esquema?.pending && it.esquema?.data_uri) {
          await api.pegarImagenTarea(item.id, {
            nombre: it.esquema.nombre || `esquema-${it.id}.png`,
            data_base64: it.esquema.data_uri,
            mime_type: 'image/png',
            destino: 'checklist_esquema',
            checklist_id: it.id,
          })
        }
      }
      const final = await api.getItem(item.id)
      applyItem(final || updated)
      onChanged?.()
    } catch (e) {
      setError(e.message || 'No se pudo guardar la checklist')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay t={t} onClose={onClose} wide={wide}>
      <div style={{
        borderLeft: `5px solid ${origen.border}`,
        paddingLeft: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: origen.border }}>{origen.label}</div>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, color: t.text, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <VencimientoIcon nivel={nivel} showLabel t={t} />
          <span>#{item.consecutivo ?? item.id} · {item.titulo}</span>
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          {item.asignado_a_nombre || '—'}
          {item.referido_a_nombre ? ` · ref: ${item.referido_a_nombre}` : ''}
          {' · '}vence {fmtFechaHora(due.fecha || item.fecha_vencimiento, due.hora || item.hora_vencimiento)}
          {' · '}{esTarea && avance ? `avance ${labelAvance(avance)}` : item.estado_gestion}
          {esTarea && avance?.pct === 100 ? ' · Cumplida' : ''}
          {' · '}{tipoLaborLabel(item, usuario?.id)}
        </div>
      </div>

      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', marginBottom: 8 }}>{error}</div>}

      {esTarea ? (
        <section style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={h4(t)}>Checklist</h4>
            {puedeEditarTarea && checklistDirty && (
              <button type="button" disabled={busy} style={primary(t)} onClick={guardarChecklist}>
                {busy ? 'Guardando…' : 'Guardar checklist'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 8 }}>
            Todo el contenido (imagen, esquema, notas y enlace) vive en cada sub-ítem. Puede agregar tantos como necesite.
          </div>
          <TareaChecklistEditor
            t={t}
            value={checklist}
            disabled={!puedeEditarTarea}
            usuario={usuario}
            onChange={(next) => { setChecklist(next); setChecklistDirty(true) }}
          />
        </section>
      ) : (
        <p style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--cc-body)', color: t.text }}>
          {item.descripcion || 'Sin descripción'}
        </p>
      )}

      {esTarea && tieneChecklist && (
        <div style={{
          margin: '12px 0', padding: '8px 10px', borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
          fontSize: 'var(--cc-sm)', color: t.textMuted,
        }}>
          Estado de la tarea: <b style={{ color: t.text }}>{avance?.estadoTarea || item.estado_gestion}</b>
          {' · '}avance {labelAvance(avance)}.
          Se marca Cumplida en bandeja solo al 100% (cancelados excluidos del cálculo).
          Estado y reprogramación se gestionan en cada sub-ítem.
        </div>
      )}

      {puedeEditarEstado && (
        <div style={{ margin: '14px 0' }}>
          <label style={lbl(t)}>
            {revisionEnActa ? 'Estado de gestión (revisión en comité)' : 'Estado de gestión'}
          </label>
          {revisionEnActa && (
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 8 }}>
              Defina aquí el resultado del compromiso al revisarlo en esta acta. El responsable no puede autocalificarse desde la bandeja.
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {estadosDisponibles.map((x) => (
              <label
                key={x.value}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${estadoSel === x.value ? t.primary : t.border}`,
                  background: estadoSel === x.value ? `${t.primary}18` : 'transparent',
                  fontSize: 'var(--cc-sm)', color: t.text,
                }}
              >
                <input
                  type="radio"
                  name={`estado-${item.id}`}
                  value={x.value}
                  checked={estadoSel === x.value}
                  onChange={() => setEstadoSel(x.value)}
                />
                {x.label}
              </label>
            ))}
          </div>
          {estadoSel === 'reprogramado' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={lbl(t)}>Nueva fecha de vencimiento *</label>
                <input type="date" value={fechaReprog} onChange={(e) => setFechaReprog(e.target.value)} style={inp(t)} />
              </div>
              <div>
                <label style={lbl(t)}>Hora (opcional)</label>
                <input type="time" value={horaReprog} onChange={(e) => setHoraReprog(e.target.value)} style={inp(t)} />
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={busy || !estadoSel || (estadoSel === 'reprogramado' && !fechaReprog)}
            style={{
              ...primary(t),
              opacity: (estadoSel && (estadoSel !== 'reprogramado' || fechaReprog)) ? 1 : 0.45,
              cursor: (estadoSel && (estadoSel !== 'reprogramado' || fechaReprog)) ? 'pointer' : 'not-allowed',
            }}
            onClick={async () => {
              setBusy(true)
              try {
                const extra = estadoSel === 'reprogramado'
                  ? { nueva_fecha_vencimiento: fechaReprog, hora_vencimiento: horaReprog || null }
                  : {}
                await api.patchEstado(item.id, estadoSel, extra)
                setFechaReprog('')
                setHoraReprog('')
                await reload()
                onChanged?.()
              } catch (err) { setError(err.message) }
              finally { setBusy(false) }
            }}
          >
            Guardar estado
          </button>
        </div>
      )}

      {esCompromiso && !puedeEditarEstado && (
        <div style={{
          margin: '12px 0', padding: '8px 10px', borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
          fontSize: 'var(--cc-sm)', color: t.textMuted,
        }}>
          Estado actual: <b style={{ color: t.text }}>{item.estado_gestion}</b>.
          La calificación de compromisos de acta se define en la revisión del siguiente comité, no desde la bandeja.
        </div>
      )}

      {(soyCreador || esDev) && permisos?.editar && (
        <section style={{ marginTop: 12 }}>
          <h4 style={h4(t)}>Asignar o enviar referencia</h4>
          <UserSearchSelect
            t={t}
            usuarios={usuarios}
            mode="strict"
            placeholder="Buscar destinatario…"
            style={inp(t)}
            onSelect={(u) => {
              setDestPick(u)
              if (u) setDestCtx({ user: u })
            }}
          />
          {destCtx?.user && (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 8,
              border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
              fontSize: 'var(--cc-sm)', color: t.text,
            }}>
              <div style={{ marginBottom: 8 }}>
                ¿Cómo desea enviar «{item.titulo}» a {nombreUser(destCtx.user)}?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" disabled={busy} style={primary(t)} onClick={() => confirmarDestino('asignacion')}>
                  Asignación formal
                </button>
                <button type="button" disabled={busy} style={ghost(t)} onClick={() => confirmarDestino('referencia')}>
                  Solo referencia
                </button>
                <button type="button" style={ghost(t)} onClick={() => { setDestCtx(null); setDestPick(null) }}>
                  Cancelar
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                En ambos casos el ítem permanece visible en su bandeja y aparece en la del destinatario.
              </div>
            </div>
          )}
        </section>
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
                onChanged?.()
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

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {esDev && (
          <button
            type="button"
            style={{ ...ghost(t), color: 'var(--cc-color-danger,#b91c1c)', borderColor: 'var(--cc-color-danger,#b91c1c)' }}
            onClick={async () => {
              if (!window.confirm('¿Eliminar definitivamente este ítem? Esta acción no se puede deshacer.')) return
              try {
                await api.deleteItem(item.id)
                onChanged?.()
                onClose?.()
              } catch (e) { setError(e.message) }
            }}
          >
            Eliminar definitivamente
          </button>
        )}
        <button type="button" onClick={onClose} style={{ ...ghost(t), marginLeft: 'auto' }}>Cerrar</button>
      </div>
    </Overlay>
  )
}

function Overlay({ t, onClose, children, wide = false }) {
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
          width: wide ? 'min(1640px, 98vw)' : 'min(820px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          boxShadow: t.shadow,
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
