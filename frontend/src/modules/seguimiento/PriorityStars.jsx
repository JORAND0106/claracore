/** Selector de prioridad 0–3 estrellas (misma convención visual ★/☆). */
export default function PriorityStars({ t, value = 0, onChange, readOnly = false }) {
  const n = Math.max(0, Math.min(3, Number(value) || 0))
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} role="group" aria-label="Prioridad">
      {[1, 2, 3].map((level) => {
        const active = n >= level
        return (
          <button
            key={level}
            type="button"
            disabled={readOnly}
            title={level === 1 ? 'Prioridad baja' : level === 2 ? 'Prioridad media' : 'Prioridad alta'}
            aria-pressed={active}
            onClick={() => {
              if (readOnly || typeof onChange !== 'function') return
              onChange(n === level ? level - 1 : level)
            }}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: readOnly ? 'default' : 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              padding: 2,
              color: active ? (t?.warning || '#D97706') : (t?.textMuted || '#94a3b8'),
            }}
          >
            {active ? '★' : '☆'}
          </button>
        )
      })}
      <span style={{ fontSize: 'var(--cc-xs)', color: t?.textMuted, marginLeft: 4 }}>
        {n === 0 ? 'Sin prioridad' : n === 1 ? 'Baja' : n === 2 ? 'Media' : 'Alta'}
      </span>
    </div>
  )
}

export function estrellasTexto(prioridad) {
  const n = Math.max(0, Math.min(3, Number(prioridad) || 0))
  if (!n) return ''
  return '★'.repeat(n) + '☆'.repeat(3 - n)
}
