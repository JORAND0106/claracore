import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import { fmtAbscisasLinea, fmtNodosLinea, nodosLineaSolicitud } from './solicitudDetalleHelpers'
import {
  almacenFormModalDialogStyle,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Modal liviano: mapa de ubicación con Abs. Ini/Fin y Nodo Ini/Fin.
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
  const absTxt = fmtAbscisasLinea(item)
  const nodos = nodosLineaSolicitud(item)
  const nodosTxt = fmtNodosLinea(item)
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
        style={almacenFormModalDialogStyle({ width: 'min(680px, 100%)', compact })}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 12,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              🗺️ Ubicación
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 2 }}>
              PK-ID {pkLabel || '—'}
              {item.tramo ? ` · Tramo ${item.tramo}` : ''}
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '6px 12px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
          gap: 8,
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${ui.textMuted}33`,
          background: `${ui.accentSoft}`,
          fontSize: 'var(--cc-sm)',
        }}
        >
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted, marginBottom: 2 }}>
              Abs. Ini — Fin
            </div>
            <div style={{ fontWeight: 600 }}>{absTxt}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted, marginBottom: 2 }}>
              Nodo Ini — Fin
            </div>
            <div style={{ fontWeight: 600 }} title={nodosTxt}>
              {nodos.inicio || nodos.final ? nodosTxt : '—'}
            </div>
          </div>
        </div>

        {pkLabel ? (
          <div style={{ position: 'relative' }}>
            <AlmacenItemMapaPreview
              t={theme}
              token={token}
              contratoId={contratoId}
              pkLabel={pkLabel}
              height={compact ? 280 : 360}
            />
            <div style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--cc-almacen-bg-card, #fff) 92%, transparent)',
              border: `1px solid ${ui.textMuted}33`,
              fontSize: 'var(--cc-xs)',
              color: ui.text,
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
              pointerEvents: 'none',
            }}
            >
              <strong>Abs:</strong> {absTxt}
              {' · '}
              <strong>Nodos:</strong> {nodosTxt}
            </div>
          </div>
        ) : (
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', padding: 16 }}>
            Esta línea no tiene PK-ID asignado.
          </div>
        )}
      </div>
    </div>
  )
}
