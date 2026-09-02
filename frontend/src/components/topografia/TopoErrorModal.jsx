/**
 * Modal de error del sistema para Topografia (mensajes claros al usuario).
 */
import CcModalBrandHeader from '../CcModalBrandHeader'

export default function TopoErrorModal({
  theme,
  titulo = 'No se pudo completar',
  children,
  onClose,
  cerrar = 'Entendido',
}) {
  const t = theme || {}

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100030,
        background: t.overlay || 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="topo-error-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#E2E8F0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div
          style={{
            padding: '16px 20px 12px',
            background: '#FEE2E2',
            borderBottom: '1px solid #FECACA',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 'var(--cc-lg)', lineHeight: 1 }} aria-hidden>⚠️</span>
          <div id="topo-error-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800, color: '#DC2626' }}>
            {titulo}
          </div>
        </div>
        <div style={{ padding: '16px 20px 6px', fontSize: 'var(--cc-sm)', color: t.text || '#0F172A', lineHeight: 1.5 }}>
          {children}
        </div>
        <div style={{ padding: '12px 20px 18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="cc-topo-touch-btn"
            onClick={onClose}
            style={{
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            {cerrar}
          </button>
        </div>
      </div>
    </div>
  )
}
