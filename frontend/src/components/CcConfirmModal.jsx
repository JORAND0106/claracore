/**
 * Confirmación modal del sistema (reemplaza window.confirm en flujos ClaraCore).
 */
function mixWithSurface(color, surface, pct = 14) {
  return `color-mix(in srgb, ${color} ${pct}%, ${surface})`
}

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
  const surface = t.bgCard || 'var(--cc-almacen-bg-card, #ffffff)'
  const text = t.text || 'var(--cc-almacen-text, #0F172A)'
  const border = t.border || 'var(--cc-almacen-border, #E2E8F0)'
  const overlay = t.overlay || 'var(--cc-almacen-overlay, rgba(15, 23, 42, 0.48))'
  const primary = t.primary || 'var(--cc-almacen-accent, #0077B6)'
  const success = t.success || 'var(--cc-color-success, #16a34a)'
  const danger = t.danger || '#DC2626'
  const warn = t.warn || '#D97706'

  const palette = {
    warn: { accent: warn, bg: mixWithSurface(warn, surface, 16), icon: '⚠️' },
    info: { accent: primary, bg: mixWithSurface(primary, surface, 14), icon: 'ℹ️' },
    danger: { accent: danger, bg: mixWithSurface(danger, surface, 12), icon: '⚠️' },
    success: { accent: success, bg: mixWithSurface(success, surface, 14), icon: '✅' },
  }[tipo] || { accent: primary, bg: mixWithSurface(primary, surface, 14), icon: 'ℹ️' }

  const confirmTextColor = '#fff'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: overlay,
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
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 14,
          boxShadow: t.shadow || 'var(--cc-almacen-shadow-modal, 0 24px 64px rgba(0,0,0,0.28))',
          overflow: 'hidden',
          color: text,
        }}
      >
        <div
          style={{
            padding: '16px 20px 12px',
            background: palette.bg,
            borderBottom: `1px solid ${border}`,
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
        <div style={{ padding: '16px 20px 6px', fontSize: 'var(--cc-sm)', color: text, lineHeight: 1.45 }}>
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
                color: t.textMuted || 'var(--cc-almacen-text-muted, #64748B)',
                border: `1px solid ${border}`,
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
              color: confirmTextColor,
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
