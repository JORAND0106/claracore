import VisitanteCatalogSelect from './VisitanteCatalogSelect'
import { emptyVisitanteRow } from './visitantesEventoHelpers'

export { emptyVisitanteRow, visitantesFromDetalle } from './visitantesEventoHelpers'

/**
 * Grilla Nombre | Cargo para visitantes del Reporte de Evento.
 */
export default function VisitantesEventoGrid({
  t,
  api,
  rows = [],
  onChange,
  disabled = false,
  sheetStyles = null,
}) {
  const ui = sheetStyles || {}
  const list = Array.isArray(rows) && rows.length ? rows : [emptyVisitanteRow()]

  const setRow = (idx, patch) => {
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange?.(next)
  }

  const addRow = () => onChange?.([...list, emptyVisitanteRow()])
  const removeRow = (idx) => {
    const next = list.filter((_, i) => i !== idx)
    onChange?.(next.length ? next : [emptyVisitanteRow()])
  }

  const cellInp = {
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{
        fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.textMuted,
        marginBottom: 6,
      }}>
        Visitantes
      </div>
      <table style={ui.sheetTable || { width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...(ui.th || {}), textAlign: 'left', width: '48%' }}>Nombre</th>
            <th style={{ ...(ui.th || {}), textAlign: 'left', width: '40%' }}>Cargo</th>
            <th style={{ ...(ui.th || {}), width: '12%' }} />
          </tr>
        </thead>
        <tbody>
          {list.map((row, idx) => (
            <tr key={`vis-${idx}`}>
              <td style={ui.td}>
                {disabled ? (
                  <span style={{ fontSize: 'var(--cc-sm)' }}>{row.nombre || '—'}</span>
                ) : (
                  <VisitanteCatalogSelect
                    t={t}
                    api={api}
                    value={row.nombre || ''}
                    cargo={row.cargo || ''}
                    disabled={disabled}
                    inputStyle={cellInp}
                    onChange={(sel) => setRow(idx, {
                      visitante_id: sel.visitante_id,
                      nombre: sel.nombre,
                      cargo: sel.cargo != null && String(sel.cargo).trim() !== ''
                        ? sel.cargo
                        : (row.cargo || ''),
                    })}
                  />
                )}
              </td>
              <td style={ui.td}>
                {disabled ? (
                  <span style={{ fontSize: 'var(--cc-sm)' }}>{row.cargo || '—'}</span>
                ) : (
                  <input
                    value={row.cargo || ''}
                    disabled={disabled}
                    placeholder="Cargo"
                    onChange={(e) => setRow(idx, { cargo: e.target.value })}
                    style={cellInp}
                  />
                )}
              </td>
              <td style={{ ...ui.td, textAlign: 'center' }}>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    title="Quitar"
                    style={{
                      border: 'none', background: 'transparent', color: '#B91C1C',
                      cursor: 'pointer', fontWeight: 700, fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          style={{
            marginTop: 8,
            border: `1px dashed ${t.border}`,
            background: t.bg,
            color: t.primary,
            borderRadius: 6,
            padding: '6px 10px',
            fontWeight: 700,
            fontSize: 'var(--cc-xs)',
            cursor: 'pointer',
          }}
        >
          + Agregar visitante
        </button>
      )}
    </div>
  )
}
