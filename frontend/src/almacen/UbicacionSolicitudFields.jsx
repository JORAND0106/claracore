import { AlmacenFieldLabel, useAlmacenCompact, useAlmacenTheme } from './almacenShared'
import { ABSCISA_RANGO_ERROR, validateAbscisaRango } from './almacenAbscisa'

const COSTADOS = ['Izquierda', 'Central', 'Derecha']

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
