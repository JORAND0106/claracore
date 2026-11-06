/**
 * Acceso al Bloc de notas — junto al Manual de uso.
 * Tooltip institucional: «Bloc de notas» (CcTitleTooltips via title).
 */
import BlocNotasOwlIcon from './BlocNotasOwlIcon'

export default function BlocNotasHeaderButton({ t, active = false, onClick, disabled = false }) {
  const primary = t?.primary || '#0077B6'
  const bg = t?.bgCard || t?.bg || '#f3f4f6'
  const textColor = t?.text || '#1e293b'
  const borderColor = active ? '#00B4C6' : primary
  const title = 'Bloc de notas'

  return (
    <button
      type="button"
      className={`cc-bloc-notas-trigger-btn${active ? ' cc-bloc-notas-trigger-btn--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      aria-pressed={!!active}
      title={title}
      style={{
        background: bg,
        color: textColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '5px 6px 6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        minWidth: '52px',
        maxWidth: '64px',
        minHeight: '44px',
        lineHeight: 1,
        flexShrink: 0,
        boxShadow: active
          ? '0 8px 22px rgba(0,119,182,0.2), 0 4px 10px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.65)'
          : '0 6px 18px rgba(0,0,0,0.1), 0 3px 8px rgba(0,119,182,0.14), inset 0 1px 0 rgba(255,255,255,0.55)',
        transition: 'transform 0.12s ease, box-shadow 0.2s ease, border-color 0.15s ease',
      }}
    >
      <BlocNotasOwlIcon size={22} />
      <span
        style={{
          fontSize: '8px',
          fontWeight: 700,
          color: primary,
          letterSpacing: '0.01em',
          lineHeight: 1.15,
          textAlign: 'center',
          whiteSpace: 'normal',
          maxWidth: '56px',
        }}
      >
        Bloc
      </span>
    </button>
  )
}
