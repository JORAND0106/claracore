import TopoConfirmModal from '../TopoConfirmModal.jsx'
import { useTopoTheme } from '../topografiaShared.jsx'

export default function TopoConflictModal({
  conflict,
  onResolveLocal,
  onResolveServer,
  onCancel,
  busy,
}) {
  const ui = useTopoTheme()
  if (!conflict) return null

  const local = conflict.payload || conflict.local_payload || {}
  const server = conflict.server_entity || {}

  return (
    <TopoConfirmModal
      theme={ui.t}
      titulo="Conflicto de sincronización"
      confirmLabel="Usar mi versión"
      cancelLabel="Cancelar"
      secondaryLabel="Usar versión del servidor"
      onCancel={onCancel}
      onSecondary={onResolveServer}
      onConfirm={onResolveLocal}
      busy={busy}
    >
      <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', lineHeight: 1.5 }}>
        Otro usuario modificó este registro mientras trabajaba offline. Elija qué versión prevalece.
      </p>
      <div style={{ display: 'grid', gap: 10, fontSize: 'var(--cc-xs)' }}>
        <div style={{ padding: 10, borderRadius: 8, background: ui.t?.inputBg || '#f8fafc', border: `1px solid ${ui.t?.border}` }}>
          <strong>Su versión (local)</strong>
          <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
            {JSON.stringify(local, null, 2).slice(0, 800)}
          </pre>
        </div>
        <div style={{ padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <strong>Versión del servidor</strong>
          <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
            {JSON.stringify(server?.poligonal || server?.entrega || server?.nivelacion || server, null, 2).slice(0, 800)}
          </pre>
        </div>
      </div>
    </TopoConfirmModal>
  )
}
