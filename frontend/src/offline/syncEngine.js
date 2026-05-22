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
import { db, getPendingMutations, getPendingBlob, deletePendingBlob } from './db'
import { API_BASE } from '../apiBase'

/**
 * Resuelve IDs temporales locales a IDs reales del servidor.
 * Cuando se crea un reporte offline (local_id_ref = ID temporal),
 * y luego se crean registros referenciando ese reporte,
 * necesitamos sustituir el ID temporal por el real antes de enviar.
 */
const idMap = new Map() // local_id_ref → server_id

function resolveBodyIds(body) {
  if (!body || typeof body !== 'object') return body
  const resolved = { ...body }
  for (const [k, v] of Object.entries(resolved)) {
    if (typeof v === 'string' && v.startsWith('local_') && idMap.has(v)) {
      resolved[k] = idMap.get(v)
    }
  }
  return resolved
}

function parseNextNumero(data) {
  if (data == null) return null
  if (typeof data === 'number' && Number.isFinite(data)) return data
  if (typeof data === 'string' && /^\d+$/.test(data.trim())) return parseInt(data.trim(), 10)
  if (typeof data === 'object') {
    for (const k of ['numero', 'siguiente_numero_foto', 'siguiente_numero_grafico']) {
      const v = data[k]
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (Array.isArray(v) && v.length && typeof v[0] === 'number') return v[0]
    }
  }
  return null
}

async function uploadPendingBlob(contratoId, authToken, mutationRef, tipo) {
  const row = await getPendingBlob(mutationRef)
  if (!row?.blob) throw new Error(`Blob offline no encontrado: ${mutationRef}`)

  const nextPath = tipo === 'grafico'
    ? `/sicoe-obra/${contratoId}/next-grafico`
    : `/sicoe-obra/${contratoId}/next-foto`
  const uploadPath = tipo === 'grafico'
    ? `/sicoe-obra/${contratoId}/upload-grafico`
    : `/sicoe-obra/${contratoId}/upload-foto`

  const numRes = await fetch(`${API_BASE}${nextPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (!numRes.ok) {
    const err = await numRes.json().catch(() => ({}))
    throw new Error(err?.detail || `Error obteniendo consecutivo (${numRes.status})`)
  }
  const numData = await numRes.json()
  const numero = parseNextNumero(numData)
  if (numero == null) throw new Error(`No se obtuvo consecutivo de ${tipo}`)

  const fd = new FormData()
  const fname = row.nombre_archivo || `${tipo}.jpg`
  fd.append('file', row.blob, fname.endsWith('.jpg') || fname.endsWith('.jpeg') ? fname : `${fname}.jpg`)
  fd.append('numero', String(numero))
  fd.append('descripcion', '')

  const upRes = await fetch(`${API_BASE}${uploadPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: fd,
  })
  if (!upRes.ok) {
    const err = await upRes.json().catch(() => ({}))
    throw new Error(err?.detail || `Error subiendo ${tipo} (${upRes.status})`)
  }
  const upData = await upRes.json()
  await deletePendingBlob(mutationRef)
  return { url: upData.url, numero: upData.numero ?? numero }
}

async function resolveMediaRefsInBody(body, contratoId, authToken) {
  if (body == null) return body
  if (Array.isArray(body)) {
    return Promise.all(body.map((item) => resolveMediaRefsInBody(item, contratoId, authToken)))
  }
  if (typeof body !== 'object') return body

  const out = { ...body }

  if (out.foto_mutation_ref) {
    const { url, numero } = await uploadPendingBlob(
      contratoId, authToken, out.foto_mutation_ref, 'foto',
    )
    delete out.foto_mutation_ref
    out.foto_url = url
    out.foto_numero = numero
  }
  if (out.grafico_mutation_ref) {
    const { url, numero } = await uploadPendingBlob(
      contratoId, authToken, out.grafico_mutation_ref, 'grafico',
    )
    delete out.grafico_mutation_ref
    out.grafico_url = url
    out.grafico_numero = numero
  }

  if (Array.isArray(out.registros)) {
    out.registros = await Promise.all(
      out.registros.map((r) => resolveMediaRefsInBody(r, contratoId, authToken)),
    )
  }

  return out
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
    if (mut.status === 'synced') continue

    try {
      await db.pending_mutations.update(mut.local_id, { status: 'syncing' })

      let body = resolveBodyIds(mut.body)
      body = await resolveMediaRefsInBody(body, contratoId, authToken)

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
      if (serverData?.reporte?.id && mut.local_id_ref) {
        idMap.set(mut.local_id_ref, serverData.reporte.id)
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
      console.warn('[ClaraCore Sync] Mutación falló, deteniendo cola:', e)
      break
    }
  }

  return result
}
