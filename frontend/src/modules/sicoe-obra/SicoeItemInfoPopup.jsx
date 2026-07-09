import { createPortal } from 'react-dom'

/**
 * Popup ClaraCore con datos del ítem (sin imagen).
 * Solo presentación — no altera datos.
 */
export default function SicoeItemInfoPopup({
  open,
  onClose,
  t,
  title = 'Detalle del ítem',
  item = null,
  descripcion = null,
  unidad = null,
  vlrUnitario = null,
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

  const rows = [
    { label: 'Ítem', value: item },
    { label: 'Descripción', value: descripcion, full: true },
    { label: 'Unidad', value: unidad },
    { label: 'Vlr. unitario', value: vlrUnitario },
  ].filter((row) => row.value != null && String(row.value).trim() !== '')

  return createPortal(
    <div
      className="cc-sicoe-item-info-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="cc-sicoe-item-info-panel"
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          color: theme.text,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="cc-sicoe-item-info-header"
          style={{
            borderBottom: `1px solid ${theme.border}`,
            background: `color-mix(in srgb, ${theme.primary} 14%, ${theme.bgCard})`,
          }}
        >
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: theme.primary, lineHeight: 1.3, minWidth: 0, flex: 1 }}>
            {title}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              borderRadius: 10,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.text,
              fontSize: '1.15rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div className="cc-sicoe-item-info-body" style={{ background: theme.bg }}>
          {rows.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 'var(--cc-sm)' }}>Sin datos del ítem.</div>
          ) : (
            rows.map((row) => (
              <div key={row.label} className="cc-sicoe-item-info-row">
                <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  {row.label}
                </div>
                <div
                  style={{
                    fontSize: 'var(--cc-body)',
                    fontWeight: 600,
                    color: theme.text,
                    lineHeight: 1.45,
                    whiteSpace: row.full ? 'pre-wrap' : 'normal',
                    wordBreak: 'break-word',
                  }}
                >
                  {row.value}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
