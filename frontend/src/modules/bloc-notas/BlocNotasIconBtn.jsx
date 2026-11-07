/** Botón solo icono + tooltip institucional (title → CcTitleTooltips). */
export default function BlocNotasIconBtn({
  title,
  onClick,
  children,
  t,
  active = false,
  disabled = false,
  size = 36,
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-cc-tooltip={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: `1px solid ${active ? (t?.primary || '#0077B6') : (t?.border || '#cbd5e1')}`,
        background: active ? (t?.primary || '#0077B6') : (t?.bgCard || '#fff'),
        color: active ? '#fff' : (t?.text || '#0f172a'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size > 32 ? 16 : 14,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
