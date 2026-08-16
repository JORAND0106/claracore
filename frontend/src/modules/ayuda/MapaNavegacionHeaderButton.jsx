/**
 * Acceso al mapa panorámico desde la barra superior (junto a Clara).
 * Visualmente alineado con AVITriggerButton (mismo tamaño táctil y marco).
 */
export default function MapaNavegacionHeaderButton({ t, active = false, onClick }) {
  const primary = t?.primary || '#0077B6'
  const bg = t?.bgCard || t?.bg || '#f3f4f6'
  const textColor = t?.text || '#1e293b'
  const borderColor = active ? '#00B4C6' : primary
  const title = active
    ? 'Mapa panorámico de navegación (activo)'
    : 'Abrir mapa panorámico de navegación'

  return (
    <button
      type="button"
      className={`cc-mapa-nav-trigger-btn${active ? ' cc-mapa-nav-trigger-btn--active' : ''}`}
      onClick={onClick}
      aria-label={title}
      aria-pressed={!!active}
      title={title}
      style={{
        background: bg,
        color: textColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '5px 8px 6px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        minWidth: '44px',
        minHeight: '44px',
        lineHeight: 1,
        flexShrink: 0,
        boxShadow: active
          ? '0 8px 22px rgba(0,119,182,0.2), 0 4px 10px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.65)'
          : '0 6px 18px rgba(0,0,0,0.1), 0 3px 8px rgba(0,119,182,0.14), inset 0 1px 0 rgba(255,255,255,0.55)',
        transition: 'transform 0.12s ease, box-shadow 0.2s ease, border-color 0.15s ease',
      }}
    >
      <span aria-hidden style={{ fontSize: '20px', lineHeight: 1 }}>🧭</span>
      <span
        style={{
          fontSize: '9px',
          fontWeight: 700,
          color: primary,
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        Mapa
      </span>
    </button>
  )
}
