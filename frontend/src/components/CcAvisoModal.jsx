/**
 * Aviso modal discreto del sistema (reemplaza window.alert en flujos ClaraCore).
 */
export default function CcAvisoModal({
  theme,
  titulo = 'Aviso',
  mensaje,
  tipo = 'info',
  boton = 'Entendido',
  onClose,
}) {
  const t = theme || {}
  const palette = {
    info: { accent: t.primary || '#0077B6', bg: `${t.primary || '#0077B6'}14` },
    ok: { accent: '#059669', bg: '#05966914' },
    warn: { accent: '#D97706', bg: '#FEF3C7' },
  }[tipo] || { accent: t.primary || '#0077B6', bg: `${t.primary || '#0077B6'}14` }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100010,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-aviso-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 20px 14px', background: palette.bg, borderBottom: `1px solid ${t.border || '#E2E8F0'}` }}>
          <div id="cc-aviso-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: palette.accent }}>
            {titulo}
          </div>
        </div>
        <div style={{ padding: '16px 20px 18px', fontSize: 'var(--cc-sm)', color: t.text || '#0F172A', lineHeight: 1.5 }}>
          {mensaje}
        </div>
        <div style={{ padding: '0 20px 18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: palette.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {boton}
          </button>
        </div>
      </div>
    </div>
  )
}
