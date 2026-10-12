import { Fragment, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import AdjuntosMediaSlider from '../../components/adjuntos/AdjuntosMediaSlider'
import { slidesFromChecklistItem } from '../../components/adjuntos/adjuntosMedia'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { ESTADOS_GESTION } from './seguimientoTheme'
import { calcularAvanceTarea, normEstadoSubitem } from './tareaAvance'
import { normalizeNotificarSubitem } from './tareaChecklistMigracion'
import { newParteItem } from './tareaPartesForm'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import { tareaSheetStyles } from './tareaSheetStyles'

export { newParteItem, partesToPayload, fechaVencimientoDesdePartes } from './tareaPartesForm'

const ESTADO_SHORT = {
  abierto: 'Abierto',
  en_progreso: 'Progreso',
  parcial: 'Parcial',
  reprogramado: 'Reprogramado',
  cumplido: 'Cumplido',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
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

/**
 * Editor de partes en el formulario de crear/editar.
 * Cada parte es una tarea completa: título, responsable (si delegada), fecha/hora,
 * estado, notas, enlace, Notificar a, adjuntos.
 * El botón para agregar es solo ícono + tooltip.
 */
export default function TareaPartesFormEditor({
  t,
  value = [],
  onChange,
  disabled = false,
  usuarios = [],
  showResponsable = false,
  canNotificar = true,
  defaultFecha = '',
}) {
  const items = Array.isArray(value) ? value : []
  const ui = tareaSheetStyles(t)
  const fileRefs = useRef({})
  const [esquemaIdx, setEsquemaIdx] = useState(null)
  const [adjuntoIdx, setAdjuntoIdx] = useState({})
  const [notifyPick, setNotifyPick] = useState({})
  const avance = calcularAvanceTarea(
    items.map((it) => ({
      estado_gestion: it.estado_gestion,
      hecho: it.estado_gestion === 'cumplido',
    })),
  )

  const setAt = (idx, patch) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it
      const merged = { ...it, ...patch }
      if ('estado_gestion' in patch) {
        merged.estado_gestion = normEstadoSubitem(patch.estado_gestion)
      }
      if ('titulo' in patch) {
        merged.texto = patch.titulo
      }
      if ('asignado' in patch) {
        const u = patch.asignado
        if (u?.id) {
          merged.asignado_a_id = Number(u.id)
          merged.asignado_a_nombre = nombreUser(u)
        } else {
          merged.asignado_a_id = null
          merged.asignado_a_nombre = ''
        }
        delete merged.asignado
      }
      return merged
    })
    onChange?.(next)
  }

  const removeAt = (idx) => {
    onChange?.(items.filter((_, i) => i !== idx))
  }

  const add = () => {
    onChange?.([
      ...items,
      newParteItem({
        orden: items.length,
        fecha: defaultFecha || '',
      }),
    ])
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

  const aplicarNotificar = (idx, relacion) => {
    const pick = notifyPick[idx]
    if (!pick?.id) return
    setAt(idx, patchNotificar(pick, relacion))
    setNotifyPick((d) => {
      const next = { ...d }
      delete next[idx]
      return next
    })
  }

  const quitarNotificar = (idx) => {
    setAt(idx, patchNotificar(null, null))
  }

  const colCount = showResponsable ? 8 : 7

  return (
    <div className="cc-seguim-partes-form">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 6, flexWrap: 'wrap',
      }}
      >
        <div style={{ ...ui.sectionTitle, marginBottom: 0 }}>Partes</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {items.length > 0 && (
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
              Avance{' '}
              <b style={{ color: avance.pct === 100 ? 'var(--cc-color-positive,#0f766e)' : t.primary }}>
                {avance.pct == null ? '—' : `${avance.pct}%`}
              </b>
              {' · '}{avance.cumplidos}/{avance.validos} cumplidas
            </span>
          )}
          {!disabled && (
            <button
              type="button"
              title="Agregar parte"
              aria-label="Agregar parte"
              onClick={add}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: t.bgCard || 'transparent',
                color: t.text,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable} className="cc-seguim-tarea-partes-table">
          <thead>
            <tr>
              <th style={{ ...ui.th, width: showResponsable ? '16%' : '18%' }}>Parte</th>
              {showResponsable && (
                <th style={{ ...ui.th, width: '14%' }}>Responsable</th>
              )}
              <th style={{ ...ui.th, width: '12%' }}>Fecha / Hora</th>
              <th style={{ ...ui.th, width: '10%' }}>Estado</th>
              <th style={{ ...ui.th, width: '14%' }}>Notas</th>
              <th style={{ ...ui.th, width: '12%' }}>Enlace</th>
              <th style={{ ...ui.th, width: '14%' }}>Notificar a</th>
              <th style={{ ...ui.thCenter, width: '14%' }}>Adjuntos</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  style={{ ...ui.tdSubitem, color: t.textMuted, fontSize: 'var(--cc-xs)', height: 36 }}
                >
                  Sin partes. Use el botón + para convertir esta tarea en madre con partes.
                  Puede guardar solo con el título.
                </td>
              </tr>
            )}
            {items.map((it, idx) => {
              const srcImg = imagenSrc(it.imagen)
              const srcEsquema = imagenSrc(it.esquema)
              const est = normEstadoSubitem(it.estado_gestion)
              const notificar = normalizeNotificarSubitem(it)
              const pick = notifyPick[idx]
              return (
                <Fragment key={it.id}>
                  <tr>
                    <td style={ui.tdSubitem}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          disabled={disabled}
                          value={it.titulo || ''}
                          onChange={(e) => setAt(idx, { titulo: e.target.value })}
                          placeholder={`Parte ${idx + 1}`}
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
                            title="Quitar parte"
                            aria-label="Quitar parte"
                            onClick={() => removeAt(idx)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                    {showResponsable && (
                      <td style={{ ...ui.tdSubitem, height: 'auto', padding: 4 }}>
                        {disabled ? (
                          <span style={{ fontSize: 10, color: t.textMuted }}>
                            {it.asignado_a_nombre || '—'}
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                            {it.asignado_a_id ? (
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
                                >
                                  {it.asignado_a_nombre || `#${it.asignado_a_id}`}
                                </span>
                                <button
                                  type="button"
                                  style={ui.iconBtn}
                                  title="Quitar responsable"
                                  onClick={() => setAt(idx, { asignado: null })}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : null}
                            <UserSearchSelect
                              key={`resp-${it.id}-${it.asignado_a_id || 'empty'}`}
                              t={t}
                              usuarios={usuarios}
                              valueId={null}
                              valueNombre=""
                              mode="strict"
                              placeholder={it.asignado_a_id ? 'Cambiar…' : 'Responsable…'}
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
                              onSelect={(u) => setAt(idx, { asignado: u })}
                            />
                          </div>
                        )}
                      </td>
                    )}
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
                      <select
                        disabled={disabled}
                        value={est}
                        aria-label="Estado de la parte"
                        onChange={(e) => setAt(idx, { estado_gestion: e.target.value })}
                        style={ui.cellSelect}
                      >
                        {ESTADOS_GESTION.map((x) => (
                          <option key={x.value} value={x.value}>
                            {ESTADO_SHORT[x.value] || x.label}
                          </option>
                        ))}
                      </select>
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
                    <td style={{ ...ui.tdSubitem, height: 'auto', padding: 4 }}>
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
                                <span style={{ color: t.textMuted }}>
                                  {' · '}{notificar.relacion === 'asignacion' ? 'asig.' : 'ref.'}
                                </span>
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
                    <td style={{ ...ui.tdSubitemCenter, minWidth: 100 }}>
                      {(() => {
                        const slides = slidesFromChecklistItem(it, imagenSrc)
                        const slideI = Math.min(adjuntoIdx[idx] || 0, Math.max(0, slides.length - 1))
                        const actual = slides[slideI]
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                            {slides.length > 0 && (
                              <AdjuntosMediaSlider
                                t={t}
                                items={slides}
                                index={slideI}
                                compact
                                onIndexChange={(i) => setAdjuntoIdx((prev) => ({ ...prev, [idx]: i }))}
                                onClickItem={(slide) => {
                                  if (!openImageInNewTab(slide.source)) window.alert('No se pudo abrir el adjunto.')
                                }}
                              />
                            )}
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
                              {!disabled && actual?.kind === 'foto' && srcImg && (
                                <button type="button" style={ui.iconBtn} title="Quitar foto" onClick={() => setAt(idx, { imagen: null })}>⌫</button>
                              )}
                              {!disabled && actual?.kind === 'esquema' && srcEsquema && (
                                <button type="button" style={ui.iconBtn} title="Quitar esquema" onClick={() => setAt(idx, { esquema: null })}>⌫</button>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {esquemaIdx != null && items[esquemaIdx] && (
        <EsquemaEditorModal
          t={t}
          title={`Esquema · ${items[esquemaIdx].titulo || `Parte ${esquemaIdx + 1}`}`}
          initialDataUri={imagenSrc(items[esquemaIdx].esquema)}
          iaDoc={{ ambito: 'tarea_parte', docKey: `tarea-parte-${items[esquemaIdx].id}` }}
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
