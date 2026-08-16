import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import { fmtAbscisasLinea } from './solicitudDetalleHelpers'
import {
  almacenFormModalDialogStyle,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Modal liviano: solo el mapa de ubicación de una línea de solicitud.
 */
export default function SolicitudLineaMapaModal({
  item,
  token,
  contratoId,
  t,
  onClose,
}) {
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  if (!item) return null

  const pkLabel = item.pk_label || item.pk_id || ''
  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100040,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ubicación de la línea"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={almacenFormModalDialogStyle({ width: 'min(640px, 100%)', compact })}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 10,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              🗺️ Ubicación
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 2 }}>
              PK-ID {pkLabel || '—'}
              {item.tramo ? ` · Tramo ${item.tramo}` : ''}
              {` · ${fmtAbscisasLinea(item)}`}
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '6px 12px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {pkLabel ? (
          <AlmacenItemMapaPreview
            t={theme}
            token={token}
            contratoId={contratoId}
            pkLabel={pkLabel}
            height={compact ? 280 : 360}
          />
        ) : (
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', padding: 16 }}>
            Esta línea no tiene PK-ID asignado.
          </div>
        )}
      </div>
    </div>
  )
}
