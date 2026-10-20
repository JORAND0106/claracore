import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'

/**
 * Ventana institucional ClaraCore para avisos breves (errores de foto, etc.).
 * No cierra el resto del formulario: solo informa.
 */
export default function SicoeMensajeModal({
  open,
  onClose,
  t,
  title = 'Aviso',
  message = '',
  confirmLabel = 'Entendido',
}) {
  if (!open || typeof document === 'undefined') return null

  const theme = t || {
    bgCard: '#0F1923',
    bg: '#15202B',
    border: '#334155',
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    primary: '#0EA5A8',
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
        <CcModalBrandHeader theme={t || theme} />
        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: theme.primary, marginBottom: 8 }}>
            {title}
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', lineHeight: 1.45, color: theme.text, whiteSpace: 'pre-wrap' }}>
            {message}
          </div>
        </div>
        <div style={{ padding: '12px 20px 16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: theme.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: 'var(--cc-sm)',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
