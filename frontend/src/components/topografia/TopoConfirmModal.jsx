/**
 * Modal de confirmacion propio de la plataforma (diseño y colores corporativos).
 * Reemplaza al window.confirm nativo del navegador.
 */
export default function TopoConfirmModal({
  theme,
  titulo = 'Confirmar accion',
  children,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  danger = false,
  busy = false,
}) {
  const t = theme || {}
  const acento = danger ? '#DC2626' : '#0E7C86'
  const acentoSuave = danger ? '#FEE2E2' : '#E6F4F5'
  const acentoBorde = danger ? '#FECACA' : '#BCE3E6'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100040,
        background: t.overlay || 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="topo-confirm-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: acentoSuave,
            borderBottom: `1px solid ${acentoBorde}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 'var(--cc-lg)', lineHeight: 1 }} aria-hidden>{danger ? '🗑️' : 'ℹ️'}</span>
          <div id="topo-confirm-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: acento }}>
            {titulo}
          </div>
        </div>
        <div style={{ padding: '18px 20px', fontSize: 'var(--cc-sm)', color: t.text || '#0F172A', lineHeight: 1.55, textAlign: 'center' }}>
          {children}
        </div>
        <div style={{ padding: '4px 20px 18px', display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              background: t.bgCard || '#fff',
              color: t.text || '#334155',
              border: `1px solid ${t.border || '#CBD5E1'}`,
              borderRadius: 8,
              padding: '9px 22px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              background: acento,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 22px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
