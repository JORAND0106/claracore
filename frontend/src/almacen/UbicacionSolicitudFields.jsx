import { fmtMetrosAbscisa } from './almacenAbscisa'
import { AlmacenFieldLabel, useAlmacenTheme } from './almacenShared'

const COSTADOS = ['Izquierda', 'Central', 'Derecha']

export default function UbicacionSolicitudFields({
  pkId,
  tramo,
  costado,
  abscisaInicial,
  abscisaFinal,
  onChange,
  disabled,
}) {
  const ui = useAlmacenTheme()

  if (!pkId) return null

  const inp = { ...ui.input, padding: '5px 8px', fontSize: 'var(--cc-xs)' }

  return (
    <div style={{
      marginTop: 8,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
      gap: 6,
      alignItems: 'end',
    }}
    >
      <div>
        <AlmacenFieldLabel icon="🏷️" label="PK-ID" compact />
        <input style={{ ...inp, background: `${ui.accentSoft}` }} value={pkId} readOnly disabled />
      </div>
      <div>
        <AlmacenFieldLabel icon="🛣️" label="Tramo" compact />
        <input style={{ ...inp, background: `${ui.accentSoft}` }} value={tramo || '—'} readOnly disabled />
      </div>
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
        <input
          style={inp}
          type="number"
          min="0"
          step="0.01"
          value={abscisaInicial ?? ''}
          disabled={disabled}
          onChange={(e) => onChange?.({ abscisaInicial: e.target.value })}
          placeholder="m"
        />
        {abscisaInicial !== '' && abscisaInicial != null && (
          <div style={{ fontSize: 10, color: ui.textMuted }}>{fmtMetrosAbscisa(abscisaInicial)}</div>
        )}
      </div>
      <div>
        <AlmacenFieldLabel icon="📏" label="Absc. fin." compact />
        <input
          style={inp}
          type="number"
          min="0"
          step="0.01"
          value={abscisaFinal ?? ''}
          disabled={disabled}
          onChange={(e) => onChange?.({ abscisaFinal: e.target.value })}
          placeholder="m"
        />
        {abscisaFinal !== '' && abscisaFinal != null && (
          <div style={{ fontSize: 10, color: ui.textMuted }}>{fmtMetrosAbscisa(abscisaFinal)}</div>
        )}
      </div>
    </div>
  )
}
