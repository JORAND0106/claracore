import { Fragment, useMemo, useState } from 'react'
import ColaboradorAsistenciaModal from './ColaboradorAsistenciaModal'
import { personalEnColumnas } from './bitacoraConstants'
import {
  formatHorarioAsistencia,
  labelEstadoColaborador,
  personalAgregadoDesdeAsistencia,
} from './personalAsistenciaHelpers'

/**
 * Sección Personal en obra: listado de asistencia + resumen de cargos (solo lectura).
 */
export default function PersonalAsistenciaPanel({
  t,
  api,
  rows = [],
  onChange,
  disabled = false,
  sheetStyles = null,
  compact = false,
}) {
  const ui = sheetStyles || {}
  const [modalOpen, setModalOpen] = useState(false)
  const [editIdx, setEditIdx] = useState(null)

  const agregado = useMemo(() => personalAgregadoDesdeAsistencia(rows), [rows])
  const personalCols = useMemo(() => personalEnColumnas(
    agregado.length
      ? agregado
      : [{ cargo: '—', cantidad: 0 }],
  ), [agregado])
  const maxRows = Math.max(...personalCols.map((c) => c.length), 0)

  const openNew = () => {
    setEditIdx(null)
    setModalOpen(true)
  }
  const openEdit = (idx) => {
    setEditIdx(idx)
    setModalOpen(true)
  }

  const saveRow = (row) => {
    if (editIdx == null) {
      onChange?.([...(rows || []), row])
    } else {
      onChange?.((rows || []).map((r, i) => (i === editIdx ? row : r)))
    }
  }

  const removeRow = (idx) => {
    onChange?.((rows || []).filter((_, i) => i !== idx))
  }

  const btnGhost = {
    border: `1px dashed ${t.border}`,
    background: t.bg || '#fff',
    color: t.primary,
    borderRadius: 8,
    padding: '6px 10px',
    fontWeight: 700,
    fontSize: 'var(--cc-xs)',
    cursor: disabled ? 'default' : 'pointer',
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 6,
      }}>
        <div style={{ ...ui.sectionTitle, marginBottom: 0 }}>Personal en obra</div>
        {!disabled && (
          <button type="button" onClick={openNew} style={btnGhost}>
            + Registrar colaborador
          </button>
        )}
      </div>

      <div style={ui.sheetWrap} className="cc-bitacora-sheet-scroll">
        <table
          className={compact ? 'cc-bitacora-responsive-table cc-bitacora-personal-table' : 'cc-bitacora-personal-table'}
          style={{ ...ui.sheetTable, minWidth: compact ? 0 : 640 }}
        >
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '22%' }}>Nombre</th>
              <th style={{ ...ui.th, width: '14%' }}>Cargo</th>
              <th style={{ ...ui.th, width: '16%' }}>Empresa</th>
              <th style={{ ...ui.th, width: '12%' }}>Estado</th>
              <th style={{ ...ui.th, width: '16%' }}>Horario</th>
              <th style={{ ...ui.th, width: '12%' }} />
            </tr>
          </thead>
          <tbody>
            {(rows || []).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...ui.td, color: t.textMuted, fontSize: 12 }}>
                  Sin colaboradores registrados hoy. Use «+ Registrar colaborador».
                </td>
              </tr>
            ) : (rows || []).map((row, idx) => (
              <tr key={`as-${row.colaborador_id || row.nombre}-${idx}`}>
                <td style={ui.td} data-label="Nombre">
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{row.nombre}</div>
                  {row.documento_numero ? (
                    <div style={{ fontSize: 10, color: t.textMuted }}>
                      {row.documento_tipo || 'CC'} {row.documento_numero}
                    </div>
                  ) : null}
                </td>
                <td style={ui.td} data-label="Cargo">{row.cargo || '—'}</td>
                <td style={ui.td} data-label="Empresa">{row.subcontratista_nombre || '—'}</td>
                <td style={ui.td} data-label="Estado">{labelEstadoColaborador(row.estado)}</td>
                <td style={ui.td} data-label="Horario">{formatHorarioAsistencia(row)}</td>
                <td style={{ ...ui.td, textAlign: 'center', whiteSpace: 'nowrap' }} data-label="">
                  {!disabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(idx)}
                        style={{ ...ui.clipBtn, color: t.primary, fontWeight: 700, fontSize: 11 }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        style={{ ...ui.clipBtn, color: '#B91C1C', fontWeight: 700 }}
                        title="Quitar"
                      >
                        ×
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...ui.sectionTitle, marginTop: 12, marginBottom: 6 }}>
        Resumen por cargo (automático · solo Activos)
      </div>
      <div style={ui.sheetWrap} className="cc-bitacora-sheet-scroll">
        {compact ? (
          <table
            className="cc-bitacora-responsive-table cc-bitacora-personal-table"
            style={{ ...ui.sheetTable, tableLayout: 'auto' }}
          >
            <thead>
              <tr>
                <th style={{ ...ui.th, width: '70%' }}>Cargo</th>
                <th style={{ ...ui.th, width: '30%', textAlign: 'center' }}>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {(agregado.length ? agregado : [{ cargo: '—', cantidad: 0 }]).map((row) => (
                <tr key={`ag-${row.cargo}`}>
                  <td style={ui.td} data-label="Cargo">
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{row.cargo}</span>
                  </td>
                  <td style={{ ...ui.td, textAlign: 'center', fontWeight: 800 }} data-label="Cant.">
                    {row.cantidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={ui.sheetTable} className="cc-bitacora-personal-table">
            <thead>
              <tr>
                {[0, 1, 2].map((c) => (
                  <th key={`h${c}`} colSpan={2} style={{ ...ui.th, textAlign: 'center' }}>
                    Col. {c + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {[0, 1, 2].map((c) => (
                  <Fragment key={`hh${c}`}>
                    <th style={{ ...ui.th, width: '18%' }}>Cargo</th>
                    <th style={{ ...ui.th, width: '7%', textAlign: 'center' }}>Cant.</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, ri) => (
                <tr key={`pr${ri}`}>
                  {[0, 1, 2].map((ci) => {
                    const row = personalCols[ci][ri]
                    return (
                      <Fragment key={`c${ci}-${ri}`}>
                        <td style={ui.td}>
                          {row ? (
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{row.cargo}</span>
                          ) : null}
                        </td>
                        <td style={{ ...ui.td, textAlign: 'center', fontWeight: 800 }}>
                          {row && row.cargo !== '—' ? row.cantidad : (row ? 0 : '')}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <ColaboradorAsistenciaModal
          t={t}
          api={api}
          initial={editIdx != null ? rows[editIdx] : null}
          disabled={disabled}
          onClose={() => setModalOpen(false)}
          onSave={saveRow}
        />
      )}
    </div>
  )
}
