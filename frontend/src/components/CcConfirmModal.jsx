/**
 * Confirmación modal del sistema (reemplaza window.confirm en flujos ClaraCore).
 */
export default function CcConfirmModal({
  theme,
  titulo = 'Confirmar',
  children,
  tipo = 'warn',
  confirmar = 'Confirmar',
  cancelar = 'Cancelar',
  soloConfirmar = false,
  zIndex = 100020,
  procesando = false,
  onConfirm,
  onCancel,
}) {
  const t = theme || {}
  const palette = {
    warn: { accent: '#D97706', bg: '#FEF3C7', icon: '⚠️' },
    info: { accent: t.primary || '#0077B6', bg: `${t.primary || '#0077B6'}14`, icon: 'ℹ️' },
    danger: { accent: '#DC2626', bg: '#FEE2E2', icon: '⚠️' },
    success: { accent: 'var(--cc-color-success)', bg: '#ECFDF5', icon: '✅' },
  }[tipo] || { accent: t.primary || '#0077B6', bg: `${t.primary || '#0077B6'}14`, icon: 'ℹ️' }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-confirm-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px 12px',
            background: palette.bg,
            borderBottom: `1px solid ${t.border || '#E2E8F0'}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 'var(--cc-lg)', lineHeight: 1 }} aria-hidden>{palette.icon}</span>
          <div id="cc-confirm-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: palette.accent }}>
            {titulo}
          </div>
        </div>
        <div style={{ padding: '16px 20px 6px', fontSize: 'var(--cc-sm)', color: t.text || '#0F172A', lineHeight: 1.45 }}>
          {children}
        </div>
        <div
          style={{
            padding: '12px 20px 18px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {!soloConfirmar && (
            <button
              type="button"
              disabled={procesando}
              onClick={onCancel}
              style={{
                background: 'transparent',
                color: t.textMuted || '#64748B',
                border: `1px solid ${t.border || '#CBD5E1'}`,
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 600,
                cursor: procesando ? 'wait' : 'pointer',
                opacity: procesando ? 0.6 : 1,
              }}
            >
              {cancelar}
            </button>
          )}
          <button
            type="button"
            disabled={procesando}
            onClick={(e) => {
              e.stopPropagation();
              if (soloConfirmar) onCancel?.();
              else void onConfirm?.();
            }}
            style={{
              background: palette.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: procesando ? 'wait' : 'pointer',
              opacity: procesando ? 0.75 : 1,
            }}
          >
            {procesando ? 'Procesando…' : confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
