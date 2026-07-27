import { useRef, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { ESTADOS_GESTION } from './seguimientoTheme'
import { calcularAvanceTarea, normEstadoSubitem } from './tareaAvance'

const ESTADO_SHORT = {
  abierto: 'Abierto',
  en_progreso: 'Progreso',
  parcial: 'Parcial',
  reprogramado: 'Reprog.',
  cumplido: 'Cumplido',
  vencido: 'Vencido',
  cancelado: 'Cancel.',
}

function normalizeComentarios(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      id: String(c.id || `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`),
      mensaje: String(c.mensaje || c.texto || '').slice(0, 4000),
      autor_nombre: String(c.autor_nombre || c.autor || '').slice(0, 200),
      autor_id: c.autor_id != null ? Number(c.autor_id) : null,
      created_at: c.created_at || new Date().toISOString(),
    }))
    .filter((c) => c.mensaje.trim())
}

/** Editor de checklist: único contenedor de contenido de la tarea personal. */
export function newChecklistItem(partial = {}) {
  const id = partial.id || `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const estado = normEstadoSubitem(partial.estado_gestion, { hecho: !!partial.hecho })
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
    }))
  }
  if ((item?.descripcion || '').trim()) {
    return [newChecklistItem({
      texto: item.descripcion,
      estado_gestion: item.estado_gestion || 'abierto',
      fecha: item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : '',
      hora: item.hora_vencimiento ? String(item.hora_vencimiento).slice(0, 5) : '',
    })]
  }
  return []
}

export default function TareaChecklistEditor({
  t,
  value = [],
  onChange,
  disabled = false,
  usuario = null,
}) {
  const items = Array.isArray(value) ? value : []
  const fileRefs = useRef({})
  const [esquemaIdx, setEsquemaIdx] = useState(null)
  const [reprogIdx, setReprogIdx] = useState(null)
  const [reprogFecha, setReprogFecha] = useState('')
  const [reprogHora, setReprogHora] = useState('')
  const [draftComments, setDraftComments] = useState({})
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

  const aplicarReprogramacion = (idx) => {
    if (!reprogFecha) return
    setAt(idx, {
      fecha: reprogFecha,
      hora: reprogHora || '',
      estado_gestion: 'reprogramado',
    })
    setReprogIdx(null)
    setReprogFecha('')
    setReprogHora('')
  }

  return (
    <div className="cc-seguim-checklist" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`,
          background: t.bgCard || t.bg, fontSize: 'var(--cc-sm)', color: t.text,
        }}>
          <b>Avance de la tarea:</b>
          <span style={{ fontWeight: 700, color: avance.pct === 100 ? 'var(--cc-color-positive,#0f766e)' : t.primary }}>
            {avance.pct == null ? '—' : `${avance.pct}%`}
          </span>
          <span style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
            {avance.cumplidos}/{avance.validos} sub-ítems cumplidos
            {avance.pct === 100 ? ' · Cumplida' : ''}
            {' · '}cancelados excluidos del %
          </span>
          <div style={{
            flex: '1 1 120px', height: 8, borderRadius: 999, background: `${t.border}`,
            overflow: 'hidden', minWidth: 80,
          }}>
            <div style={{
              width: `${avance.pct || 0}%`, height: '100%',
              background: avance.pct === 100 ? 'var(--cc-color-positive,#0f766e)' : t.primary,
            }}
            />
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div style={{
          padding: 14, borderRadius: 10, border: `1px dashed ${t.border}`,
          color: t.textMuted, fontSize: 'var(--cc-sm)',
        }}>
          Sin sub-ítems aún. Puede guardar solo con el título y agregar la checklist después.
        </div>
      )}

      {items.map((it, idx) => {
        const srcImg = imagenSrc(it.imagen)
        const srcEsquema = imagenSrc(it.esquema)
        const est = normEstadoSubitem(it.estado_gestion, { hecho: !!it.hecho })
        const comentarios = normalizeComentarios(it.comentarios)
        return (
          <div
            key={it.id}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: 12,
              background: t.bg || `${t.primary}06`,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Título + estado radio compacto en la misma línea */}
                <div className="cc-seguim-checklist-title-row" style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8,
                }}>
                  <input
                    disabled={disabled}
                    value={it.texto}
                    onChange={(e) => setAt(idx, { texto: e.target.value })}
                    placeholder={`Título del sub-ítem ${idx + 1}`}
                    style={{
                      ...inp(t),
                      flex: '1 1 180px',
                      minWidth: 140,
                      fontWeight: 600,
                      textDecoration: est === 'cumplido' ? 'line-through' : 'none',
                      opacity: est === 'cumplido' ? 0.75 : 1,
                    }}
                  />
                  <div
                    role="radiogroup"
                    aria-label="Estado de gestión"
                    className="cc-seguim-checklist-estados"
                    style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}
                  >
                    {ESTADOS_GESTION.map((x) => {
                      const active = est === x.value
                      return (
                        <button
                          key={x.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={disabled}
                          title={x.label}
                          onClick={() => setAt(idx, { estado_gestion: x.value })}
                          style={{
                            border: `1px solid ${active ? t.primary : t.border}`,
                            background: active ? `${t.primary}18` : 'transparent',
                            color: active ? t.primary : t.textMuted,
                            borderRadius: 6,
                            padding: '3px 7px',
                            fontSize: 11,
                            fontWeight: active ? 700 : 500,
                            cursor: disabled ? 'default' : 'pointer',
                            lineHeight: 1.2,
                          }}
                        >
                          {ESTADO_SHORT[x.value] || x.label}
                        </button>
                      )
                    })}
                  </div>
                  {!disabled && (
                    <button type="button" style={ghostTiny(t)} title="Quitar sub-ítem" onClick={() => removeAt(idx)}>✕</button>
                  )}
                </div>

                {/* Fecha/hora (+ reprogramación en la misma línea) y acciones compactas */}
                <div className="cc-seguim-checklist-meta-row" style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'center',
                }}>
                  <label style={{ ...lblInline(t), gap: 4 }}>
                    <span>Fecha</span>
                    <input
                      type="date"
                      disabled={disabled}
                      value={it.fecha || ''}
                      onChange={(e) => setAt(idx, { fecha: e.target.value })}
                      style={{ ...inp(t), width: 'auto', minWidth: 132, padding: '5px 7px', fontSize: 'var(--cc-xs)' }}
                    />
                  </label>
                  <label style={{ ...lblInline(t), gap: 4 }}>
                    <span>Hora</span>
                    <input
                      type="time"
                      disabled={disabled}
                      value={it.hora || ''}
                      onChange={(e) => setAt(idx, { hora: e.target.value })}
                      style={{ ...inp(t), width: 'auto', minWidth: 96, padding: '5px 7px', fontSize: 'var(--cc-xs)' }}
                    />
                  </label>

                  {reprogIdx === idx && !disabled && (
                    <>
                      <label style={{ ...lblInline(t), gap: 4 }}>
                        <span>Reprog.</span>
                        <input
                          type="date"
                          value={reprogFecha}
                          onChange={(e) => setReprogFecha(e.target.value)}
                          style={{ ...inp(t), width: 'auto', minWidth: 132, padding: '5px 7px', fontSize: 'var(--cc-xs)' }}
                        />
                      </label>
                      <input
                        type="time"
                        value={reprogHora}
                        onChange={(e) => setReprogHora(e.target.value)}
                        style={{ ...inp(t), width: 'auto', minWidth: 96, padding: '5px 7px', fontSize: 'var(--cc-xs)' }}
                      />
                      <button
                        type="button"
                        disabled={!reprogFecha}
                        style={{ ...chip(t, true), opacity: reprogFecha ? 1 : 0.45 }}
                        onClick={() => aplicarReprogramacion(idx)}
                      >
                        Aplicar
                      </button>
                      <button type="button" style={chip(t)} onClick={() => setReprogIdx(null)}>Cancelar</button>
                    </>
                  )}

                  <div className="cc-seguim-checklist-actions" style={{
                    marginLeft: 'auto', display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                  }}>
                    {!disabled && (
                      <>
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
                        <button type="button" style={chip(t)} onClick={() => fileRefs.current[it.id]?.click()}>
                          {srcImg ? 'Cambiar img' : 'Imagen'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      style={{ ...chip(t), opacity: srcImg ? 1 : 0.4 }}
                      disabled={!srcImg}
                      title={srcImg ? 'Abrir imagen de soporte' : 'Sin imagen'}
                      onClick={() => {
                        if (!openImageInNewTab(it.imagen)) {
                          window.alert('No se pudo abrir la imagen.')
                        }
                      }}
                    >
                      Ver imagen
                    </button>
                    {!disabled && (
                      <button type="button" style={chip(t, true)} onClick={() => setEsquemaIdx(idx)}>
                        Esquema
                      </button>
                    )}
                    <button
                      type="button"
                      style={{ ...chip(t), opacity: srcEsquema ? 1 : 0.4 }}
                      disabled={!srcEsquema}
                      title={srcEsquema ? 'Abrir esquema' : 'Sin esquema'}
                      onClick={() => {
                        if (!openImageInNewTab(it.esquema)) window.alert('No se pudo abrir el esquema.')
                      }}
                    >
                      Ver esquema
                    </button>
                    {!disabled && (
                      <button
                        type="button"
                        style={chip(t)}
                        title="Reprogramar este sub-ítem"
                        onClick={() => {
                          setReprogIdx(reprogIdx === idx ? null : idx)
                          setReprogFecha(it.fecha || '')
                          setReprogHora(it.hora || '')
                        }}
                      >
                        Reprogramar
                      </button>
                    )}
                    {!disabled && srcImg && (
                      <button type="button" style={chip(t)} onClick={() => setAt(idx, { imagen: null })}>Quitar img</button>
                    )}
                    {!disabled && srcEsquema && (
                      <button type="button" style={chip(t)} onClick={() => setAt(idx, { esquema: null })}>Quitar esquema</button>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={lbl(t)}>Notas</label>
                  <textarea
                    rows={2}
                    disabled={disabled}
                    value={it.notas || ''}
                    onChange={(e) => setAt(idx, { notas: e.target.value })}
                    placeholder="Notas propias de este sub-ítem…"
                    style={{ ...inp(t), resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={lbl(t)}>Enlace</label>
                  <input
                    type="url"
                    disabled={disabled}
                    value={it.enlace || ''}
                    onChange={(e) => setAt(idx, { enlace: e.target.value })}
                    placeholder="https://…"
                    style={inp(t)}
                  />
                  {!!(it.enlace || '').trim() && (
                    <a
                      href={(it.enlace || '').trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 'var(--cc-xs)', color: t.primary, display: 'inline-block', marginTop: 4 }}
                    >
                      Abrir enlace
                    </a>
                  )}
                </div>

                {/* Comentarios individuales del sub-ítem */}
                <div style={{ marginTop: 10 }}>
                  <label style={lbl(t)}>Comentarios del sub-ítem</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {comentarios.length === 0 && (
                      <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Sin comentarios aún.</div>
                    )}
                    {comentarios.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 8px',
                          background: t.bgCard || '#fff', fontSize: 'var(--cc-xs)', color: t.text,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 700 }}>{c.autor_nombre || 'Usuario'}</span>
                          <span style={{ color: t.textMuted }}>
                            {c.created_at ? String(c.created_at).slice(0, 16).replace('T', ' ') : ''}
                            {!disabled && (
                              <button
                                type="button"
                                style={{ ...ghostTiny(t), marginLeft: 6 }}
                                title="Eliminar comentario"
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
                    {!disabled && (
                      <div className="cc-seguim-checklist-comment-row" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <textarea
                          rows={2}
                          value={draftComments[idx] || ''}
                          onChange={(e) => setDraftComments((d) => ({ ...d, [idx]: e.target.value }))}
                          placeholder="Escribir comentario de este sub-ítem…"
                          style={{ ...inp(t), resize: 'vertical', flex: 1 }}
                        />
                        <button
                          type="button"
                          style={chip(t, true)}
                          disabled={!(draftComments[idx] || '').trim()}
                          onClick={() => addComentario(idx)}
                        >
                          Comentar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {!disabled && (
        <button type="button" style={{ ...primary(t), alignSelf: 'flex-start' }} onClick={add}>
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

function lbl(t) {
  return { display: 'block', fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }
}
function lblInline(t) {
  return {
    display: 'inline-flex', alignItems: 'center',
    fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600, margin: 0,
  }
}
function inp(t) {
  return {
    width: '100%', boxSizing: 'border-box', fontSize: 'var(--cc-input)',
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bgCard || t.bg || '#fff', color: t.text,
  }
}
function chip(t, primaryTone = false) {
  return {
    border: `1px solid ${primaryTone ? t.primary : t.border}`,
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
    background: primaryTone ? `${t.primary}14` : 'transparent',
    color: primaryTone ? t.primary : t.text,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  }
}
function ghostTiny(t) {
  return {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: t.textMuted, fontSize: 12, padding: '2px 4px',
  }
}
function primary(t) {
  return {
    border: 'none', borderRadius: 8, padding: '8px 12px',
    cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
  }
}
