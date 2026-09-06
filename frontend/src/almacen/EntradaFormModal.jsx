import { useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import CcConfirmModal from '../components/CcConfirmModal'
import EntradaForm from './EntradaForm'
import {
  almacenFormModalDialogStyle,
  buildAlmacenConfirmTheme,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const MODAL_WIDTH = 'min(1180px, 100%)'

/** Popup dedicado para registrar una nueva entrada contra OC. */
export default function EntradaFormModal({
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
  const [dirty, setDirty] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const requestClose = () => {
    if (dirty) {
      setConfirmDiscard(true)
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
          aria-labelledby="entrada-form-modal-title"
          className={`cc-almacen-form-modal cc-almacen-solicitud-form-modal${compact ? ' cc-almacen-modal-sheet' : ''}`}
          onClick={(e) => e.stopPropagation()}
          style={almacenFormModalDialogStyle({ width: MODAL_WIDTH, compact })}
        >
          <CcModalBrandHeader theme={t} />
          <div className="cc-almacen-form-modal__header cc-almacen-solicitud-form-modal__header cc-almacen-solicitud-form-modal__header--compact">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div id="entrada-form-modal-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
                📥 Nueva entrada de material
              </div>
              {!compact && (
                <div style={{ fontSize: 'var(--cc-xs)', color: 'var(--cc-almacen-text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                  Registro contra orden de compra con remisión obligatoria (máx. 300 KB).
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
            <EntradaForm
              permisos={permisos}
              token={token}
              contratoId={contratoId}
              theme={t}
              embedded
              onSaved={onSaved}
              onCancel={requestClose}
              onDirtyChange={setDirty}
            />
          </div>
        </div>
      </div>

      {confirmDiscard && (
        <CcConfirmModal
          theme={theme}
          tipo="warn"
          titulo="Descartar entrada"
          confirmar="Descartar"
          cancelar="Seguir editando"
          zIndex={100030}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false)
            onClose()
          }}
        >
          Hay información sin guardar en el formulario de entrada. ¿Desea cerrar y perder lo diligenciado?
        </CcConfirmModal>
      )}
    </>
  )
}
