import { useState } from 'react'
import TareaChecklistEditor from './TareaChecklistEditor'
import { labelAvance } from './tareaAvance'
import { debeMostrarChecklist, puedeExpandirChecklist } from './tareaExcelLayout'
import { tareaSheetStyles } from './tareaSheetStyles'

/**
 * Organización en dos niveles tipo Excel para crear / ver / editar una tarea:
 * 1) Fila Tarea · Destinatarios · Cumplimiento · % Avance
 * 2) Checklist de sub-ítems (se despliega al hacer clic en la fila, o siempre en creación).
 */
export default function TareaExcelLayout({
  t,
  mode = 'view', // 'view' | 'create'
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
  /** Forzar checklist visible (p. ej. al crear, o tras «Agregar»). */
  defaultExpanded = null,
  headerExtra = null,
  footerBeforeChecklist = null,
}) {
  const ui = tareaSheetStyles(t)
  const hasItems = Array.isArray(checklist) && checklist.length > 0
  const canExpand = puedeExpandirChecklist({
    mode,
    checklistLength: checklist?.length || 0,
    checklistDisabled,
  })
  const initialExpanded = defaultExpanded != null
    ? !!defaultExpanded
    : (mode === 'create' || hasItems)
  const [expanded, setExpanded] = useState(initialExpanded)

  const pctLabel = labelAvance(avance)
  const showChecklist = debeMostrarChecklist({
    mode,
    expanded,
    checklistLength: checklist?.length || 0,
    checklistDisabled,
  })

  const toggle = () => {
    if (!canExpand && !expanded) return
    setExpanded((v) => !v)
  }

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
              title={canExpand ? (expanded ? 'Ocultar checklist' : 'Ver checklist') : undefined}
            >
              <td style={ui.td} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    aria-expanded={showChecklist}
                    aria-label={showChecklist ? 'Ocultar checklist' : 'Mostrar checklist'}
                    disabled={!canExpand}
                    onClick={toggle}
                    style={{
                      ...ui.iconBtn,
                      opacity: canExpand ? 1 : 0.35,
                      fontWeight: 800,
                      minWidth: 18,
                    }}
                  >
                    {showChecklist ? '▾' : '▸'}
                  </button>
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
              <td style={{ ...ui.td, height: 'auto', padding: 4 }} onClick={(e) => e.stopPropagation()}>
                {destinatariosNode || (
                  <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>—</span>
                )}
              </td>
              <td style={ui.td} onClick={(e) => e.stopPropagation()}>
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
              <td style={ui.tdCenter} onClick={(e) => e.stopPropagation()}>
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

      {!showChecklist && hasItems && (
        <div style={ui.expandHint}>Clic en la fila para ver el checklist ({checklist.length} sub-ítem{checklist.length === 1 ? '' : 's'}).</div>
      )}
      {!showChecklist && mode === 'create' && !hasItems && (
        <div style={ui.expandHint}>Clic en ▸ para abrir el checklist e agregar sub-ítems.</div>
      )}

      {footerBeforeChecklist}

      {showChecklist && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...ui.sectionTitle, marginBottom: 6 }}>Checklist de sub-ítems</div>
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
