/** Selector de versión de presupuesto para análisis de costos en programación. */

export function pptoVersionEstadoLabel(v) {
  if (v?.es_vigente_aprobada) return '(vigente)'
  if (v?.sellado || (v?.estado || '') === 'aprobado_sellado') return 'aprobado'
  return 'borrador'
}

export function pptoVersionOptionLabel(v) {
  const num = v?.numero_version ?? '?'
  const etiq = (v?.etiqueta || '').trim() || 'Sin nombre'
  const est = pptoVersionEstadoLabel(v)
  const suffix = est === '(vigente)' ? ` · ${est}` : ` · ${est}`
  return `v${num} · ${etiq}${suffix}`
}

export default function ProgPresupuestoSelector({
  versiones = [],
  value,
  onChange,
  t,
  disabled = false,
}) {
  if (!versiones.length) return null

  const selected = versiones.find((v) => String(v.id) === String(value))
  const numSel = selected?.numero_version ?? '?'
  const esOficial = Boolean(selected?.es_vigente_aprobada)

  return (
    <div style={{ marginTop: '0.35rem' }}>
      <label
        data-cc-tooltip="Versión de presupuesto para costos, Curva S y exportes. No mueve fechas."
        data-cc-tooltip-variant="help"
        style={{
          display: 'inline-block',
          fontSize: 'var(--cc-caption)',
          fontWeight: 700,
          color: t.textMuted,
          marginBottom: '0.25rem',
          cursor: 'help',
        }}
      >
        Presupuesto
      </label>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value || null)}
        style={{
          width: '100%',
          padding: '0.4rem 0.5rem',
          fontSize: 'var(--cc-sm)',
          borderRadius: 6,
          border: `1px solid ${t.border}`,
          background: t.bgCard,
          color: t.text,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {versiones.map((v) => (
          <option key={v.id} value={v.id}>
            {pptoVersionOptionLabel(v)}
          </option>
        ))}
      </select>
      {selected && !esOficial && (
        <span
          data-cc-tooltip={`Presupuesto v${numSel} no aprobado — solo análisis de costos. No afecta fechas ni el envío a validación.`}
          data-cc-tooltip-variant="help"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: '0.35rem',
            padding: '0.15rem 0.4rem',
            borderRadius: 6,
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            fontSize: 'var(--cc-caption)',
            color: '#92400e',
            cursor: 'help',
          }}
        >
          ⚠ Análisis
        </span>
      )}
    </div>
  )
}
