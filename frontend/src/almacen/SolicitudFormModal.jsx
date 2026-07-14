import SolicitudForm from './SolicitudForm'
import { almacenFormModalDialogStyle, useAlmacenCompact, useAlmacenTheme } from './almacenShared'

const MODAL_WIDTH = 'min(1248px, 100%)'

/**
 * Popup dedicado para crear o editar una solicitud de insumos.
 */
export default function SolicitudFormModal({
  solicitudId,
  permisos,
  t,
  token,
  contratoId,
  onClose,
  onSaved,
}) {
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const isNew = !solicitudId

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100008,
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
        aria-labelledby="solicitud-form-modal-title"
        className={`cc-almacen-form-modal cc-almacen-solicitud-form-modal${compact ? ' cc-almacen-modal-sheet' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={almacenFormModalDialogStyle({ width: MODAL_WIDTH, compact })}
      >
        <div className="cc-almacen-form-modal__header cc-almacen-solicitud-form-modal__header cc-almacen-solicitud-form-modal__header--compact">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="solicitud-form-modal-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              {isNew ? '📋 Nueva solicitud de insumos' : '✏️ Editar solicitud'}
            </div>
            {!compact && (
              <div style={{ fontSize: 'var(--cc-xs)', color: 'var(--cc-almacen-text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                {isNew
                  ? 'Materiales, PK-ID y control presupuestal por línea.'
                  : 'Actualice título, insumos y ubicaciones.'}
              </div>
            )}
          </div>
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '6px 12px', flexShrink: 0 }}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="cc-almacen-form-modal__body cc-almacen-solicitud-form-modal__body">
          <SolicitudForm
            solicitudId={solicitudId}
            permisos={permisos}
            t={t}
            token={token}
            contratoId={contratoId}
            embedded
            onSaved={onSaved}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
