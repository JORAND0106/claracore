import {
  emptyActividadRow,
  formatUbicacionActividad,
} from './bitacoraEventoActividades'

/**
 * Grilla Excel compacta de Actividades del Reporte de Evento.
 * Columnas: Actividad | Abs Inicio | Abs Fin | Ubicación | Cantidad | Observación
 */
export default function ActividadesEventoGrid({
  t,
  rows = [],
  onChange,
  onPickUbicacion,
  disabled = false,
  sheetStyles = null,
  compact = false,
}) {
  const ui = sheetStyles || {}
  const list = Array.isArray(rows) && rows.length ? rows : [emptyActividadRow()]

  const setRow = (idx, patch) => {
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange?.(next)
  }

  const addRow = () => onChange?.([...list, emptyActividadRow()])
  const removeRow = (idx) => {
    const next = list.filter((_, i) => i !== idx)
    onChange?.(next.length ? next : [emptyActividadRow()])
  }

  const cellInp = {
    ...(ui.cellInp || {
      background: t.bg,
      color: t.text,
      border: `1px solid ${t.border}`,
      borderRadius: 6,
      padding: '4px 6px',
      fontSize: 11,
      width: '100%',
      boxSizing: 'border-box',
    }),
    fontSize: compact ? 11 : 12,
    padding: compact ? '4px 5px' : '5px 6px',
    minWidth: 0,
  }

  return (
    <div className="cc-bitacora-evento-actividades">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 6,
        flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 'var(--cc-xs)',
          fontWeight: 700,
          color: t.textMuted,
        }}>
          Actividades
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={addRow}
            style={{
              border: `1px dashed ${t.border}`,
              background: t.bg,
              color: t.primary,
              borderRadius: 6,
              padding: '4px 8px',
              fontWeight: 700,
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Fila
          </button>
        )}
      </div>
      <div
        className="cc-bitacora-evento-actividades-scroll"
        style={ui.sheetWrap ? { ...ui.sheetWrap, margin: 0, overflowX: 'auto' } : {
          overflowX: 'auto',
          border: `1px solid ${t.border}`,
          borderRadius: 8,
        }}
      >
        <table
          className={compact ? 'cc-bitacora-responsive-table cc-bitacora-actividades-table' : undefined}
          style={{
            ...(ui.sheetTable || { width: '100%', borderCollapse: 'collapse' }),
            minWidth: compact ? 0 : 420,
            tableLayout: 'fixed',
          }}
        >
          <thead>
            <tr>
              <th style={{ ...(ui.th || {}), textAlign: 'left', width: '22%' }}>Actividad</th>
              <th style={{ ...(ui.th || {}), textAlign: 'left', width: '12%' }}>Abs Inicio</th>
              <th style={{ ...(ui.th || {}), textAlign: 'left', width: '12%' }}>Abs Fin</th>
              <th style={{ ...(ui.th || {}), textAlign: 'center', width: '14%' }}>Ubicación</th>
              <th style={{ ...(ui.th || {}), textAlign: 'left', width: '12%' }}>Cantidad</th>
              <th style={{ ...(ui.th || {}), textAlign: 'left', width: '20%' }}>Observación</th>
              <th style={{ ...(ui.th || {}), width: '8%' }} />
            </tr>
          </thead>
          <tbody>
            {list.map((row, idx) => {
              const ubiLabel = formatUbicacionActividad(row)
              return (
                <tr key={`act-${idx}`}>
                  <td style={ui.td} data-label="Actividad">
                    {disabled ? (
                      <span style={{ fontSize: 11 }}>{row.actividad || '—'}</span>
                    ) : (
                      <input
                        value={row.actividad || ''}
                        onChange={(e) => setRow(idx, { actividad: e.target.value })}
                        placeholder="Actividad"
                        style={cellInp}
                      />
                    )}
                  </td>
                  <td style={ui.td} data-label="Abs Inicio">
                    {disabled ? (
                      <span style={{ fontSize: 11 }}>{row.abs_inicio || '—'}</span>
                    ) : (
                      <input
                        value={row.abs_inicio || ''}
                        onChange={(e) => setRow(idx, { abs_inicio: e.target.value })}
                        placeholder="K0+000"
                        style={cellInp}
                      />
                    )}
                  </td>
                  <td style={ui.td} data-label="Abs Fin">
                    {disabled ? (
                      <span style={{ fontSize: 11 }}>{row.abs_fin || '—'}</span>
                    ) : (
                      <input
                        value={row.abs_fin || ''}
                        onChange={(e) => setRow(idx, { abs_fin: e.target.value })}
                        placeholder="K0+100"
                        style={cellInp}
                      />
                    )}
                  </td>
                  <td style={{ ...ui.td, textAlign: 'center' }} data-label="Ubicación">
                    <button
                      type="button"
                      title={ubiLabel || 'Seleccionar PK en mapa'}
                      disabled={disabled && !ubiLabel}
                      onClick={() => onPickUbicacion?.(idx)}
                      style={{
                        ...(ui.clipBtn || {
                          border: `1px solid ${t.border}`,
                          background: t.bg,
                          borderRadius: 6,
                          padding: '4px 6px',
                          cursor: 'pointer',
                        }),
                        color: ubiLabel ? (t.primary || '#0f766e') : t.textMuted,
                        fontWeight: 800,
                        fontSize: 10,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.ubicacion_pk ? `PK ${row.ubicacion_pk}` : 'PK'}
                    </button>
                  </td>
                  <td style={ui.td} data-label="Cantidad">
                    {disabled ? (
                      <span style={{ fontSize: 11 }}>{row.cantidad || '—'}</span>
                    ) : (
                      <input
                        value={row.cantidad || ''}
                        onChange={(e) => setRow(idx, { cantidad: e.target.value })}
                        placeholder="Cant."
                        style={cellInp}
                      />
                    )}
                  </td>
                  <td style={ui.td} data-label="Observación">
                    {disabled ? (
                      <span style={{ fontSize: 11 }}>{row.observacion || '—'}</span>
                    ) : (
                      <input
                        value={row.observacion || ''}
                        onChange={(e) => setRow(idx, { observacion: e.target.value })}
                        placeholder="Obs."
                        style={cellInp}
                      />
                    )}
                  </td>
                  <td style={{ ...ui.td, textAlign: 'center' }} data-label="">
                    {!disabled && list.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        title="Quitar"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#B91C1C',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
