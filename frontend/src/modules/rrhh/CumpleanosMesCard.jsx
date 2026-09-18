/**
 * Tarjeta de cumpleaños del mes — vista principal RRHH.
 * Visualmente distinta de las tarjetas por contratista (sin clic / sin acciones).
 */
import { nombreMesEs } from './rrhhCumpleanos'

const CUMPLE_STYLE = {
  bg: '#FFF7ED',
  border: '#FDBA74',
  accent: '#C2410C',
  text: '#7C2D12',
  muted: '#9A3412',
}

export default function CumpleanosMesCard({ cumpleanos }) {
  const mes = cumpleanos?.mes
  const items = Array.isArray(cumpleanos?.items) ? cumpleanos.items : []
  const mesLabel = nombreMesEs(mes)
  const titulo = mesLabel
    ? `Cumpleaños de ${mesLabel}`
    : 'Cumpleaños del mes'

  return (
    <div
      style={{
        textAlign: 'left',
        background: CUMPLE_STYLE.bg,
        border: `1.5px solid ${CUMPLE_STYLE.border}`,
        borderRadius: 14,
        padding: '14px 14px 12px',
        color: CUMPLE_STYLE.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 148,
        boxShadow: '0 1px 2px rgba(124,45,18,0.06)',
        gridColumn: items.length > 4 ? '1 / -1' : undefined,
      }}
      aria-label={titulo}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#fff',
            border: `1px solid ${CUMPLE_STYLE.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 20,
          }}
          aria-hidden
        >
          🎂
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-lg)', lineHeight: 1.2, color: CUMPLE_STYLE.text }}>
            {titulo}
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: CUMPLE_STYLE.muted, marginTop: 2, fontWeight: 600 }}>
            {items.length === 0
              ? 'Sin cumpleaños este mes'
              : `${items.length} colaborador${items.length === 1 ? '' : 'es'} activo${items.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 2,
          paddingTop: 8,
          borderTop: `1px solid ${CUMPLE_STYLE.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxHeight: 160,
          overflowY: 'auto',
        }}
      >
        {items.length === 0 ? (
          <div style={{ fontSize: 'var(--cc-sm)', color: CUMPLE_STYLE.muted }}>
            Ningún colaborador activo cumple años en este mes.
          </div>
        ) : (
          items.map((row) => (
            <div
              key={row.id ?? `${row.primer_nombre}-${row.dia}-${row.empresa_nombre}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr minmax(0, 1.1fr)',
                gap: 8,
                alignItems: 'baseline',
                fontSize: 'var(--cc-sm)',
                lineHeight: 1.3,
              }}
            >
              <span style={{ fontWeight: 800, color: CUMPLE_STYLE.accent, fontVariantNumeric: 'tabular-nums' }}>
                {String(row.dia).padStart(2, '0')}
              </span>
              <span style={{ fontWeight: 700, color: CUMPLE_STYLE.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.primer_nombre || '—'}
              </span>
              <span
                title={row.empresa_nombre || ''}
                style={{
                  color: CUMPLE_STYLE.muted,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'right',
                }}
              >
                {row.empresa_nombre || '—'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
