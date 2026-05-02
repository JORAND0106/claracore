/**
 * Componentes de UI para el sistema offline de ClaraCore.
 *
 * <OfflineBanner />       — barra que indica estado de conexión
 * <SyncButton />          — botón sincronizar manualmente
 * <PrepareOfflineBtn />   — descarga datos y activa modo sin conexión en un paso
 * <ForceOfflineToggle /> — quitar o forzar modo sin conexión si ya hay caché (sin re-descargar)
 * <ConflictModal />       — modal para resolver conflictos
 */
import React, { useState } from 'react'
import { useOffline } from './OfflineContext'

// ── OfflineBanner ─────────────────────────────────────────────────────────────
export function OfflineBanner() {
  const { efectivoOffline, forceOffline, isOfflineReady, pendingCount, syncState } = useOffline()

  // No mostrar nada si estamos online sin cambios pendientes
  if (!efectivoOffline && pendingCount === 0) return null
  // No mostrar si forceOffline está activo pero sin datos (el OfflineContext ya lo apaga solo)
  if (forceOffline && !isOfflineReady) return null

  const bgColor = efectivoOffline
    ? (forceOffline ? '#1e40af' : '#b45309')   // azul si manual, ámbar si sin red
    : '#1d4ed8'                                  // pendientes online

  const icon = efectivoOffline ? (forceOffline ? '✈' : '📡') : (syncState === 'syncing' ? '🔄' : '☁️')

  return (
    <div style={{
      background: bgColor,
      color: '#fff',
      padding: '6px 16px',
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      zIndex: 9999,
    }}>
      <span>{icon}</span>
      {efectivoOffline && (
        <span>
          <strong>{forceOffline ? 'Modo sin conexión activado' : 'Sin conexión'}</strong>
          {' — '}
          {isOfflineReady
            ? (pendingCount > 0 ? `${pendingCount} cambio(s) pendiente(s)` : 'Datos listos en caché.')
            : 'Datos no descargados — prepara el offline primero.'}
        </span>
      )}
      {!efectivoOffline && pendingCount > 0 && syncState !== 'syncing' && (
        <span><strong>{pendingCount} cambio(s)</strong> pendiente(s) de sincronizar.</span>
      )}
      {syncState === 'syncing' && <span>Sincronizando…</span>}
      {!efectivoOffline && pendingCount > 0 && syncState !== 'syncing' && <SyncButton compact />}
    </div>
  )
}

// ── SyncButton ────────────────────────────────────────────────────────────────
export function SyncButton({ compact = false }) {
  const { runSync, syncState, syncError, pendingCount } = useOffline()
  const loading = syncState === 'syncing'

  if (pendingCount === 0 && syncState !== 'error') return null

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <button
        onClick={runSync}
        disabled={loading}
        style={{
          background: syncState === 'error' ? '#dc2626' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: compact ? '3px 10px' : '7px 16px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: compact ? 12 : 14,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? '⟳ Sincronizando…' : syncState === 'error' ? '⚠ Reintentar' : '↑ Sincronizar'}
      </button>
      {syncError && !compact && (
        <span style={{ fontSize: 11, color: '#dc2626' }}>{syncError}</span>
      )}
    </div>
  )
}

// ── ForceOfflineToggle ────────────────────────────────────────────────────────
/**
 * Desactivar modo sin conexión (o activar manualmente si ya hay caché y volviste a estar online).
 * La activación automática ocurre al usar el botón verde «Preparar / actualizar offline».
 */
export function ForceOfflineToggle() {
  const { forceOffline, setForceOffline, isOfflineReady } = useOffline()

  // Solo muestra si hay datos descargados en caché
  if (!isOfflineReady) return null

  return (
    <button
      onClick={() => setForceOffline(!forceOffline)}
      title={forceOffline
        ? 'Volver al modo online (datos desde servidor). Para volver a cargar la caché, usa el botón verde.'
        : 'Forzar modo sin conexión usando la caché ya descargada (sin volver a descargar)'}
      style={{
        background: forceOffline ? '#1e40af' : '#e5e7eb',
        color: forceOffline ? '#fff' : '#374151',
        border: '1px solid ' + (forceOffline ? '#1e40af' : '#d1d5db'),
        borderRadius: 6,
        padding: '5px 12px',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        transition: 'all 0.15s',
      }}
    >
      {forceOffline ? '✈ Sin conexión (activo)' : '✈ Trabajar sin conexión'}
    </button>
  )
}

// ── PrepareOfflineBtn ─────────────────────────────────────────────────────────
export function PrepareOfflineBtn({ actaRpo = null }) {
  const {
    prepareOffline, syncState, syncMeta, isOfflineReady, efectivoOffline, setForceOffline,
  } = useOffline()
  const [detail, setDetail] = useState(null)
  const loading = syncState === 'downloading'

  // No mostrar si estamos offline sin internet real (no se puede descargar desde red)
  // Pero si forceOffline está activo sin datos, sí mostramos para que puedan preparar
  if (efectivoOffline && isOfflineReady) return null

  const handleClick = async () => {
    setDetail(null)
    const resultado = await prepareOffline(actaRpo || null)
    if (resultado) {
      setDetail(`✓ ${resultado.reportes} reportes · ${resultado.registros} registros · ${resultado.actas} actas`)
      // Un solo paso: al terminar la descarga se activa «Trabajar sin conexión» (equivalente al toggle azul).
      setForceOffline(true)
    } else {
      setDetail('Error al descargar — revisa la consola')
    }
  }

  const label = actaRpo
    ? (isOfflineReady ? `✓ Acta ${actaRpo} offline — actualizar` : `⬇ Acta ${actaRpo} para offline`)
    : (isOfflineReady ? '✓ Offline listo — actualizar' : '⬇ Preparar offline')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        title={actaRpo
          ? `Descarga el Acta ${actaRpo} y activa modo sin conexión con esos datos`
          : 'Descarga datos y activa modo sin conexión'}
        style={{
          background: isOfflineReady ? '#15803d' : '#6b7280',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '7px 14px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? '⟳ Descargando…' : label}
      </button>
      {syncMeta?.synced_at && !detail && (
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          Última sync: {new Date(syncMeta.synced_at).toLocaleString('es-CO')}
          {syncMeta.actaRpo ? ` · Acta ${syncMeta.actaRpo}` : ''}
        </span>
      )}
      {detail && (
        <span style={{ fontSize: 11, color: detail.startsWith('✓') ? '#15803d' : '#dc2626' }}>
          {detail}
        </span>
      )}
    </div>
  )
}

// ── ConflictModal ─────────────────────────────────────────────────────────────
export function ConflictModal() {
  const { conflicts, resolveConflict } = useOffline()

  if (!conflicts || conflicts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: 28,
        maxWidth: 520,
        width: '94vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <h3 style={{ marginTop: 0, color: '#b45309' }}>
          ⚠️ Conflictos de sincronización ({conflicts.length})
        </h3>
        <p style={{ fontSize: 14, color: '#374151' }}>
          Las siguientes operaciones realizadas offline entran en conflicto con
          cambios ya existentes en el servidor. Decide qué hacer con cada una:
        </p>
        {conflicts.map((c, i) => (
          <div key={c.idempotency_key} style={{
            border: '1px solid #fbbf24',
            borderRadius: 8,
            padding: 14,
            marginBottom: 12,
            background: '#fffbeb',
          }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <strong>{i + 1}. {c.type}</strong>
              {c.server_detail?.detail && (
                <span style={{ marginLeft: 8, color: '#6b7280' }}>— {c.server_detail.detail}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
              {c.method} {c.endpoint}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => resolveConflict(c.idempotency_key, 'keep_local')}
                style={{
                  flex: 1, padding: '6px 0',
                  background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}
              >
                Usar mi cambio (offline)
              </button>
              <button
                onClick={() => resolveConflict(c.idempotency_key, 'discard_local')}
                style={{
                  flex: 1, padding: '6px 0',
                  background: '#6b7280', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}
              >
                Usar versión del servidor
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
