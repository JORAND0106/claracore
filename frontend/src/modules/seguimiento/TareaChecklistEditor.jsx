import { Fragment, useRef, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { ESTADOS_GESTION } from './seguimientoTheme'
import { calcularAvanceTarea, estadoEfectivoSubitem, normEstadoSubitem } from './tareaAvance'
import { miEstadoEnAsignaciones } from './tareaAsignaciones'
import {
  normalizeComentariosSubitem,
  normalizeNotificarSubitem,
} from './tareaChecklistMigracion'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import { tareaSheetStyles } from './tareaSheetStyles'

const ESTADO_SHORT = {
  abierto: 'Abierto',
  en_progreso: 'Progreso',
  parcial: 'Parcial',
  reprogramado: 'Reprogramado',
  cumplido: 'Cumplido',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

function normalizeComentarios(raw) {
  return normalizeComentariosSubitem(raw)
}

function patchNotificar(user, relacion) {
  if (!user?.id) {
    return {
      notificar_a_id: null,
      notificar_a_nombre: '',
      relacion_notificacion: null,
      notificar_a: null,
    }
  }
  const nombre = nombreUser(user) || String(user.nombre || '')
  return {
    notificar_a_id: Number(user.id),
    notificar_a_nombre: nombre,
    relacion_notificacion: relacion,
    notificar_a: { id: Number(user.id), nombre, relacion },
  }
}

/** Editor de checklist: único contenedor de contenido de la tarea personal. */
export function newChecklistItem(partial = {}) {
  const id = partial.id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const estado = normEstadoSubitem(partial.estado_gestion, { hecho: !!partial.hecho })
  const asignaciones = Array.isArray(partial.asignaciones)
    ? partial.asignaciones.map((a) => ({
      usuario_id: Number(a.usuario_id ?? a.id),
      nombre: a.nombre || '',
      estado_gestion: normEstadoSubitem(a.estado_gestion),
      updated_at: a.updated_at || null,
    }))
    : []
  const notificar = normalizeNotificarSubitem(partial)
  return {
    id,
    texto: partial.texto || '',
    hecho: estado === 'cumplido',
    estado_gestion: estado,
    fecha: partial.fecha || '',
    hora: partial.hora || '',
    imagen: partial.imagen || null,
    esquema: partial.esquema || null,
    notas: partial.notas || '',
    enlace: partial.enlace || '',
    comentarios: normalizeComentarios(partial.comentarios),
    orden: partial.orden ?? 0,
    ...(asignaciones.length ? { asignaciones } : {}),
    ...(notificar ? {
      notificar_a_id: notificar.id,
      notificar_a_nombre: notificar.nombre,
      relacion_notificacion: notificar.relacion,
      notificar_a: notificar,
    } : {
      notificar_a_id: null,
      notificar_a_nombre: '',
      relacion_notificacion: null,
      notificar_a: null,
    }),
  }
}

export function seedChecklistFromItem(item) {
  const libres = item?.campos_libres && typeof item.campos_libres === 'object' ? item.campos_libres : {}
  const raw = Array.isArray(libres.checklist) ? libres.checklist : []
  if (raw.length) {
    return raw.map((it, i) => newChecklistItem({
      id: it.id,
      texto: it.texto || '',
      hecho: !!it.hecho,
      estado_gestion: it.estado_gestion,
      fecha: it.fecha ? String(it.fecha).slice(0, 10) : '',
      hora: it.hora ? String(it.hora).slice(0, 5) : '',
      imagen: it.imagen || null,
      esquema: it.esquema || null,
      notas: it.notas || it.comentario || '',
      enlace: it.enlace || it.link || '',
      comentarios: it.comentarios || [],
      orden: it.orden ?? i,
      asignaciones: it.asignaciones,
      notificar_a: it.notificar_a,
      notificar_a_id: it.notificar_a_id,
      notificar_a_nombre: it.notificar_a_nombre,
      relacion_notificacion: it.relacion_notificacion,
    }))
  }
  if ((item?.descripcion || '').trim()) {
    return [newChecklistItem({
      texto: item.descripcion,
      estado_gestion: item.estado_gestion || 'abierto',
      fecha: item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : '',
      hora: item.hora_vencimiento ? String(item.hora_vencimiento).slice(0, 5) : '',
      asignaciones: libres.asignaciones,
    })]
  }
  return []
}

/**
 * Checklist de sub-ítems en grilla tipo Excel.
 * Columnas: Sub-ítem · Fecha/Hora · Estado · Notas · Enlace · Notificar a · Comentarios · Adjuntos.
 */
export default function TareaChecklistEditor({
  t,
  value = [],
  onChange,
  disabled = false,
  usuario = null,
  /** Si true, el estado global se deriva de asignaciones; el usuario edita solo «mi estado». */
  multiCumplimiento = false,
  onMiEstado,
  miEstadoBusy = false,
  usuarios = [],
  /** Permite buscar y notificar destinatario por sub-ítem. */
  canNotificar = false,
  /** async (checklistId, { user, relacion }) => void — si hay item persistido. */
  onNotificarSubitem = null,
  notificarBusy = false,
}) {
  const items = Array.isArray(value) ? value : []
  const ui = tareaSheetStyles(t)
  const fileRefs = useRef({})
  const [esquemaIdx, setEsquemaIdx] = useState(null)
  const [commentsOpenIdx, setCommentsOpenIdx] = useState(null)
  const [draftComments, setDraftComments] = useState({})
  const [notifyPick, setNotifyPick] = useState({}) // idx -> user
  const avance = calcularAvanceTarea(items)

  const setAt = (idx, patch) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it
      const merged = { ...it, ...patch }
      if ('estado_gestion' in patch) {
        const est = normEstadoSubitem(patch.estado_gestion)
        merged.estado_gestion = est
        merged.hecho = est === 'cumplido'
      } else if ('hecho' in patch) {
        merged.estado_gestion = patch.hecho ? 'cumplido' : (it.estado_gestion === 'cumplido' ? 'abierto' : it.estado_gestion)
        merged.hecho = !!patch.hecho
      }
      return merged
    })
    onChange?.(next)
  }

  const removeAt = (idx) => {
    onChange?.(items.filter((_, i) => i !== idx))
    if (commentsOpenIdx === idx) setCommentsOpenIdx(null)
  }

  const add = () => {
    onChange?.([...items, newChecklistItem({ orden: items.length })])
  }

  const fileToSoporte = (file, idx) => {
    if (!file || !file.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setAt(idx, {
        imagen: {
          nombre: file.name || `captura-${Date.now()}.png`,
          data_uri: reader.result,
          mime_type: file.type || 'image/png',
          created_at: new Date().toISOString(),
          pending: true,
        },
      })
    }
    reader.readAsDataURL(file)
  }

  const addComentario = (idx) => {
    const msg = String(draftComments[idx] || '').trim()
    if (!msg) return
    const it = items[idx]
    const prev = normalizeComentarios(it.comentarios)
    const entry = {
      id: `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      mensaje: msg.slice(0, 4000),
      autor_nombre: usuario?.nombre || usuario?.name || usuario?.email || 'Usuario',
      autor_id: usuario?.id != null ? Number(usuario.id) : null,
      created_at: new Date().toISOString(),
    }
    setAt(idx, { comentarios: [...prev, entry] })
    setDraftComments((d) => ({ ...d, [idx]: '' }))
  }

  const removeComentario = (idx, commentId) => {
    const it = items[idx]
    setAt(idx, { comentarios: normalizeComentarios(it.comentarios).filter((c) => c.id !== commentId) })
  }

  const aplicarNotificar = async (idx, relacion) => {
    const u = notifyPick[idx]
    if (!u) return
    const patch = patchNotificar(u, relacion)
    setAt(idx, patch)
    setNotifyPick((d) => {
      const next = { ...d }
      delete next[idx]
      return next
    })
    if (typeof onNotificarSubitem === 'function') {
      await onNotificarSubitem(items[idx]?.id, { user: u, relacion })
    }
  }

  const quitarNotificar = (idx) => {
    setAt(idx, patchNotificar(null))
    setNotifyPick((d) => {
      const next = { ...d }
      delete next[idx]
      return next
    })
  }

  return (
    <div className="cc-seguim-checklist cc-seguim-checklist--sheet">
      {items.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          marginBottom: 6, fontSize: 'var(--cc-xs)', color: t.textMuted,
        }}>
          <span>
            Avance checklist:{' '}
            <b style={{ color: avance.pct === 100 ? 'var(--cc-color-positive,#0f766e)' : t.primary }}>
              {avance.pct == null ? '—' : `${avance.pct}%`}
            </b>
            {' · '}{avance.cumplidos}/{avance.validos} cumplidos
          </span>
        </div>
      )}

      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable} className="cc-seguim-tarea-checklist-table">
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '18%' }}>Sub-ítem</th>
              <th style={{ ...ui.th, width: '12%' }}>Fecha / Hora</th>
              <th style={{ ...ui.th, width: '10%' }}>Estado</th>
              <th style={{ ...ui.th, width: '14%' }}>Notas</th>
              <th style={{ ...ui.th, width: '12%' }}>Enlace</th>
              <th style={{ ...ui.th, width: '14%' }}>Notificar a</th>
              <th style={{ ...ui.thCenter, width: '5%' }} title="Comentarios">☁</th>
              <th style={{ ...ui.thCenter, width: '15%' }}>Adjuntos</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...ui.tdSubitem, color: t.textMuted, fontSize: 'var(--cc-xs)', height: 36 }}>
                  Sin sub-ítems. Use «+ Agregar sub-ítem» para crear la checklist.
                </td>
              </tr>
            )}
            {items.map((it, idx) => {
              const srcImg = imagenSrc(it.imagen)
              const srcEsquema = imagenSrc(it.esquema)
              const asigns = Array.isArray(it.asignaciones) ? it.asignaciones : []
              const multi = multiCumplimiento && asigns.length > 0
              const est = multi
                ? estadoEfectivoSubitem(it)
                : normEstadoSubitem(it.estado_gestion, { hecho: !!it.hecho })
              const miEst = multi ? miEstadoEnAsignaciones(asigns, usuario?.id) : null
              const comentarios = normalizeComentarios(it.comentarios)
              const commentsOpen = commentsOpenIdx === idx
              const notificar = normalizeNotificarSubitem(it)
              const pick = notifyPick[idx]
              return (
                <Fragment key={it.id}>
                  <tr>
                    <td style={ui.tdSubitem}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          disabled={disabled}
                          value={it.texto}
                          onChange={(e) => setAt(idx, { texto: e.target.value })}
                          placeholder={`Sub-ítem ${idx + 1}`}
                          style={{
                            ...ui.cellInp,
                            fontWeight: 600,
                            textDecoration: est === 'cumplido' ? 'line-through' : 'none',
                            opacity: est === 'cumplido' ? 0.75 : 1,
                          }}
                        />
                        {!disabled && (
                          <button
                            type="button"
                            style={ui.iconBtn}
                            title="Quitar sub-ítem"
                            onClick={() => removeAt(idx)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={ui.tdSubitem}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <input
                          type="date"
                          disabled={disabled}
                          value={it.fecha || ''}
                          onChange={(e) => setAt(idx, { fecha: e.target.value })}
                          style={{ ...ui.cellInp, height: 24, padding: '1px 2px', fontSize: 11 }}
                        />
                        <input
                          type="time"
                          disabled={disabled}
                          value={it.hora || ''}
                          onChange={(e) => setAt(idx, { hora: e.target.value })}
                          style={{ ...ui.cellInp, height: 24, padding: '1px 2px', fontSize: 11 }}
                        />
                      </div>
                    </td>
                    <td style={ui.tdSubitem}>
                      {multi ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 700 }}>
                            {ESTADO_SHORT[est] || est}
                          </span>
                          {miEst != null && typeof onMiEstado === 'function' ? (
                            <select
                              disabled={miEstadoBusy}
                              value={miEst}
                              aria-label="Mi estado en este sub-ítem"
                              onChange={(e) => onMiEstado(it.id, e.target.value)}
                              style={ui.cellSelect}
                              title="Mi parte"
                            >
                              {ESTADOS_GESTION.map((x) => (
                                <option key={x.value} value={x.value}>
                                  {ESTADO_SHORT[x.value] || x.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontSize: 10, color: t.textMuted }}>
                              {asigns.map((a) => `${(a.nombre || '').split(' ')[0]}:${ESTADO_SHORT[a.estado_gestion] || a.estado_gestion}`).join(' · ')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <select
                          disabled={disabled}
                          value={est}
                          aria-label="Estado de gestión"
                          onChange={(e) => setAt(idx, { estado_gestion: e.target.value })}
                          style={ui.cellSelect}
                        >
                          {ESTADOS_GESTION.map((x) => (
                            <option key={x.value} value={x.value}>
                              {ESTADO_SHORT[x.value] || x.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={ui.tdSubitem}>
                      <input
                        disabled={disabled}
                        value={it.notas || ''}
                        onChange={(e) => setAt(idx, { notas: e.target.value })}
                        placeholder="Notas…"
                        style={ui.cellInp}
                        title={it.notas || ''}
                      />
                    </td>
                    <td style={ui.tdSubitem}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input
                          type="url"
                          disabled={disabled}
                          value={it.enlace || ''}
                          onChange={(e) => setAt(idx, { enlace: e.target.value })}
                          placeholder="https://…"
                          style={ui.cellInp}
                        />
                        {!!(it.enlace || '').trim() && (
                          <a
                            href={(it.enlace || '').trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...ui.iconBtnActive, textDecoration: 'none' }}
                            title="Abrir enlace"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ ...ui.tdSubitem, height: 'auto', padding: 4 }} onClick={(e) => e.stopPropagation()}>
                      {canNotificar && !disabled ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                          {notificar && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 10,
                                padding: '2px 5px',
                                borderRadius: 4,
                                border: `1px solid ${t.primary}`,
                                background: `${t.primary}14`,
                                color: t.text,
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                                title={`${notificar.nombre} · ${notificar.relacion}`}
                              >
                                {notificar.nombre}
                                <span style={{ color: t.textMuted }}> · {notificar.relacion === 'asignacion' ? 'asig.' : 'ref.'}</span>
                              </span>
                              <button type="button" style={ui.iconBtn} title="Quitar" onClick={() => quitarNotificar(idx)}>✕</button>
                            </div>
                          )}
                          <UserSearchSelect
                            key={`notif-${it.id}-${notificar?.id || 'empty'}`}
                            t={t}
                            usuarios={usuarios}
                            valueId={null}
                            valueNombre=""
                            mode="strict"
                            placeholder={notificar ? 'Cambiar…' : 'Buscar…'}
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              fontSize: 11,
                              padding: '4px 6px',
                              borderRadius: 4,
                              border: `1px solid ${t.border}`,
                              background: t.bg || t.bgCard,
                              color: t.text,
                              marginBottom: 0,
                            }}
                            onSelect={(u) => setNotifyPick((d) => ({ ...d, [idx]: u }))}
                          />
                          {pick && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              <button
                                type="button"
                                disabled={notificarBusy}
                                style={{
                                  border: 'none',
                                  borderRadius: 4,
                                  padding: '3px 6px',
                                  background: t.primary,
                                  color: '#fff',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                                onClick={() => aplicarNotificar(idx, 'asignacion')}
                              >
                                Asignar
                              </button>
                              <button
                                type="button"
                                disabled={notificarBusy}
                                style={{
                                  border: `1px solid ${t.border}`,
                                  borderRadius: 4,
                                  padding: '3px 6px',
                                  background: 'transparent',
                                  color: t.text,
                                  fontSize: 10,
                                  cursor: 'pointer',
                                }}
                                onClick={() => aplicarNotificar(idx, 'referencia')}
                              >
                                Referencia
                              </button>
                              <button
                                type="button"
                                style={ui.iconBtn}
                                onClick={() => setNotifyPick((d) => {
                                  const next = { ...d }
                                  delete next[idx]
                                  return next
                                })}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: t.textMuted }}>
                          {notificar
                            ? `${notificar.nombre} · ${notificar.relacion === 'asignacion' ? 'asig.' : 'ref.'}`
                            : '—'}
                        </span>
                      )}
                    </td>
                    <td style={ui.tdSubitemCenter}>
                      <button
                        type="button"
                        style={comentarios.length || commentsOpen ? ui.iconBtnActive : ui.iconBtn}
                        title={comentarios.length ? `${comentarios.length} comentario(s)` : 'Comentarios'}
                        aria-label="Comentarios del sub-ítem"
                        onClick={() => setCommentsOpenIdx(commentsOpen ? null : idx)}
                      >
                        ☁{comentarios.length ? ` ${comentarios.length}` : ''}
                      </button>
                    </td>
                    <td style={ui.tdSubitemCenter}>
                      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                        <input
                          ref={(el) => { fileRefs.current[it.id] = el }}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) fileToSoporte(f, idx)
                            e.target.value = ''
                          }}
                        />
                        {!disabled && (
                          <button
                            type="button"
                            style={srcImg ? ui.iconBtnActive : ui.iconBtn}
                            title={srcImg ? 'Cambiar imagen' : 'Adjuntar imagen'}
                            onClick={() => fileRefs.current[it.id]?.click()}
                          >
                            🖼
                          </button>
                        )}
                        <button
                          type="button"
                          style={{ ...(srcImg ? ui.iconBtnActive : ui.iconBtn), opacity: srcImg ? 1 : 0.35 }}
                          disabled={!srcImg}
                          title={srcImg ? 'Ver imagen' : 'Sin imagen'}
                          onClick={() => {
                            if (!openImageInNewTab(it.imagen)) window.alert('No se pudo abrir la imagen.')
                          }}
                        >
                          👁
                        </button>
                        {!disabled && (
                          <button
                            type="button"
                            style={srcEsquema ? ui.iconBtnActive : ui.iconBtn}
                            title="Esquema"
                            onClick={() => setEsquemaIdx(idx)}
                          >
                            ✎
                          </button>
                        )}
                        <button
                          type="button"
                          style={{ ...(srcEsquema ? ui.iconBtnActive : ui.iconBtn), opacity: srcEsquema ? 1 : 0.35 }}
                          disabled={!srcEsquema}
                          title={srcEsquema ? 'Ver esquema' : 'Sin esquema'}
                          onClick={() => {
                            if (!openImageInNewTab(it.esquema)) window.alert('No se pudo abrir el esquema.')
                          }}
                        >
                          ▤
                        </button>
                        {!disabled && srcImg && (
                          <button type="button" style={ui.iconBtn} title="Quitar imagen" onClick={() => setAt(idx, { imagen: null })}>⌫i</button>
                        )}
                        {!disabled && srcEsquema && (
                          <button type="button" style={ui.iconBtn} title="Quitar esquema" onClick={() => setAt(idx, { esquema: null })}>⌫e</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {commentsOpen && (
                    <tr>
                      <td colSpan={8} style={{ ...ui.tdSubitem, height: 'auto', padding: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: t.text, marginBottom: 6 }}>
                          Comentarios del sub-ítem
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                          {comentarios.length === 0 && (
                            <div style={{ fontSize: 11, color: t.textMuted }}>Sin comentarios aún.</div>
                          )}
                          {comentarios.map((c) => (
                            <div
                              key={c.id}
                              style={{
                                border: `1px solid ${t.border}`,
                                borderRadius: 4,
                                padding: '4px 8px',
                                background: t.bgCard || '#fff',
                                fontSize: 11,
                                color: t.text,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <b>{c.autor_nombre || 'Usuario'}</b>
                                <span style={{ color: t.textMuted }}>
                                  {c.created_at ? String(c.created_at).slice(0, 16).replace('T', ' ') : ''}
                                  {!disabled && (
                                    <button
                                      type="button"
                                      style={{ ...ui.iconBtn, marginLeft: 4 }}
                                      title="Eliminar"
                                      onClick={() => removeComentario(idx, c.id)}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              </div>
                              <div style={{ whiteSpace: 'pre-wrap' }}>{c.mensaje}</div>
                            </div>
                          ))}
                        </div>
                        {!disabled && (
                          <div className="cc-seguim-checklist-comment-row" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <textarea
                              rows={2}
                              value={draftComments[idx] || ''}
                              onChange={(e) => setDraftComments((d) => ({ ...d, [idx]: e.target.value }))}
                              placeholder="Escribir comentario…"
                              style={{
                                flex: 1,
                                boxSizing: 'border-box',
                                border: `1px solid ${t.border}`,
                                borderRadius: 4,
                                padding: 6,
                                fontSize: 12,
                                background: t.bgCard || '#fff',
                                color: t.text,
                                resize: 'vertical',
                                fontFamily: 'inherit',
                              }}
                            />
                            <button
                              type="button"
                              disabled={!(draftComments[idx] || '').trim()}
                              onClick={() => addComentario(idx)}
                              style={{
                                border: 'none',
                                borderRadius: 6,
                                padding: '6px 10px',
                                background: t.primary,
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 11,
                                cursor: 'pointer',
                                opacity: (draftComments[idx] || '').trim() ? 1 : 0.45,
                              }}
                            >
                              Comentar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <button
          type="button"
          style={{
            marginTop: 8,
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            background: t.primary,
            color: '#fff',
            fontWeight: 700,
            fontSize: 'var(--cc-sm)',
          }}
          onClick={add}
        >
          + Agregar sub-ítem
        </button>
      )}

      {esquemaIdx != null && items[esquemaIdx] && (
        <EsquemaEditorModal
          t={t}
          title={`Esquema · ${items[esquemaIdx].texto || `Sub-ítem ${esquemaIdx + 1}`}`}
          initialDataUri={imagenSrc(items[esquemaIdx].esquema)}
          onClose={() => setEsquemaIdx(null)}
          onSave={(dataUrl) => {
            setAt(esquemaIdx, {
              esquema: {
                nombre: `esquema-${items[esquemaIdx].id || Date.now()}.png`,
                data_uri: dataUrl,
                mime_type: 'image/png',
                created_at: new Date().toISOString(),
                pending: true,
                kind: 'esquema',
              },
            })
            setEsquemaIdx(null)
          }}
        />
      )}
    </div>
  )
}
