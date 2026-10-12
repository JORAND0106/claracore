import { useState } from 'react'
import TareaChecklistEditor from './TareaChecklistEditor'
import TareaPartesFormEditor from './TareaPartesFormEditor'
import { labelAvance } from './tareaAvance'
import { debeMostrarChecklist, puedeExpandirChecklist } from './tareaExcelLayout.js'
import { tareaSheetStyles } from './tareaSheetStyles'

/**
 * Organización en dos niveles tipo Excel para crear / ver / editar una tarea:
 * 1) Fila Tarea · Destinatarios · Cumplimiento · % Avance
 * 2) Partes (crear/editar) o checklist legado (solo vista si aún no migró).
 */
export default function TareaExcelLayout({
  t,
  mode = 'view', // 'view' | 'create'
  /** 'partes' (nuevo) | 'checklist' (legado) | 'none' */
  secondLevel = null,
  titulo = '',
  onTituloChange,
  tituloReadOnly = false,
  tituloPlaceholder = '¿Qué hay que hacer?',
  destinatariosNode = null,
  cumplimientoLabel = '—',
  avance = null,
  checklist = [],
  onChecklistChange,
  checklistDisabled = false,
  checklistUsuario = null,
  multiCumplimiento = false,
  onMiEstado,
  miEstadoBusy = false,
  checklistUsuarios = [],
  canNotificar = false,
  onNotificarSubitem = null,
  notificarBusy = false,
  partes = [],
  onPartesChange,
  partesUsuarios = [],
  showParteResponsable = false,
  partesDefaultFecha = '',
  /** Forzar segundo nivel visible (p. ej. al crear). */
  defaultExpanded = null,
  headerExtra = null,
  footerBeforeChecklist = null,
}) {
  const ui = tareaSheetStyles(t)
  const level = secondLevel
    || (mode === 'create' ? 'partes' : (Array.isArray(checklist) && checklist.length > 0 ? 'checklist' : 'none'))

  const itemsLen = level === 'partes'
    ? (Array.isArray(partes) ? partes.length : 0)
    : (Array.isArray(checklist) ? checklist.length : 0)
  const hasItems = itemsLen > 0
  const levelDisabled = level === 'checklist' ? checklistDisabled : false

  const canExpand = level === 'none'
    ? false
    : puedeExpandirChecklist({
      mode,
      checklistLength: itemsLen,
      checklistDisabled: levelDisabled,
    })
  const initialExpanded = defaultExpanded != null
    ? !!defaultExpanded
    : (mode === 'create' || hasItems)
  const [expanded, setExpanded] = useState(initialExpanded)

  const pctLabel = labelAvance(avance)
  const showSecond = level !== 'none' && debeMostrarChecklist({
    mode,
    expanded,
    checklistLength: itemsLen,
    checklistDisabled: levelDisabled,
  })

  const toggle = () => {
    if (!canExpand && !expanded) return
    setExpanded((v) => !v)
  }

  const hideLabel = level === 'partes' ? 'Ocultar partes' : 'Ocultar checklist'
  const showLabel = level === 'partes' ? 'Mostrar partes' : 'Mostrar checklist'

  return (
    <div className="cc-seguim-tarea-excel">
      {headerExtra}

      <div style={{ ...ui.sectionTitle, marginBottom: 6 }}>Tarea</div>
      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable} className="cc-seguim-tarea-nivel1-table">
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '36%' }}>Tarea</th>
              <th style={{ ...ui.th, width: '28%' }}>Destinatarios</th>
              <th style={{ ...ui.th, width: '20%' }}>Cumplimiento</th>
              <th style={{ ...ui.thCenter, width: '16%' }}>% Avance</th>
            </tr>
          </thead>
          <tbody>
            <tr
              onClick={toggle}
              style={{ cursor: canExpand ? 'pointer' : 'default' }}
              title={canExpand ? (expanded ? hideLabel : showLabel) : undefined}
            >
              <td style={ui.tdTarea} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {level !== 'none' && (
                    <button
                      type="button"
                      aria-expanded={showSecond}
                      aria-label={showSecond ? hideLabel : showLabel}
                      disabled={!canExpand}
                      onClick={toggle}
                      style={{
                        ...ui.iconBtn,
                        opacity: canExpand ? 1 : 0.35,
                        fontWeight: 800,
                        minWidth: 18,
                      }}
                    >
                      {showSecond ? '▾' : '▸'}
                    </button>
                  )}
                  {tituloReadOnly ? (
                    <span style={{
                      ...ui.cellInp,
                      display: 'block',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      height: 'auto',
                      padding: '4px 2px',
                    }}
                    >
                      {titulo || '—'}
                    </span>
                  ) : (
                    <input
                      value={titulo}
                      onChange={(e) => onTituloChange?.(e.target.value)}
                      placeholder={tituloPlaceholder}
                      style={{ ...ui.cellInp, fontWeight: 700 }}
                      autoComplete="off"
                    />
                  )}
                </div>
              </td>
              <td style={{ ...ui.tdTarea, height: 'auto', padding: 4 }} onClick={(e) => e.stopPropagation()}>
                {destinatariosNode || (
                  <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>—</span>
                )}
              </td>
              <td style={ui.tdTarea} onClick={(e) => e.stopPropagation()}>
                <span style={{
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 700,
                  color: t.text,
                  display: 'block',
                  padding: '4px 4px',
                }}
                >
                  {cumplimientoLabel}
                </span>
              </td>
              <td style={ui.tdTareaCenter} onClick={(e) => e.stopPropagation()}>
                <span style={{
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: avance?.pct === 100 ? 'var(--cc-color-positive,#0f766e)' : t.primary,
                  fontSize: 'var(--cc-sm)',
                }}
                >
                  {pctLabel}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!showSecond && hasItems && level === 'partes' && (
        <div style={ui.expandHint}>
          Clic en la fila para ver las partes ({itemsLen} parte{itemsLen === 1 ? '' : 's'}).
        </div>
      )}
      {!showSecond && hasItems && level === 'checklist' && (
        <div style={ui.expandHint}>
          Clic en la fila para ver el contenido ({itemsLen} ítem{itemsLen === 1 ? '' : 's'}).
        </div>
      )}
      {!showSecond && mode === 'create' && !hasItems && level === 'partes' && (
        <div style={ui.expandHint}>Clic en ▸ para abrir y agregar partes (opcional).</div>
      )}

      {footerBeforeChecklist}

      {showSecond && level === 'partes' && (
        <div style={{ marginTop: 12 }}>
          <TareaPartesFormEditor
            t={t}
            value={partes}
            onChange={onPartesChange}
            disabled={false}
            usuarios={partesUsuarios}
            showResponsable={showParteResponsable}
            canNotificar={canNotificar}
            defaultFecha={partesDefaultFecha}
          />
        </div>
      )}

      {showSecond && level === 'checklist' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...ui.sectionTitle, marginBottom: 6 }}>Contenido</div>
          <TareaChecklistEditor
            t={t}
            value={checklist}
            onChange={onChecklistChange}
            disabled={checklistDisabled}
            usuario={checklistUsuario}
            multiCumplimiento={multiCumplimiento}
            onMiEstado={onMiEstado}
            miEstadoBusy={miEstadoBusy}
            usuarios={checklistUsuarios}
            canNotificar={canNotificar}
            onNotificarSubitem={onNotificarSubitem}
            notificarBusy={notificarBusy}
          />
        </div>
      )}
    </div>
  )
}
