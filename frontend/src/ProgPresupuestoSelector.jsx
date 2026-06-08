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
  const esBorradorActivo = Boolean(selected?.es_vigente) && !esOficial

  return (
    <div style={{ marginTop: '0.35rem' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--cc-caption)',
          fontWeight: 700,
          color: t.textMuted,
          marginBottom: '0.25rem',
        }}
      >
        Presupuesto base
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
      {selected && (
        <div style={{ marginTop: '0.35rem', fontSize: 'var(--cc-caption)', lineHeight: 1.4, color: t.textMuted }}>
          Visualizando costos según presupuesto v{numSel}
        </div>
      )}
      {selected && !esOficial && (
        <div
          style={{
            marginTop: '0.35rem',
            padding: '0.4rem 0.5rem',
            borderRadius: 6,
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            fontSize: 'var(--cc-caption)',
            lineHeight: 1.4,
            color: '#92400e',
          }}
        >
          ⚠ Presupuesto v{numSel} no aprobado — solo para análisis
          {esBorradorActivo ? ' (borrador activo)' : ''}
        </div>
      )}
    </div>
  )
}
