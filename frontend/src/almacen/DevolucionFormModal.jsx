import { useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import CcConfirmModal from '../components/CcConfirmModal'
import DevolucionForm from './DevolucionForm'
import {
  almacenFormModalDialogStyle,
  buildAlmacenConfirmTheme,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const MODAL_WIDTH = 'min(920px, 100%)'

export default function DevolucionFormModal({
  t,
  token,
  contratoId,
  onClose,
  onSaved,
  zIndex = 100008,
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
          zIndex,
          display: 'flex',
          alignItems: compact ? 'flex-end' : 'center',
          justifyContent: 'center',
          padding: compact ? 0 : 16,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="devolucion-form-modal-title"
          className={`cc-almacen-form-modal cc-almacen-solicitud-form-modal${compact ? ' cc-almacen-modal-sheet' : ''}`}
          onClick={(e) => e.stopPropagation()}
          style={almacenFormModalDialogStyle({ width: MODAL_WIDTH, compact })}
        >
          <CcModalBrandHeader theme={t} />
          <div className="cc-almacen-form-modal__header cc-almacen-solicitud-form-modal__header cc-almacen-solicitud-form-modal__header--compact">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div id="devolucion-form-modal-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
                ↩️ Devolución de material
              </div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                Reingreso de material no usado en obra. Reactiva el saldo disponible de la entrada/OC.
              </div>
            </div>
            <button type="button" style={ui.btnSecondary} onClick={requestClose}>
              Cerrar
            </button>
          </div>
          <div className="cc-almacen-form-modal__body" style={{ padding: compact ? '12px 14px 16px' : '16px 20px 20px' }}>
            <DevolucionForm
              token={token}
              contratoId={contratoId}
              theme={t}
              embedded
              onDirtyChange={setDirty}
              onCancel={requestClose}
              onSaved={onSaved}
            />
          </div>
        </div>
      </div>

      {confirmDiscard && (
        <CcConfirmModal
          theme={theme}
          tipo="warning"
          titulo="Descartar devolución"
          confirmar="Descartar"
          cancelar="Seguir editando"
          zIndex={Number(zIndex) + 20}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { setConfirmDiscard(false); onClose() }}
        >
          Hay datos diligenciados. ¿Descartar la devolución?
        </CcConfirmModal>
      )}
    </>
  )
}
