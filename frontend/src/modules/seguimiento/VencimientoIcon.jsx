import { metaNivelVencimiento } from './vencimientoLevels'

/** Icono de nivel de vencimiento (misma lógica visual de criticidad, iconografía propia). */
export default function VencimientoIcon({ nivel, size = '1.25rem', showLabel = false, t }) {
  const meta = metaNivelVencimiento(nivel)
  if (!meta) {
    return <span style={{ color: t?.textMuted || '#94a3b8', fontSize: 'var(--cc-xs)' }}>—</span>
  }
  return (
    <span
      title={`Nivel ${meta.key}: ${meta.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: meta.color,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {showLabel && (
        <span style={{ fontSize: 'var(--cc-xs)', color: meta.color }}>{meta.label}</span>
      )}
    </span>
  )
}
