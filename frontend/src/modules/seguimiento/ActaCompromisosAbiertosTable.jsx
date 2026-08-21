import { useEffect, useMemo, useRef, useState } from 'react'
import { esDesarrolladorUsuario } from '../../utils/permisosContrato'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'
import { textoCompromisoCelda } from './compromisoTextoCelda'
import { esCompromisoArchivadoRevision } from './compromisoEstados'
import { destinatarioLabel } from './tareaAsignaciones'
import { calcularAvanceTarea, labelAvance } from './tareaAvance'
import {
  ESTADOS_GESTION,
  ORIGEN_COLOR,
  fmtFecha,
  numeroActaLabel,
} from './seguimientoTheme'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { fechaVencimientoEfectiva, sortByProximidadVencimiento } from './vencimientoLevels'

export { textoCompromisoCelda } from './compromisoTextoCelda'
export { esCompromisoArchivadoRevision, esEstadoTerminalCompromiso } from './compromisoEstados'

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

function IconCheck() {
  return (
    <svg {...iconSvgProps()}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg {...iconSvgProps()}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function iconBtn(t, { accent = false } = {}) {
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
    border: `1px solid ${accent ? 'var(--cc-color-positive,#0f766e)' : t.border}`,
    background: accent ? 'color-mix(in srgb, var(--cc-color-positive,#0f766e) 12%, transparent)' : 'transparent',
    color: accent ? 'var(--cc-color-positive,#0f766e)' : t.text,
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

function rowBg(t, { highlighted } = {}) {
  if (highlighted) {
    return `color-mix(in srgb, ${t.primary || '#2563eb'} 12%, ${t.bgCard || '#fff'})`
  }
  return t.bgCard || t.bg || 'transparent'
}

function itemTieneChecklist(item) {
  const ck = item?.campos_libres?.checklist
  return Array.isArray(ck) && ck.length > 0
}

/**
 * Tabla tipo hoja de cálculo compartida: compromisos (acta) y tareas/compromisos (Bandeja).
 * Orden por defecto: fecha de vencimiento ascendente (más próxima primero).
 * Ocultación por archivado_revision solo cuando filtrarArchivados está activo.
 */
export default function ActaCompromisosAbiertosTable({
  t,
  api,
  items = [],
  emptyMessage = 'No hay compromisos abiertos previos de actas del mismo tipo.',
  highlightId = null,
  showActaOrigen = true,
  /** Solo en pestaña Compromisos abiertos: botón que archiva y oculta de la vista activa. */
  permitirArchivar = false,
  /** null = filtrar archivados solo si permitirArchivar; en Bandeja suele ser false. */
  filtrarArchivados = null,
  /** Etiqueta de la columna de texto (Compromiso / Tema). */
  textoColumnaLabel = 'Compromiso',
  /** Muestra chip Compromiso/Tarea (Bandeja mixta). */
  showOrigenBadge = false,
  /** Abre detalle completo (checklist multi-destinatario, etc.) sin sustituir la tabla. */
  onOpenDetalle = null,
  usuario,
  usuarios = [],
  permisos,
  viewportCompact = false,
  onChanged,
}) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState(null)
  const [incluirArchivados, setIncluirArchivados] = useState(false)
  const fileRef = useRef(null)
  const fileTargetIdRef = useRef(null)
  const highlightRowRef = useRef(null)

  const puedeEditar = !!permisos?.editar
  const esDev = esDesarrolladorUsuario(usuario) || permisos?.esDesarrollador
  const doFilterArchivados = filtrarArchivados == null ? !!permitirArchivar : !!filtrarArchivados

  const visibles = useMemo(() => {
    let list = Array.isArray(items) ? items : []
    if (doFilterArchivados && !incluirArchivados) {
      list = list.filter((c) => !esCompromisoArchivadoRevision(c))
    }
    return sortByProximidadVencimiento(list)
  }, [items, incluirArchivados, doFilterArchivados])

  const ocultosCount = doFilterArchivados
    ? (items || []).filter((c) => esCompromisoArchivadoRevision(c)).length
    : 0

  useEffect(() => {
    if (highlightId == null) return undefined
    const tmr = setTimeout(() => {
      try {
        highlightRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      } catch { /* ignore */ }
    }, 80)
    return () => clearTimeout(tmr)
  }, [highlightId, visibles])

  const refresh = async () => { await onChanged?.() }

  const patchFecha = async (row, fecha) => {
    const due = fechaVencimientoEfectiva(row)
    const actual = String(due.fecha || row.fecha_vencimiento || '').slice(0, 10)
    if (!fecha || fecha === actual) return
    setBusyId(row.id)
    setError('')
    try {
      if (String(row.origen || '').toLowerCase() === 'tarea') {
        await api.updateTarea(row.id, {
          fecha_vencimiento: fecha,
          hora_vencimiento: row.hora_vencimiento || null,
        })
      } else {
        await api.patchFechaCompromiso(row.id, {
          fecha_vencimiento: fecha,
          hora_vencimiento: row.hora_vencimiento || null,
        })
      }
      await refresh()
    } catch (e) {
      setError(e.message || 'No se pudo actualizar la fecha')
    } finally {
      setBusyId(null)
    }
  }

  const patchEstado = async (row, estado, extra = {}) => {
    if (!estado || (estado === row.estado_gestion && !extra.archivar)) return
    setBusyId(row.id)
    setError('')
    try {
      await api.patchEstado(row.id, estado, extra)
      await refresh()
    } catch (e) {
      setError(e.message || 'No se pudo actualizar el estado')
    } finally {
      setBusyId(null)
    }
  }

  const marcarCumplido = async (row) => {
    if (!window.confirm('¿Marcar este compromiso como Cumplido? Dejará de mostrarse en la vista activa (sigue en el historial).')) {
      return
    }
    await patchEstado(row, 'cumplido', { archivar: true })
  }

  const openPanel = (type, item) => setPanel({ type, item })
  const closePanel = () => setPanel(null)

  return (
    <div className="cc-seguim-compromisos-abiertos-table">
      {doFilterArchivados && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
        >
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--cc-xs)',
            color: t.textMuted,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          >
            <input
              type="checkbox"
              checked={incluirArchivados}
              onChange={(e) => setIncluirArchivados(e.target.checked)}
            />
            Incluir archivados
            {ocultosCount > 0 && !incluirArchivados ? ` (${ocultosCount} ocultos)` : ''}
          </label>
        </div>
      )}

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

      {!visibles.length ? (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
          {emptyMessage}
        </div>
      ) : (
        <div
          className="cc-seguim-table-scroll"
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            background: t.bgCard || t.bg || 'transparent',
          }}
        >
          <table
            className="cc-seguim-table cc-seguim-table--sheet"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--cc-sm)',
              minWidth: viewportCompact ? 720 : 980,
              background: 'transparent',
            }}
          >
            <thead>
              <tr style={{ background: t.bg || `${t.primary}08`, color: t.textMuted, textAlign: 'left' }}>
                <th style={th}>Vence</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, minWidth: 220 }}>{textoColumnaLabel}</th>
                <th style={th}>Notificar a</th>
                <th style={{ ...th, textAlign: 'center', whiteSpace: 'nowrap' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const { short, full } = textoCompromisoCelda(c)
                const busy = busyId === c.id
                const due = fechaVencimientoEfectiva(c)
                const fechaVal = String(due.fecha || c.fecha_vencimiento || '').slice(0, 10)
                const esTarea = String(c.origen || '').toLowerCase() === 'tarea'
                const conChecklist = esTarea && itemTieneChecklist(c)
                const avance = esTarea ? calcularAvanceTarea(c) : null
                const destLabel = destinatarioLabel(c)
                const origenMeta = ORIGEN_COLOR[c.origen] || ORIGEN_COLOR.tarea
                const actaLabel = showActaOrigen && !esTarea
                  ? (c.acta_numero || (c.acta_consecutivo != null ? numeroActaLabel(c.acta_consecutivo) : null))
                  : null
                const highlighted = highlightId != null && Number(highlightId) === Number(c.id)
                const archivado = esCompromisoArchivadoRevision(c)
                const estadoDisabled = !puedeEditar || busy || archivado || conChecklist
                return (
                  <tr
                    key={c.id}
                    ref={highlighted ? highlightRowRef : undefined}
                    style={{
                      borderTop: `1px solid ${t.border}`,
                      background: rowBg(t, { highlighted }),
                      outline: highlighted ? `2px solid ${t.primary}` : undefined,
                      outlineOffset: -2,
                      opacity: busy ? 0.65 : 1,
                    }}
                  >
                    <td data-label="Vence" style={td}>
                      <input
                        type="date"
                        disabled={!puedeEditar || busy || archivado || conChecklist}
                        value={fechaVal}
                        onChange={(e) => patchFecha(c, e.target.value)}
                        title={
                          conChecklist
                            ? 'La fecha se deriva del checklist (abrir detalle)'
                            : (c.hora_vencimiento || due.hora
                              ? `Hora: ${String(c.hora_vencimiento || due.hora).slice(0, 5)}`
                              : 'Fecha de vencimiento')
                        }
                        style={cellInp(t)}
                      />
                    </td>
                    <td data-label="Estado" style={td}>
                      {conChecklist ? (
                        <div
                          style={{ fontSize: 'var(--cc-sm)', color: t.text, fontWeight: 600 }}
                          title="El estado se calcula según el avance del checklist"
                        >
                          {avance?.pct === 100 ? 'Cumplido' : (labelAvance(avance) || c.estado_gestion || '—')}
                        </div>
                      ) : (
                        <select
                          disabled={estadoDisabled}
                          value={c.estado_gestion || 'abierto'}
                          onChange={(e) => patchEstado(c, e.target.value)}
                          title="Estado de gestión (informativo; no archiva ni oculta)"
                          style={cellInp(t)}
                        >
                          {ESTADOS_GESTION.filter((x) => x.value !== 'reprogramado').map((x) => (
                            <option key={x.value} value={x.value}>{x.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td
                      data-label={textoColumnaLabel}
                      style={{ ...td, maxWidth: 360, cursor: 'default' }}
                      title={full || short}
                    >
                      {showOrigenBadge && (
                        <span style={{
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                          color: origenMeta.border,
                          marginRight: 6,
                        }}
                        >
                          {origenMeta.label}
                        </span>
                      )}
                      <div style={{ fontWeight: 600, color: t.text, lineHeight: 1.35 }}>{short}</div>
                      {actaLabel && (
                        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
                          {actaLabel}
                          {c.acta_fecha ? ` · ${fmtFecha(c.acta_fecha)}` : ''}
                        </div>
                      )}
                    </td>
                    <td data-label="Notificar a" style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: t.text,
                            flex: 1,
                          }}
                          title={destLabel}
                        >
                          {destLabel}
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
                        {permitirArchivar && (
                          <button
                            type="button"
                            style={iconBtn(t, { accent: !archivado })}
                            title={archivado ? 'Ya archivado de la vista activa' : 'Marcar como cumplido (archivar de la vista activa)'}
                            aria-label="Marcar cumplido"
                            disabled={busy || !puedeEditar || archivado}
                            onClick={() => marcarCumplido(c)}
                          >
                            <IconCheck />
                          </button>
                        )}
                        {typeof onOpenDetalle === 'function' && (
                          <button
                            type="button"
                            style={iconBtn(t)}
                            title={esTarea ? 'Detalle / checklist' : 'Ver detalle'}
                            aria-label="Detalle"
                            disabled={busy}
                            onClick={() => onOpenDetalle(c)}
                          >
                            <IconEye />
                          </button>
                        )}
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
                          title="Ver / adjuntar evidencias"
                          aria-label="Adjuntos"
                          disabled={busy}
                          onClick={() => openPanel('adjuntos', c)}
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
                        {!esTarea && (
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
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

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
            if (panel?.type === 'adjuntos' && Number(panel.item?.id) === Number(id)) {
              const d = await api.getItem(id)
              setPanel({ type: 'adjuntos', item: { ...panel.item, ...d } })
            }
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
          onPickFile={(itemId) => {
            fileTargetIdRef.current = itemId
            fileRef.current?.click()
          }}
        />
      )}
    </div>
  )
}

const th = { padding: '7px 8px', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 'var(--cc-xs)' }
const td = { padding: '6px 8px', verticalAlign: 'middle', color: 'inherit' }

function ActionPanel({
  t, api, panel, usuario, usuarios, viewportCompact, onClose, onChanged, setError, onPickFile,
}) {
  const { type, item } = panel
  const [loading, setLoading] = useState(['comment', 'postpone', 'adjuntos'].includes(type))
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
    if (['comment', 'postpone', 'adjuntos'].includes(type)) {
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
    adjuntos: 'Adjuntos / evidencias',
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
        {localErr && (
          <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{localErr}</div>
        )}

        {type === 'adjuntos' && (
          loading ? <div style={{ color: t.textMuted }}>Cargando…</div> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(detail?.evidencias || []).length === 0 && (
                  <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin evidencias aún.</div>
                )}
                {(detail?.evidencias || []).map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 8,
                      borderRadius: 8,
                      border: `1px solid ${t.border}`,
                      fontSize: 'var(--cc-sm)',
                      color: t.text,
                    }}
                  >
                    <IconClip />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.nombre_archivo || 'Archivo'}
                      </div>
                      <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>{fmtFecha(ev.created_at)}</div>
                    </div>
                    {(ev.url || ev.data_uri || imagenSrc(ev)) && (
                      <button
                        type="button"
                        style={iconBtn(t)}
                        title="Ver adjunto"
                        onClick={() => openImageInNewTab(ev)}
                      >
                        <IconEye />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                style={primary(t)}
                onClick={() => onPickFile?.(item.id)}
              >
                + Adjuntar archivo
              </button>
            </>
          )
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
                Solicita una nueva fecha con justificación. Queda pendiente hasta que quien corresponde la apruebe o rechace.
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
              La generación del PDF puede tardar varios segundos; no bloquea la tabla.
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
