/**
 * Línea-resumen colapsable de vencimientos (inicio + bandeja).
 * Una sola línea: vencidas (rojo) · por vencer 1–3 d (naranja) · >3 d (verde).
 */
import { RESUMEN_VENCIMIENTO } from './vencimientoLevels'

export default function BandejaResumenLinea({
  t,
  resumen,
  abierto,
  onToggle,
  titulo = 'Seguimiento',
  subtitulo = null,
  loading = false,
  emptyLabel = 'Sin pendientes',
  chevron = true,
}) {
  const chips = [
    { ...RESUMEN_VENCIMIENTO.vencidas, count: resumen?.vencidas || 0 },
    { ...RESUMEN_VENCIMIENTO.porVencer, count: resumen?.porVencer || 0 },
    { ...RESUMEN_VENCIMIENTO.asignadas, count: resumen?.asignadas || 0 },
  ]
  const total = resumen?.total ?? chips.reduce((a, c) => a + c.count, 0)
  const hasItems = total > 0

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!!abierto}
      title={abierto ? 'Recoger detalle' : 'Ver detalle de tareas'}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 14px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: t.text,
        boxSizing: 'border-box',
        minHeight: 44,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        flex: 1,
        overflow: 'hidden',
      }}>
        <span style={{
          fontWeight: 700,
          fontSize: 'var(--cc-body)',
          flexShrink: 0,
          color: t.text,
        }}>
          {titulo}
        </span>
        {subtitulo ? (
          <span style={{
            fontSize: 'var(--cc-sm)',
            color: t.textMuted,
            flexShrink: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {subtitulo}
          </span>
        ) : null}
        {loading ? (
          <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Cargando…</span>
        ) : !hasItems ? (
          <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>{emptyLabel}</span>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            overflow: 'hidden',
          }}>
            {chips.map((c) => (
              <span
                key={c.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 700,
                  color: c.color,
                  flexShrink: 0,
                }}
                title={`${c.label}: ${c.count}`}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: c.color,
                  flexShrink: 0,
                }} />
                <span>{c.count}</span>
                <span style={{ fontWeight: 600, opacity: 0.9 }}>{c.label}</span>
              </span>
            ))}
          </span>
        )}
      </div>
      {chevron && (
        <span style={{ color: t.textMuted, flexShrink: 0, fontSize: 'var(--cc-sm)' }}>
          {abierto ? '▾' : '▸'}
        </span>
      )}
    </button>
  )
}
