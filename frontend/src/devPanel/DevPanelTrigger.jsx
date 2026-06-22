/** Ícono discreto (terminal) — esquina inferior derecha de la landing. */
export default function DevPanelTrigger({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title=""
      aria-label=" "
      style={{
        position: 'fixed',
        right: 14,
        bottom: 14,
        zIndex: 50,
        width: 28,
        height: 28,
        padding: 0,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'rgba(128,128,128,0.35)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'rgba(160,160,160,0.55)'
        e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'rgba(128,128,128,0.35)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 17l6-6-6-6M12 19h8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
