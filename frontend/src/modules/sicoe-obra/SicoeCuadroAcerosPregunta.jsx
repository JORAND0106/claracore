import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'

/** Popup institucional de una línea: ¿crear cuadro de aceros? */
export default function SicoeCuadroAcerosPregunta({
  open,
  onSi,
  onNo,
  t,
}) {
  if (!open || typeof document === 'undefined') return null
  const theme = t || {
    bgCard: '#0F1923',
    border: '#334155',
    text: '#E2E8F0',
    primary: '#0EA5A8',
  }
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cuadro de aceros"
      data-testid="sicoe-cuadro-aceros-pregunta"
      onClick={(e) => { if (e.target === e.currentTarget) onNo?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 12050,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          color: theme.text,
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: theme.primary, marginBottom: 8 }}>
            Cuadro de aceros
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', lineHeight: 1.4 }}>
            ¿Desea crear un cuadro de aceros?
          </div>
        </div>
        <div style={{ padding: '12px 20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            data-testid="sicoe-cuadro-aceros-no"
            onClick={onNo}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.text,
              borderRadius: 8,
              padding: '8px 16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            No
          </button>
          <button
            type="button"
            data-testid="sicoe-cuadro-aceros-si"
            onClick={onSi}
            style={{
              background: theme.primary,
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sí
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
