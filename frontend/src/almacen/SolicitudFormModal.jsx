import { useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import CcConfirmModal from '../components/CcConfirmModal'
import SolicitudForm from './SolicitudForm'
import {
  almacenFormModalDialogStyle,
  buildAlmacenConfirmTheme,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const MODAL_WIDTH = 'min(1248px, 100%)'

/**
 * Popup dedicado para crear o editar una solicitud de insumos.
 * Advierte al cerrar/cancelar si aún no se solicitó aprobación.
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
  const theme = buildAlmacenConfirmTheme(t, ui)
  const isNew = !solicitudId
  const [dirty, setDirty] = useState(false)
  const [approvalSent, setApprovalSent] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [solEstado, setSolEstado] = useState(null)

  const needsApprovalWarn = !approvalSent && (
    dirty
    || solEstado === 'borrador'
    || solEstado === 'rechazada'
  )

  const requestClose = () => {
    if (needsApprovalWarn) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  return (
    <>
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
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="solicitud-form-modal-title"
          className={`cc-almacen-form-modal cc-almacen-solicitud-form-modal${compact ? ' cc-almacen-modal-sheet' : ''}`}
          onClick={(e) => e.stopPropagation()}
          style={almacenFormModalDialogStyle({ width: MODAL_WIDTH, compact })}
        >          <CcModalBrandHeader theme={t} />

          <div className="cc-almacen-form-modal__header cc-almacen-solicitud-form-modal__header cc-almacen-solicitud-form-modal__header--compact">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div id="solicitud-form-modal-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
                {isNew ? '📋 Nueva solicitud de insumos' : '✏️ Editar solicitud'}
              </div>
              {!compact && (
                <div style={{ fontSize: 'var(--cc-xs)', color: 'var(--cc-almacen-text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                  {isNew
                    ? 'Describa el material, PK-ID y control presupuestal por línea.'
                    : 'Actualice título, descripción del material y ubicaciones.'}
                </div>
              )}
            </div>
            <button
              type="button"
              style={{ ...ui.btnSecondary, padding: '6px 12px', flexShrink: 0 }}
              onClick={requestClose}
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
              onDirtyChange={setDirty}
              onEstadoChange={setSolEstado}
              onApprovalSent={() => {
                setApprovalSent(true)
                setDirty(false)
              }}
              onSaved={(result) => {
                if (result?.estado) setSolEstado(result.estado)
                if (result?.estado === 'enviada' || result?.estado === 'aprobada') {
                  setApprovalSent(true)
                  setDirty(false)
                }
                onSaved?.(result)
              }}
              onCancel={requestClose}
            />
          </div>
        </div>
      </div>

      {confirmClose && (
        <CcConfirmModal
          theme={theme}
          tipo="warn"
          titulo="Solicitud sin enviar"
          confirmar="Cerrar de todos modos"
          cancelar="Volver al formulario"
          zIndex={100030}
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false)
            onClose()
          }}
        >
          La solicitud no ha sido enviada para aprobación. Si cierra ahora, podría perder la información diligenciada.
        </CcConfirmModal>
      )}
    </>
  )
}
