/**
 * Motor de sincronización ClaraCore.
 *
 * Procesa la cola de mutaciones pendientes en orden estricto de creación.
 * Garantías:
 *  - Idempotencia: el servidor ignora la mutación si la recibe dos veces
 *    (via idempotency_key en header).
 *  - Orden: N1 antes que N2, N2 antes que N3; reportes antes que registros.
 *  - Anti-doble-sync: una mutación 'synced' nunca se reenvía.
 *  - Sin mergeo peligroso: después de sync, la cache se REEMPLAZA con
 *    datos frescos del servidor (no se fusiona).
 */
import { db, getPendingMutations } from './db'
import { API_BASE } from '../apiBase'

/**
 * Resuelve IDs temporales locales a IDs reales del servidor.
 * Cuando se crea un reporte offline (local_id_ref = ID temporal),
 * y luego se crean registros referenciando ese reporte,
 * necesitamos sustituir el ID temporal por el real antes de enviar.
 */
const idMap = new Map() // local_id_ref → server_id

function resolveBody(body) {
  if (!body || typeof body !== 'object') return body
  const resolved = { ...body }
  // Sustituir cualquier campo que sea un ID temporal conocido
  for (const [k, v] of Object.entries(resolved)) {
    if (typeof v === 'string' && v.startsWith('local_') && idMap.has(v)) {
      resolved[k] = idMap.get(v)
    }
  }
  return resolved
}

/**
 * Procesa TODAS las mutaciones pendientes del contrato en orden.
 * Devuelve { synced, errors, conflicts }.
 */
export async function processMutationQueue(contratoId, authToken) {
  const mutations = await getPendingMutations(contratoId)
  const result = { synced: 0, errors: 0, conflicts: [] }
  idMap.clear()

  for (const mut of mutations) {
    // Ya fue procesada en una ejecución anterior
    if (mut.status === 'synced') continue

    try {
      await db.pending_mutations.update(mut.local_id, { status: 'syncing' })

      const body = resolveBody(mut.body)
      const response = await fetch(`${API_BASE}${mut.endpoint}`, {
        method: mut.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'Idempotency-Key': mut.idempotency_key,
        },
        body: JSON.stringify(body),
      })

      if (response.status === 409) {
        const detail = await response.json().catch(() => ({}))
        await db.pending_mutations.update(mut.local_id, {
          status: 'conflict',
          error_message: detail?.detail || 'Conflicto',
        })
        result.conflicts.push({ ...mut, server_detail: detail })
        result.errors++
        continue
      }

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail?.detail || `HTTP ${response.status}`)
      }

      const serverData = await response.json().catch(() => null)

      if (serverData?.id && mut.local_id_ref) {
        idMap.set(mut.local_id_ref, serverData.id)
      }

      await db.pending_mutations.update(mut.local_id, {
        status: 'synced',
        synced_at: new Date().toISOString(),
      })
      result.synced++
    } catch (e) {
      await db.pending_mutations.update(mut.local_id, {
        status: 'error',
        error_message: String(e?.message || e),
      })
      result.errors++
      // Detener si un paso falla: los siguientes pueden depender de este
      console.warn('[ClaraCore Sync] Mutación falló, deteniendo cola:', e)
      break
    }
  }

  return result
}
