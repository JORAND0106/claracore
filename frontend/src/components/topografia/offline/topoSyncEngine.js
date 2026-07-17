/**
 * Motor de sincronización Topografía — FIFO con dependencias y reintentos.
 */
import { API_BASE } from '../../../apiBase'
import {
  getTopoPendingOps,
  topoDb,
} from './topoDb.js'
import { downloadTopoReferenceData } from './topoReferenceDownloader.js'

const idMap = new Map()

function resolvePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const out = Array.isArray(payload) ? [...payload] : { ...payload }
  if (Array.isArray(out)) {
    return out.map((item) => resolvePayload(item))
  }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.startsWith('local_') && idMap.has(v)) {
      out[k] = idMap.get(v)
    } else if (v && typeof v === 'object') {
      out[k] = resolvePayload(v)
    }
  }
  return out
}

function resolveEndpoint(endpoint, op) {
  let ep = endpoint
  if (op.local_entity_id?.startsWith('local_') && idMap.has(op.local_entity_id)) {
    ep = ep.replace(op.local_entity_id, idMap.get(op.local_entity_id))
  }
  for (const [local, server] of idMap.entries()) {
    ep = ep.split(local).join(server)
  }
  return ep
}

function depsResolved(op) {
  const deps = op.depends_on || []
  return deps.every((d) => !d?.startsWith('local_') || idMap.has(d))
}

async function fetchServerEntity(contratoId, token, op) {
  const ep = resolveEndpoint(op.endpoint, op)
  const getPath = ep.replace(/\/(calcular|cerrar|guardar-cartera|lecturas|armadas|estaciones).*$/, '')
  if (!getPath || getPath === ep) return null
  try {
    const res = await fetch(`${API_BASE}/topografia/${contratoId}${getPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function detectConflict(serverEntity, op) {
  if (!serverEntity || !op.server_updated_at) return false
  const serverTs = serverEntity.updated_at
    || serverEntity.poligonal?.updated_at
    || serverEntity.nivelacion?.updated_at
    || serverEntity.entrega?.updated_at
  if (!serverTs || !op.server_updated_at) return false
  return new Date(serverTs) > new Date(op.server_updated_at)
}

export async function processTopoSyncQueue(contratoId, token, onProgress) {
  const cid = Number(contratoId)
  const ops = await getTopoPendingOps(cid)
  const result = { synced: 0, failed: 0, conflicts: [], skipped: 0 }
  idMap.clear()

  for (const op of ops) {
    if (op.status === 'synced') continue
    if (!depsResolved(op)) {
      result.skipped++
      continue
    }
    if (op.attempts >= (op.max_attempts || 3)) continue

    try {
      await topoDb.topo_pending_ops.update(op.local_id, { status: 'en_proceso' })
      onProgress?.({ phase: 'syncing', op })

      const ep = resolveEndpoint(op.endpoint, op)
      const body = resolvePayload(op.payload)

      // Conflicto en ediciones críticas
      if (['editar', 'calcular', 'cerrar'].includes(op.op_type) && op.server_entity_id) {
        const serverEntity = await fetchServerEntity(contratoId, token, op)
        if (detectConflict(serverEntity, op)) {
          await topoDb.topo_pending_ops.update(op.local_id, {
            status: 'conflict',
            error_message: 'Versión más reciente en servidor',
          })
          await topoDb.topo_conflicts.add({
            operation_id: op.local_id,
            contrato_id: cid,
            local_payload: op.payload,
            server_entity: serverEntity,
            created_at: new Date().toISOString(),
          })
          result.conflicts.push({ op, serverEntity })
          result.failed++
          continue
        }
      }

      // Colisión nombre biblioteca
      if (op.submodule === 'biblioteca' && op.method === 'POST') {
        const check = await fetch(
          `${API_BASE}/topografia/${contratoId}/puntos`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (check.ok) {
          const puntos = await check.json()
          const norm = (body.nombre || '').trim().toLowerCase()
          if ((puntos || []).some((p) => (p.nombre || '').trim().toLowerCase() === norm)) {
            throw new Error(`Colisión: ya existe un punto «${body.nombre}» en el servidor.`)
          }
        }
      }

      const response = await fetch(`${API_BASE}/topografia/${contratoId}${ep}`, {
        method: op.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': op.idempotency_key,
        },
        body: ['GET', 'DELETE'].includes(op.method) ? undefined : JSON.stringify(body),
      })

      if (response.status === 409) {
        const detail = await response.json().catch(() => ({}))
        await topoDb.topo_pending_ops.update(op.local_id, {
          status: 'conflict',
          error_message: detail?.detail || 'Conflicto',
          attempts: (op.attempts || 0) + 1,
        })
        result.conflicts.push({ op, detail })
        result.failed++
        continue
      }

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail?.detail || `HTTP ${response.status}`)
      }

      const serverData = await response.json().catch(() => null)
      const newId = serverData?.id || serverData?.poligonal?.id || serverData?.entrega?.id
      if (newId && op.local_entity_id?.startsWith('local_')) {
        idMap.set(op.local_entity_id, newId)
      }

      await topoDb.topo_pending_ops.update(op.local_id, {
        status: 'synced',
        synced_at: new Date().toISOString(),
        server_entity_id: newId || op.server_entity_id,
      })
      result.synced++
      onProgress?.({ phase: 'synced', op, serverData })
    } catch (e) {
      const attempts = (op.attempts || 0) + 1
      const status = attempts >= (op.max_attempts || 3) ? 'fallida' : 'pendiente'
      await topoDb.topo_pending_ops.update(op.local_id, {
        status,
        attempts,
        error_message: String(e?.message || e),
      })
      result.failed++
      onProgress?.({ phase: 'error', op, error: e })
      // Continuar con las demás (no break)
    }
  }

  // Refrescar caché de referencia tras sync
  if (result.synced > 0) {
    try {
      await downloadTopoReferenceData(contratoId, token)
    } catch (e) {
      console.warn('[Topo sync] No se pudo refrescar caché', e)
    }
  }

  return result
}

/** Resuelve conflicto: usar versión local o del servidor. */
export async function resolveTopoConflict(operationLocalId, useLocal, contratoId, token) {
  const op = await topoDb.topo_pending_ops.get(operationLocalId)
  if (!op) throw new Error('Operación no encontrada')

  if (!useLocal) {
    await topoDb.topo_pending_ops.update(op.local_id, {
      status: 'synced',
      error_message: 'Descartada (prevaleció servidor)',
    })
    const conflict = await topoDb.topo_conflicts.where('operation_id').equals(operationLocalId).first()
    if (conflict?.id) await topoDb.topo_conflicts.delete(conflict.id)
    return { ok: true, action: 'server' }
  }

  await topoDb.topo_pending_ops.update(op.local_id, {
    status: 'pendiente',
    attempts: 0,
    server_updated_at: null,
    error_message: null,
  })
  const conflict = await topoDb.topo_conflicts.where('operation_id').equals(operationLocalId).first()
  if (conflict?.id) await topoDb.topo_conflicts.delete(conflict.id)
  await processTopoSyncQueue(contratoId, token)
  return { ok: true, action: 'local' }
}

export async function retryFailedTopoOps(contratoId) {
  const cid = Number(contratoId)
  const failed = await topoDb.topo_pending_ops
    .where('contrato_id')
    .equals(cid)
    .and((o) => o.status === 'fallida')
    .toArray()
  for (const op of failed) {
    await topoDb.topo_pending_ops.update(op.local_id, { status: 'pendiente', attempts: 0, error_message: null })
  }
  return failed.length
}

export async function discardTopoOperation(localId) {
  await topoDb.topo_pending_ops.delete(localId)
}
