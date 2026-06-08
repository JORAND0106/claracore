/** Selector de tramo para filtrar PKs en el mapa de programación. */

export default function ProgTramoSelector({
  tramos = [],
  value,
  onChange,
  t,
  disabled = false,
  programableCountByTramo = {},
}) {
  const options = tramos.filter((tr) => (programableCountByTramo[tr.tramo] || 0) > 0)
  if (!options.length) return null

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
        Filtrar por tramo
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
        <option value="">Todos los tramos</option>
        {options.map((tr) => {
          const n = programableCountByTramo[tr.tramo] || tr.pk_ids?.length || 0
          return (
            <option key={tr.tramo} value={tr.tramo}>
              {tr.tramo} ({n} PK{n === 1 ? '' : 's'})
            </option>
          )
        })}
      </select>
    </div>
  )
}
