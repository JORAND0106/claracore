/**
 * Sync automática del Bloc de notas (local → nube → local).
 * Copia por conflicto solo entre dispositivos distintos (ver blocNotasConflict.js).
 */
import { API_BASE } from '../../apiBase'
import { getOrCreateDeviceId } from '../../pwa/shellCache'
import {
  blocDb,
  getDirtyPayload,
  getSyncMeta,
  setSyncMeta,
  upsertFolder,
  upsertNote,
} from './blocNotasDb'
import { dedupeFalseConflictCopies } from './blocNotasDedup'

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** Un solo sync a la vez por contrato+usuario (evita carreras que generaban copias). */
const syncLocks = new Map()

export async function syncBlocNotas({ contratoId, usuarioId, token, dedupe = true }) {
  if (!contratoId || !usuarioId || !token) return { ok: false, skipped: true }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, offline: true }
  }

  const uid = Number(usuarioId)
  const cid = Number(contratoId)
  const lockKey = `${uid}:${cid}`
  if (syncLocks.get(lockKey)) {
    return { ok: false, skipped: true, busy: true }
  }
  syncLocks.set(lockKey, true)

  try {
    if (dedupe) {
      await dedupeFalseConflictCopies(uid, cid)
    }

    const deviceId = getOrCreateDeviceId()
    const meta = await getSyncMeta(uid, cid)
    const since = meta?.last_pull_at || null

    let pull
    try {
      const q = since ? `?since=${encodeURIComponent(since)}` : ''
      const res = await fetch(`${API_BASE}/bloc-notas/${cid}/sync${q}`, {
        headers: authHeaders(token),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        return { ok: false, error: detail?.detail || `HTTP ${res.status}` }
      }
      pull = await res.json()
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }

    for (const f of pull.folders || []) {
      const local = await blocDb.folders.get(f.id)
      if (local?.dirty) continue
      await upsertFolder({
        id: f.id,
        contrato_id: cid,
        usuario_id: uid,
        nombre: f.nombre,
        created_at: f.created_at,
        updated_at: f.updated_at,
        deleted_at: f.deleted_at || null,
        rev: f.rev || 1,
        dirty: false,
        device_id: f.device_id,
      })
    }
    for (const n of pull.notes || []) {
      const local = await blocDb.notes.get(n.id)
      if (local?.dirty) continue
      await upsertNote({
        id: n.id,
        folder_id: n.folder_id,
        contrato_id: cid,
        usuario_id: uid,
        title: n.title || '',
        body: n.body || {},
        created_at: n.created_at,
        updated_at: n.updated_at,
        deleted_at: n.deleted_at || null,
        rev: n.rev || 1,
        base_rev: n.rev || 1,
        dirty: false,
        device_id: n.device_id,
        conflict_of: n.conflict_of || null,
      })
    }

    const dirtyAfterPull = await getDirtyPayload(uid, cid)
    if (dirtyAfterPull.folders.length === 0 && dirtyAfterPull.notes.length === 0) {
      await setSyncMeta(uid, cid, { last_pull_at: pull.server_time || new Date().toISOString() })
      return { ok: true, pulled: true, pushed: 0, conflict_copies: [] }
    }

    const payload = {
      device_id: deviceId,
      folders: dirtyAfterPull.folders.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        updated_at: f.updated_at,
        rev: f.rev || 1,
        deleted: !!f.deleted_at,
        device_id: deviceId,
      })),
      notes: dirtyAfterPull.notes.map((n) => ({
        id: n.id,
        folder_id: n.folder_id || null,
        title: n.title || '',
        body: n.body || {},
        updated_at: n.updated_at,
        rev: n.rev || 1,
        // null = primera subida / mismo flujo de upsert sin chequear conflicto multi-dispositivo
        base_rev: n.base_rev == null ? null : n.base_rev,
        deleted: !!n.deleted_at,
        device_id: deviceId,
      })),
    }

    let push
    try {
      const res = await fetch(`${API_BASE}/bloc-notas/${cid}/sync`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        return { ok: false, error: detail?.detail || `HTTP ${res.status}` }
      }
      push = await res.json()
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }

    for (const f of push.folders || []) {
      await upsertFolder({
        id: f.id,
        contrato_id: cid,
        usuario_id: uid,
        nombre: f.nombre,
        created_at: f.created_at,
        updated_at: f.updated_at,
        deleted_at: f.deleted_at || null,
        rev: f.rev || 1,
        dirty: false,
        device_id: f.device_id,
      })
    }
    for (const n of [...(push.notes || []), ...(push.conflict_copies || [])]) {
      await upsertNote({
        id: n.id,
        folder_id: n.folder_id,
        contrato_id: cid,
        usuario_id: uid,
        title: n.title || '',
        body: n.body || {},
        created_at: n.created_at,
        updated_at: n.updated_at,
        deleted_at: n.deleted_at || null,
        rev: n.rev || 1,
        base_rev: n.rev || 1,
        dirty: false,
        device_id: n.device_id,
        conflict_of: n.conflict_of || null,
      })
    }

    await setSyncMeta(uid, cid, {
      last_pull_at: push.server_time || pull.server_time || new Date().toISOString(),
    })

    return {
      ok: true,
      pushed: dirtyAfterPull.folders.length + dirtyAfterPull.notes.length,
      conflict_copies: push.conflict_copies || [],
    }
  } finally {
    syncLocks.delete(lockKey)
  }
}
