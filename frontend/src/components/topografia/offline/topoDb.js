/**
 * IndexedDB para Topografía — cola de operaciones y caché de referencia.
 * Base separada de SICOE (ClaraCore_v1) para no mezclar esquemas.
 */
import Dexie from 'dexie'

export const topoDb = new Dexie('ClaraCore_Topo_v1')

topoDb.version(1).stores({
  /** Puntos del contrato (verificados y no verificados) */
  topo_puntos: 'id, contrato_id, nombre, verificado, _local',

  /** Listados ligeros */
  topo_poligonales: 'id, contrato_id, estado, updated_at',
  topo_nivelaciones: 'id, contrato_id, estado, updated_at',
  topo_newpoints: 'id, contrato_id, estado, updated_at',
  topo_entrega_dg: 'id, contrato_id, eje_id, orden, updated_at',
  topo_tuberias: 'id, contrato_id',
  topo_areas: 'id, contrato_id',
  topo_equipos: 'id, contrato_id',

  /** Detalle completo (JSON blob por entidad) */
  topo_entity_detail: 'key',

  /** Ejes DG + detalle embebido en entity_detail con key diseno_eje_{id} */
  topo_diseno_ejes: 'id, contrato_id',

  /** Cola offline
   * status: pendiente | en_proceso | fallida | synced | conflict
   */
  topo_pending_ops:
    '++local_id, contrato_id, status, created_at, submodule, idempotency_key',

  /** Conflictos pendientes de resolución manual */
  topo_conflicts: '++id, operation_id, contrato_id',

  /** Metadatos: last_ref_sync_{contrato_id} */
  topo_sync_meta: 'key',
})

export async function getTopoSyncMeta(contratoId) {
  return topoDb.topo_sync_meta.get(`last_ref_sync_${contratoId}`)
}

export async function setTopoSyncMeta(contratoId, extra = {}) {
  await topoDb.topo_sync_meta.put({
    key: `last_ref_sync_${contratoId}`,
    contrato_id: Number(contratoId),
    synced_at: new Date().toISOString(),
    ...extra,
  })
}

export async function countTopoPendingOps(contratoId) {
  return topoDb.topo_pending_ops
    .where('contrato_id')
    .equals(Number(contratoId))
    .and((o) => o.status === 'pendiente' || o.status === 'en_proceso')
    .count()
}

export async function countTopoFailedOps(contratoId) {
  return topoDb.topo_pending_ops
    .where('contrato_id')
    .equals(Number(contratoId))
    .and((o) => o.status === 'fallida' || o.status === 'conflict')
    .count()
}

export async function getTopoPendingOps(contratoId) {
  return topoDb.topo_pending_ops
    .where('contrato_id')
    .equals(Number(contratoId))
    .and((o) => ['pendiente', 'en_proceso', 'fallida', 'conflict'].includes(o.status))
    .sortBy('created_at')
}

export async function clearTopoContractCache(contratoId) {
  const cid = Number(contratoId)
  await topoDb.transaction(
    'rw',
    [
      topoDb.topo_puntos,
      topoDb.topo_poligonales,
      topoDb.topo_nivelaciones,
      topoDb.topo_newpoints,
      topoDb.topo_entrega_dg,
      topoDb.topo_tuberias,
      topoDb.topo_areas,
      topoDb.topo_equipos,
      topoDb.topo_diseno_ejes,
      topoDb.topo_entity_detail,
    ],
    async () => {
      await topoDb.topo_puntos.where('contrato_id').equals(cid).delete()
      await topoDb.topo_poligonales.where('contrato_id').equals(cid).delete()
      await topoDb.topo_nivelaciones.where('contrato_id').equals(cid).delete()
      await topoDb.topo_newpoints.where('contrato_id').equals(cid).delete()
      await topoDb.topo_entrega_dg.where('contrato_id').equals(cid).delete()
      await topoDb.topo_tuberias.where('contrato_id').equals(cid).delete()
      await topoDb.topo_areas.where('contrato_id').equals(cid).delete()
      await topoDb.topo_equipos.where('contrato_id').equals(cid).delete()
      await topoDb.topo_diseno_ejes.where('contrato_id').equals(cid).delete()
      const keys = await topoDb.topo_entity_detail
        .filter((r) => String(r.key || '').includes(`_${cid}_`) || String(r.key || '').startsWith(`c${cid}_`))
        .keys()
      await topoDb.topo_entity_detail.bulkDelete(keys)
    },
  )
}

export function entityDetailKey(contratoId, kind, id) {
  return `c${contratoId}_${kind}_${id}`
}
