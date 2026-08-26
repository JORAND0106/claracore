/**
 * Aviso temporal tras eliminar: permite Deshacer inmediato en la sesión.
 */
import { useEffect } from 'react'

export default function PoligonalUndoToast({
  message = 'Elemento eliminado',
  onUndo,
  onDismiss,
  durationMs = 8000,
}) {
  useEffect(() => {
    if (!onDismiss || !durationMs) return undefined
    const t = setTimeout(() => onDismiss(), durationMs)
    return () => clearTimeout(t)
  }, [onDismiss, durationMs, message])

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        zIndex: 100060,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: '#0F172A',
        color: '#F8FAFC',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        maxWidth: 'min(440px, calc(100vw - 24px))',
        fontSize: 'var(--cc-sm)',
        fontWeight: 600,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#5EEAD4',
            fontWeight: 800,
            cursor: 'pointer',
            padding: '4px 6px',
            fontSize: 'var(--cc-sm)',
            textDecoration: 'underline',
          }}
        >
          Deshacer
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          style={{
            border: 'none',
            background: 'transparent',
            color: '#94A3B8',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
