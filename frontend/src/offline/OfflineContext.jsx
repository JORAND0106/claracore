/**
 * OfflineContext — estado de conectividad y operaciones offline/sync
 * para el módulo Sicoe Obra.
 *
 * Incluye un toggle manual "forceOffline" (persistido en localStorage)
 * porque navigator.onLine no es confiable (puede decir "online" incluso
 * cuando no hay acceso real a internet).
 */
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  db,
  clearContractCache,
  clearSyncedMutations,
  getSyncMeta,
  setSyncMeta,
  getPendingMutations,
  countPendingMutations,
} from './db'
import { downloadContractData } from './downloader'
import { processMutationQueue } from './syncEngine'

const OfflineContext = createContext(null)

const FORCE_OFFLINE_KEY = 'claracore_force_offline'

export function OfflineProvider({ children, contratoId, authToken }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  // forceOffline: el usuario indica explícitamente que está trabajando sin conexión.
  // Persiste en localStorage para sobrevivir recargas.
  const [forceOffline, setForceOfflineState] = useState(
    () => localStorage.getItem(FORCE_OFFLINE_KEY) === 'true'
  )
  const [isOfflineReady, setIsOfflineReady] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncState, setSyncState] = useState('idle')
  const [syncError, setSyncError] = useState(null)
  const [syncMeta, setSyncMetaState] = useState(null)
  const [conflicts, setConflicts] = useState([])

  const syncingRef = useRef(false)

  // efectivoOffline = true cuando NO hay red real (ya sea por sistema o por toggle manual)
  const efectivoOffline = forceOffline || !isOnline

  const setForceOffline = useCallback((value) => {
    localStorage.setItem(FORCE_OFFLINE_KEY, value ? 'true' : 'false')
    setForceOfflineState(value)
  }, [])

  // ── Detectar cambios de conectividad ───────────────────────────────────────
  useEffect(() => {
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ── Refrescar estado al montar y cuando cambia contratoId ──────────────────
  const refreshStatus = useCallback(async () => {
    if (!contratoId) return
    const meta  = await getSyncMeta(contratoId)
    const count = await countPendingMutations(contratoId)
    setSyncMetaState(meta || null)
    setPendingCount(count)
    const ready = !!meta
    setIsOfflineReady(ready)
    // Si no hay datos descargados, desactivar forceOffline automáticamente
    if (!ready && forceOffline) {
      localStorage.setItem(FORCE_OFFLINE_KEY, 'false')
      setForceOfflineState(false)
    }
  }, [contratoId, forceOffline])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  // ── Sync automático al recuperar conexión ──────────────────────────────────
  useEffect(() => {
    if (isOnline && !forceOffline && pendingCount > 0 && !syncingRef.current) {
      runSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, forceOffline])

  // ── Descargar datos para modo offline ──────────────────────────────────────
  const prepareOffline = useCallback(async (actaRpo = null) => {
    if (!contratoId || !authToken) return null
    setSyncState('downloading')
    setSyncError(null)
    try {
      await clearContractCache(contratoId)
      const conteos = await downloadContractData(contratoId, authToken, { actaRpo })
      await setSyncMeta(contratoId, { actaRpo })
      await refreshStatus()
      setSyncState('idle')
      return conteos
    } catch (e) {
      setSyncError(String(e?.message || e))
      setSyncState('error')
      return null
    }
  }, [contratoId, authToken, refreshStatus])

  // ── Sincronizar cola pendiente ─────────────────────────────────────────────
  const runSync = useCallback(async () => {
    if (!contratoId || !authToken || syncingRef.current) return { ok: false, skipped: true }
    syncingRef.current = true
    setSyncState('syncing')
    setSyncError(null)
    try {
      const result = await processMutationQueue(contratoId, authToken)
      if (result.conflicts?.length) {
        setConflicts(result.conflicts)
      }
      const meta = await getSyncMeta(contratoId)
      await clearContractCache(contratoId)
      await downloadContractData(contratoId, authToken, { actaRpo: meta?.actaRpo })
      await clearSyncedMutations(contratoId)
      await setSyncMeta(contratoId, { actaRpo: meta?.actaRpo, mutations_synced: result.synced })
      await refreshStatus()
      setSyncState('idle')
      return { ok: true }
    } catch (e) {
      setSyncError(String(e?.message || e))
      setSyncState('error')
      await refreshStatus()
      return { ok: false, error: String(e?.message || e) }
    } finally {
      syncingRef.current = false
    }
  }, [contratoId, authToken, refreshStatus])

  // ── Registrar mutación offline ─────────────────────────────────────────────
  const enqueueMutation = useCallback(async ({
    type, method, endpoint, body,
    localData = null, localTable = null, localId = null,
  }) => {
    if (!contratoId) return null
    const idempotency_key = uuidv4()
    const mutation = {
      idempotency_key,
      type,
      method,
      endpoint,
      body,
      local_id_ref: localId,
      contrato_id: contratoId,
      status: 'pending',
      created_at: new Date().toISOString(),
      error_message: null,
    }
    const local_id = await db.pending_mutations.add(mutation)

    if (localData && localTable && db[localTable]) {
      await db[localTable].put({ ...localData, _offline: true, _mutation_local_id: local_id })
    }

    await refreshStatus()
    return { local_id, idempotency_key }
  }, [contratoId, refreshStatus])

  // ── Resolver conflicto manualmente ────────────────────────────────────────
  const resolveConflict = useCallback(async (idempotency_key, resolution) => {
    await db.pending_mutations
      .where('idempotency_key').equals(idempotency_key)
      .modify({ status: resolution === 'keep_local' ? 'pending' : 'synced' })
    setConflicts(prev => prev.filter(c => c.idempotency_key !== idempotency_key))
    await refreshStatus()
    if (resolution === 'keep_local') runSync()
  }, [refreshStatus, runSync])

  return (
    <OfflineContext.Provider value={{
      isOnline,
      efectivoOffline,   // ← usa ESTE en vez de !isOnline
      forceOffline,
      setForceOffline,
      isOfflineReady,
      pendingCount,
      syncState,
      syncError,
      syncMeta,
      conflicts,
      prepareOffline,
      runSync,
      enqueueMutation,
      resolveConflict,
      refreshStatus,
    }}>
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline debe usarse dentro de <OfflineProvider>')
  return ctx
}
