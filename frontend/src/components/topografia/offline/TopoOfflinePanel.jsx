import { useState } from 'react'
import { getTopoPendingOps } from './topoDb.js'
import { useTopoOffline } from './TopoOfflineContext.jsx'
import { useTopoTheme } from '../topografiaShared.jsx'

const STATUS_LABEL = {
  pendiente: 'Pendiente',
  en_proceso: 'Sincronizando',
  fallida: 'Fallida',
  conflict: 'Conflicto',
  synced: 'Sincronizada',
}

const SUBMOD_LABEL = {
  biblioteca: 'Biblioteca',
  poligonal: 'Poligonal',
  newpoint: 'NewPoint',
  nivelacion: 'Nivelación',
  entrega_dg: 'Entrega DG',
  tuberia: 'Tubería',
  areas: 'Áreas',
  equipos: 'Equipos',
}

export default function TopoOfflinePanel({ contratoId, compact = false, onClose }) {
  const ui = useTopoTheme()
  const {
    pendingCount,
    failedCount,
    syncState,
    syncError,
    lastSyncAt,
    runSync,
    retryFailed,
    refreshCounts,
    isOnline,
  } = useTopoOffline()
  const [ops, setOps] = useState([])
  const [loading, setLoading] = useState(false)

  const cargarOps = async () => {
    if (!contratoId) return
    setLoading(true)
    try {
      const rows = await getTopoPendingOps(contratoId)
      setOps(rows.filter((o) => o.status !== 'synced'))
      await refreshCounts()
    } finally {
      setLoading(false)
    }
  }

  const abrir = () => {
    cargarOps()
  }

  if (!compact) {
    // Panel expandido inline
    return (
      <div style={{ ...ui.card, marginTop: 8, fontSize: 'var(--cc-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Cola offline</strong>
          <button type="button" style={ui.btnSecondary} onClick={cargarOps} disabled={loading}>
            {loading ? '…' : 'Actualizar'}
          </button>
        </div>
        {renderContent()}
      </div>
    )
  }

  function renderContent() {
    return (
      <>
        <div style={{ color: ui.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
          {isOnline ? 'En línea' : 'Sin conexión'}
          {pendingCount > 0 && ` · ${pendingCount} pendiente(s)`}
          {failedCount > 0 && ` · ${failedCount} fallida(s)`}
          {lastSyncAt && (
            <div style={{ fontSize: 'var(--cc-xs)', marginTop: 4 }}>
              Ref. actualizada: {new Date(lastSyncAt).toLocaleString('es-CO')}
            </div>
          )}
        </div>
        {syncError && (
          <div style={{ color: '#b91c1c', marginBottom: 8, fontSize: 'var(--cc-xs)' }}>{syncError}</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: ops.length ? 10 : 0 }}>
          {isOnline && pendingCount > 0 && (
            <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} onClick={runSync} disabled={syncState === 'syncing'}>
              {syncState === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          )}
          {failedCount > 0 && (
            <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} onClick={retryFailed}>
              Reintentar fallidas
            </button>
          )}
          {onClose && (
            <button type="button" style={ui.btnSecondary} onClick={onClose}>Cerrar</button>
          )}
        </div>
        {ops.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: 'auto', borderTop: `1px solid ${ui.t?.border || '#e2e8f0'}`, paddingTop: 8 }}>
            {ops.map((op) => (
              <div key={op.local_id} style={{ padding: '6px 0', borderBottom: `1px solid ${ui.t?.border || '#f1f5f9'}`, fontSize: 'var(--cc-xs)' }}>
                <div style={{ fontWeight: 600 }}>
                  {SUBMOD_LABEL[op.submodule] || op.submodule} · {op.op_type}
                </div>
                <div style={{ color: ui.textMuted }}>
                  {STATUS_LABEL[op.status] || op.status}
                  {op.attempts ? ` · intento ${op.attempts}/${op.max_attempts || 3}` : ''}
                </div>
                {op.error_message && (
                  <div style={{ color: '#b91c1c', marginTop: 2 }}>{op.error_message}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  return { abrir, renderContent, cargarOps }
}

/** Badge + popover compacto para navegación móvil y sidebar. */
export function TopoOfflineStatusBar({ contratoId, compact }) {
  const ui = useTopoTheme()
  const offline = useTopoOffline()
  const [open, setOpen] = useState(false)
  const [ops, setOps] = useState([])

  const {
    isOnline,
    pendingCount,
    failedCount,
    syncState,
    syncProgress,
    lastSyncAt,
    runSync,
    retryFailed,
    refreshCounts,
    cacheReady,
  } = offline

  const cargarDetalle = async () => {
    if (!contratoId) return
    const rows = await getTopoPendingOps(contratoId)
    setOps(rows.filter((o) => o.status !== 'synced'))
    await refreshCounts()
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) cargarDetalle()
  }

  const totalPend = pendingCount + failedCount
  const syncing = syncState === 'syncing'

  const statusLabel = syncing
    ? 'Sincronizando…'
    : isOnline
      ? (cacheReady
        ? (totalPend > 0
          ? `En línea — ${totalPend} pendiente${totalPend === 1 ? '' : 's'} de sincronizar`
          : 'En línea')
        : 'Cargando referencia…')
      : (totalPend > 0
        ? `Sin conexión — ${totalPend} registro${totalPend === 1 ? '' : 's'} pendiente${totalPend === 1 ? '' : 's'} de sincronizar`
        : 'Sin conexión')

  return (
    <div style={{ position: 'relative', marginBottom: compact ? 0 : 8 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={statusLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          padding: compact ? '4px 8px' : '6px 10px',
          borderRadius: 999,
          border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
          background: !isOnline ? '#fef3c7' : totalPend > 0 ? '#eff6ff' : '#dcfce7',
          color: !isOnline ? '#92400e' : totalPend > 0 ? '#1d4ed8' : '#166534',
          fontSize: 'var(--cc-xs)',
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: '100%',
          textAlign: 'left',
        }}
      >
        <span>{statusLabel}</span>
      </button>

      {open && (
        <div
          style={{
            position: compact ? 'static' : 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            marginTop: 6,
            ...ui.card,
            padding: 12,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            maxWidth: 360,
          }}
        >
          {syncProgress?.last && syncState === 'syncing' && (
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 6 }}>
              Sincronizando {syncProgress.last.op?.submodule}…
            </div>
          )}
          {lastSyncAt && (
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 8 }}>
              Datos ref.: {new Date(lastSyncAt).toLocaleString('es-CO')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: ops.length ? 8 : 0 }}>
            {isOnline && pendingCount > 0 && (
              <button type="button" className="cc-topo-touch-btn" style={{ ...ui.btnPrimary, padding: '6px 10px', fontSize: 'var(--cc-xs)' }} onClick={runSync} disabled={syncing}>
                Sincronizar
              </button>
            )}
            {failedCount > 0 && (
              <button type="button" className="cc-topo-touch-btn" style={{ ...ui.btnSecondary, padding: '6px 10px', fontSize: 'var(--cc-xs)' }} onClick={retryFailed}>
                Reintentar
              </button>
            )}
            <button type="button" style={{ ...ui.btnSecondary, padding: '6px 10px', fontSize: 'var(--cc-xs)' }} onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
          {ops.length > 0 ? (
            <div style={{ maxHeight: compact ? 160 : 200, overflowY: 'auto' }}>
              {ops.map((op) => (
                <div key={op.local_id} style={{ fontSize: 'var(--cc-xs)', padding: '4px 0', borderTop: `1px solid ${ui.t?.border || '#f1f5f9'}` }}>
                  <strong>{SUBMOD_LABEL[op.submodule] || op.submodule}</strong> — {op.op_type}
                  <span style={{ color: ui.textMuted }}> ({STATUS_LABEL[op.status]})</span>
                  {op.error_message && <div style={{ color: '#b91c1c' }}>{op.error_message}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin operaciones pendientes.</div>
          )}
        </div>
      )}
    </div>
  )
}
