/**
 * Barra segmentada (4 grupos) de avance documental RRHH.
 * Orden: Contrato · Soporte · Ingreso · Afiliación.
 */
import { DOCS_FILL_GROUPS, docsFillLegend, normalizeDocsFill } from './rrhhDocsFill.js'

const SEG_COLORS = {
  contrato: { fill: '#0d9488', empty: 'rgba(13,148,136,0.18)' },
  soporte: { fill: '#2563eb', empty: 'rgba(37,99,235,0.18)' },
  ingreso: { fill: '#d97706', empty: 'rgba(217,119,6,0.18)' },
  afiliacion: { fill: '#059669', empty: 'rgba(5,150,105,0.18)' },
}

export function DocsFillBattery({ docsFill, height = 12, title }) {
  const fill = normalizeDocsFill(docsFill)
  const tip = title || DOCS_FILL_GROUPS.map((g) => {
    const s = fill[g]
    const pct = s.total > 0 ? Math.round(s.ratio * 100) : 0
    const meta = docsFillLegend.find((x) => x.key === g)
    return `${meta?.short || g}: ${s.filled}/${s.total || 0} (${pct}%)`
  }).join(' · ')

  return (
    <div
      title={tip}
      aria-label={tip}
      role="img"
      style={{
        display: 'flex',
        width: '100%',
        minWidth: 88,
        maxWidth: 160,
        height,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid rgba(15,23,42,0.12)',
        background: '#f1f5f9',
        boxSizing: 'border-box',
      }}
    >
      {DOCS_FILL_GROUPS.map((g, i) => {
        const s = fill[g]
        const colors = SEG_COLORS[g]
        const pct = s.total > 0 ? Math.max(0, Math.min(100, s.ratio * 100)) : 0
        return (
          <div
            key={g}
            style={{
              flex: 1,
              position: 'relative',
              background: colors.empty,
              borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.85)',
              minWidth: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                background: colors.fill,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export function DocsFillLegend({ theme }) {
  const muted = theme?.textMuted || '#64748b'
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 14px',
        alignItems: 'center',
        fontSize: 'var(--cc-caption, 11px)',
        color: muted,
        lineHeight: 1.35,
      }}
      aria-label="Leyenda de avance documental"
    >
      <span style={{ fontWeight: 700, color: muted }}>Avance documental:</span>
      {docsFillLegend.map((item) => {
        const c = SEG_COLORS[item.key]
        return (
          <span
            key={item.key}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title={item.label}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: c.fill,
                flexShrink: 0,
              }}
            />
            <span>{item.order}. {item.short}</span>
          </span>
        )
      })}
    </div>
  )
}
