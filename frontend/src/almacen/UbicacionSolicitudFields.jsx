import { AlmacenFieldLabel, useAlmacenCompact, useAlmacenTheme } from './almacenShared'
import { ABSCISA_RANGO_ERROR, validateAbscisaRango } from './almacenAbscisa'

const COSTADOS = ['Izquierda', 'Central', 'Derecha']

const EXCEL_COLS = [
  { key: 'pk', abbr: 'PK-ID', tip: 'Identificador PK del sector', width: 100 },
  { key: 'tramo', abbr: 'TRAMO', tip: 'Tramo de la ubicación', width: 110 },
  { key: 'costado', abbr: 'COSTADO', tip: 'Costado (Izquierda / Central / Derecha)', width: 120 },
  { key: 'absIni', abbr: 'ABS. INI.', tip: 'Abscisa inicial', width: 110 },
  { key: 'absFin', abbr: 'ABS. FIN.', tip: 'Abscisa final', width: 110 },
]

/**
 * Campos de ubicación. Por defecto grid de formulario;
 * ``variant="excel"`` muestra una fila tipo hoja de cálculo (Almacén / SicoeObra).
 */
export default function UbicacionSolicitudFields({
  pkId,
  tramo,
  costado,
  abscisaInicial,
  abscisaFinal,
  absInicioDisplay,
  absFinalDisplay,
  nodoInicio,
  nodoFinal,
  abscisasEditable = false,
  onChange,
  disabled,
  variant = 'grid',
}) {
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()

  if (!pkId) return null

  const inp = { ...ui.input, padding: compact ? '10px 12px' : '5px 8px', fontSize: compact ? 'var(--cc-input)' : 'var(--cc-xs)' }
  const readOnly = { ...inp, background: `${ui.accentSoft}` }

  const absIniLabel = absInicioDisplay ?? (abscisaInicial !== '' && abscisaInicial != null ? String(abscisaInicial) : '')
  const absFinLabel = absFinalDisplay ?? (abscisaFinal !== '' && abscisaFinal != null ? String(abscisaFinal) : '')
  const rangoInvalido = abscisasEditable
    && String(abscisaInicial ?? '').trim() !== ''
    && String(abscisaFinal ?? '').trim() !== ''
    && !validateAbscisaRango(abscisaInicial, abscisaFinal).ok

  if (variant === 'excel') {
    const cellInp = {
      ...ui.input,
      width: '100%',
      minWidth: 0,
      padding: '4px 6px',
      fontSize: 'var(--cc-xs)',
      height: 28,
      boxSizing: 'border-box',
    }
    const cellRo = { ...cellInp, background: `${ui.accentSoft}` }
    const minWidth = EXCEL_COLS.reduce((a, c) => a + c.width, 0)
    return (
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <div style={ui.sheetWrap} className="cc-almacen-table-scroll">
          <table style={{ ...ui.sheetTable, minWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {EXCEL_COLS.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {EXCEL_COLS.map((c) => (
                  <th
                    key={c.key}
                    title={c.tip}
                    style={{
                      ...ui.th,
                      fontSize: 'var(--cc-xs)',
                      padding: '6px 8px',
                      height: 32,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.abbr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...ui.td, padding: '4px 6px', height: 36, verticalAlign: 'middle' }}>
                  <input style={cellRo} value={pkId || '—'} readOnly disabled title={pkId || ''} />
                </td>
                <td style={{ ...ui.td, padding: '4px 6px', height: 36, verticalAlign: 'middle' }}>
                  <input style={cellRo} value={tramo || '—'} readOnly disabled title={tramo || ''} />
                </td>
                <td style={{ ...ui.td, padding: '4px 6px', height: 36, verticalAlign: 'middle' }}>
                  <select
                    style={cellInp}
                    value={costado || ''}
                    disabled={disabled}
                    onChange={(e) => onChange?.({ costado: e.target.value })}
                  >
                    <option value="">—</option>
                    {COSTADOS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td style={{ ...ui.td, padding: '4px 6px', height: 36, verticalAlign: 'middle' }}>
                  {abscisasEditable ? (
                    <input
                      style={{ ...cellInp, borderColor: rangoInvalido ? '#dc2626' : undefined }}
                      value={abscisaInicial ?? ''}
                      disabled={disabled}
                      inputMode="decimal"
                      placeholder="K0+000"
                      onChange={(e) => onChange?.({ abscisa_inicial: e.target.value })}
                    />
                  ) : (
                    <input style={cellRo} value={absIniLabel || '—'} readOnly disabled />
                  )}
                </td>
                <td style={{ ...ui.td, padding: '4px 6px', height: 36, verticalAlign: 'middle' }}>
                  {abscisasEditable ? (
                    <input
                      style={{ ...cellInp, borderColor: rangoInvalido ? '#dc2626' : undefined }}
                      value={abscisaFinal ?? ''}
                      disabled={disabled}
                      inputMode="decimal"
                      placeholder="K0+100"
                      onChange={(e) => onChange?.({ abscisa_final: e.target.value })}
                    />
                  ) : (
                    <input style={cellRo} value={absFinLabel || '—'} readOnly disabled />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {(nodoInicio || nodoFinal) && (
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 6 }}>
            Nodo: {[nodoInicio, nodoFinal].filter(Boolean).join(' → ')}
          </div>
        )}
        {rangoInvalido && (
          <div style={{ fontSize: 'var(--cc-xs)', color: '#dc2626', marginTop: 6 }}>
            {ABSCISA_RANGO_ERROR}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="cc-almacen-ubicacion-grid"
      style={{
        marginTop: 8,
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: compact ? 10 : 6,
        alignItems: 'end',
      }}
    >
      <div>
        <AlmacenFieldLabel icon="🏷️" label="PK-ID" compact />
        <input style={readOnly} value={pkId} readOnly disabled />
      </div>
      <div>
        <AlmacenFieldLabel icon="🛣️" label="Tramo" compact />
        <input style={readOnly} value={tramo || '—'} readOnly disabled />
      </div>
      {(nodoInicio || nodoFinal) && (
        <div>
          <AlmacenFieldLabel icon="📍" label="Nodo" compact />
          <input
            style={readOnly}
            value={[nodoInicio, nodoFinal].filter(Boolean).join(' → ') || '—'}
            readOnly
            disabled
          />
        </div>
      )}
      <div>
        <AlmacenFieldLabel icon="↔️" label="Costado" compact />
        <select
          style={inp}
          value={costado || ''}
          disabled={disabled}
          onChange={(e) => onChange?.({ costado: e.target.value })}
        >
          <option value="">—</option>
          {COSTADOS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <AlmacenFieldLabel icon="📏" label="Absc. ini." compact />
        {abscisasEditable ? (
          <input
            style={{ ...inp, borderColor: rangoInvalido ? '#dc2626' : undefined }}
            value={abscisaInicial ?? ''}
            disabled={disabled}
            inputMode="decimal"
            placeholder="K0+000"
            onChange={(e) => onChange?.({ abscisa_inicial: e.target.value })}
          />
        ) : (
          <input style={readOnly} value={absIniLabel || '—'} readOnly disabled />
        )}
      </div>
      <div>
        <AlmacenFieldLabel icon="📏" label="Absc. fin." compact />
        {abscisasEditable ? (
          <input
            style={{ ...inp, borderColor: rangoInvalido ? '#dc2626' : undefined }}
            value={abscisaFinal ?? ''}
            disabled={disabled}
            inputMode="decimal"
            placeholder="K0+100"
            onChange={(e) => onChange?.({ abscisa_final: e.target.value })}
          />
        ) : (
          <input style={readOnly} value={absFinLabel || '—'} readOnly disabled />
        )}
      </div>
      {rangoInvalido && (
        <div style={{ gridColumn: '1 / -1', fontSize: 'var(--cc-xs)', color: '#dc2626' }}>
          {ABSCISA_RANGO_ERROR}
        </div>
      )}
    </div>
  )
}
