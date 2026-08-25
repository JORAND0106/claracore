/**
 * Contexto offline Topografía — conectividad, caché, cola y sync automático.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import {
  countTopoFailedOps,
  countTopoPendingOps,
  getTopoPendingOps,
  getTopoSyncMeta,
  topoDb,
} from './topoDb.js'
import { downloadTopoReferenceData } from './topoReferenceDownloader.js'
import { processTopoSyncQueue, resolveTopoConflict, retryFailedTopoOps } from './topoSyncEngine.js'

const TopoOfflineContext = createContext(null)

export function TopoOfflineProvider({ children, contratoId, token }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [cacheReady, setCacheReady] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [syncState, setSyncState] = useState('idle')
  const [syncProgress, setSyncProgress] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [lastSyncAt, setLastSyncAt] = useState(null)

  const syncingRef = useRef(false)

  const efectivoOffline = !isOnline

  useEffect(() => {
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const refreshCounts = useCallback(async () => {
    if (!contratoId) return
    const [pending, failed, meta] = await Promise.all([
      countTopoPendingOps(contratoId),
      countTopoFailedOps(contratoId),
      getTopoSyncMeta(contratoId),
    ])
    setPendingCount(pending)
    setFailedCount(failed)
    setCacheReady(!!meta?.synced_at)
    setLastSyncAt(meta?.synced_at || null)
    const ops = await getTopoPendingOps(contratoId)
    const conflictOps = ops.filter((o) => o.status === 'conflict')
    const enriched = []
    for (const op of conflictOps) {
      const row = await topoDb.topo_conflicts.where('operation_id').equals(op.local_id).first()
      enriched.push({
        ...op,
        local_payload: row?.local_payload || op.payload,
        server_entity: row?.server_entity || null,
        conflict_row_id: row?.id || null,
      })
    }
    setConflicts(enriched)
  }, [contratoId])

  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  const downloadReference = useCallback(async () => {
    if (!contratoId || !token || !isOnline) return null
    setSyncState('downloading')
    setSyncError(null)
    try {
      const stats = await downloadTopoReferenceData(contratoId, token)
      await refreshCounts()
      setSyncState('idle')
      return stats
    } catch (e) {
      setSyncError(String(e?.message || e))
      setSyncState('error')
      return null
    }
  }, [contratoId, token, isOnline, refreshCounts])

  // Descargar referencia al entrar con conexión
  useEffect(() => {
    if (contratoId && token && isOnline) {
      downloadReference()
    }
  }, [contratoId, token, isOnline, downloadReference])

  const runSync = useCallback(async () => {
    if (!contratoId || !token || syncingRef.current || !isOnline) {
      return { ok: false, skipped: true }
    }
    syncingRef.current = true
    setSyncState('syncing')
    setSyncError(null)
    setSyncProgress({ done: 0, total: pendingCount })
    try {
      const result = await processTopoSyncQueue(contratoId, token, (ev) => {
        setSyncProgress((p) => ({ ...p, last: ev }))
      })
      await refreshCounts()
      setSyncState('idle')
      setSyncProgress(null)
      return { ok: true, ...result }
    } catch (e) {
      setSyncError(String(e?.message || e))
      setSyncState('error')
      await refreshCounts()
      return { ok: false, error: String(e?.message || e) }
    } finally {
      syncingRef.current = false
    }
  }, [contratoId, token, isOnline, pendingCount, refreshCounts])

  // Sync automático al recuperar conexión
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !syncingRef.current) {
      runSync()
    }
  }, [isOnline, pendingCount, runSync])

  const resolveConflict = useCallback(async (conflictRow, useLocal) => {
    if (!contratoId || !token) return
    await resolveTopoConflict(conflictRow.local_id || conflictRow.id, useLocal, contratoId, token)
    await refreshCounts()
    await runSync()
  }, [contratoId, token, refreshCounts, runSync])

  const retryFailed = useCallback(async () => {
    if (!contratoId) return
    await retryFailedTopoOps(contratoId)
    await refreshCounts()
    if (isOnline) await runSync()
  }, [contratoId, isOnline, refreshCounts, runSync])

  const value = useMemo(() => ({
    isOnline,
    efectivoOffline,
    cacheReady,
    pendingCount,
    failedCount,
    syncState,
    syncProgress,
    syncError,
    conflicts,
    lastSyncAt,
    refreshCounts,
    downloadReference,
    runSync,
    resolveConflict,
    retryFailed,
  }), [
    isOnline,
    efectivoOffline,
    cacheReady,
    pendingCount,
    failedCount,
    syncState,
    syncProgress,
    syncError,
    conflicts,
    lastSyncAt,
    refreshCounts,
    downloadReference,
    runSync,
    resolveConflict,
    retryFailed,
  ])

  return (
    <TopoOfflineContext.Provider value={value}>
      {children}
    </TopoOfflineContext.Provider>
  )
}

export function useTopoOffline() {
  const ctx = useContext(TopoOfflineContext)
  return ctx || {
    isOnline: true,
    efectivoOffline: false,
    cacheReady: false,
    pendingCount: 0,
    failedCount: 0,
    syncState: 'idle',
    syncProgress: null,
    syncError: null,
    conflicts: [],
    lastSyncAt: null,
    refreshCounts: async () => {},
    downloadReference: async () => null,
    runSync: async () => ({ ok: false }),
    resolveConflict: async () => {},
    retryFailed: async () => {},
  }
}
