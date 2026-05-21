/**
 * ClaraCore — Base de datos local IndexedDB (Dexie.js)
 * Almacena datos de Sicoe Obra para operación offline.
 *
 * Versión del esquema: incrementar cuando cambie la estructura.
 */
import Dexie from 'dexie'

export const db = new Dexie('ClaraCore_v1')

db.version(1).stores({
  // ── Datos descargados del servidor ────────────────────────────────────────
  contratos:       'id, numero',
  actas:           'id, contrato_id, numero_rpo, consecutivo',
  so_semanas:      'id, contrato_id, numero_semana',
  listado_precios: 'id, contrato_id, capitulo, item_numero',
  so_reportes:     'id, contrato_id, estado, updated_at, semana_id, acta_id',
  so_registros:    'id, reporte_id, contrato_id, acta_id, item_numero, ' +
                   'nivel1_estado, nivel2_estado, nivel3_estado, updated_at',
  usuarios_cache:  'id, contrato_id',   // info mínima de usuarios del contrato

  // ── Cola de mutaciones pendientes de sincronizar ──────────────────────────
  // status: 'pending' | 'syncing' | 'synced' | 'error' | 'conflict'
  pending_mutations: '++local_id, idempotency_key, status, created_at, contrato_id',

  // ── Metadatos de sincronización ───────────────────────────────────────────
  // key: 'last_sync_{contrato_id}' → { key, synced_at, contrato_id }
  sync_meta: 'key',
})

db.version(2).stores({
  contratos:       'id, numero',
  actas:           'id, contrato_id, numero_rpo, consecutivo',
  so_semanas:      'id, contrato_id, numero_semana',
  listado_precios: 'id, contrato_id, capitulo, item_numero',
  so_reportes:     'id, contrato_id, estado, updated_at, semana_id, acta_id',
  so_registros:    'id, reporte_id, contrato_id, acta_id, item_numero, ' +
                   'nivel1_estado, nivel2_estado, nivel3_estado, updated_at',
  usuarios_cache:  'id, contrato_id',
  inspectores_cache:     'id, contrato_id',
  subcontratistas_cache: 'id, contrato_id',
  pending_mutations: '++local_id, idempotency_key, status, created_at, contrato_id',
  sync_meta: 'key',
})

// Helpers de limpieza segura post-sync
export async function clearContractCache(contrato_id) {
  await db.transaction('rw',
    [
      db.actas,
      db.so_semanas,
      db.listado_precios,
      db.so_reportes,
      db.so_registros,
      db.usuarios_cache,
      db.inspectores_cache,
      db.subcontratistas_cache,
    ],
    async () => {
      await db.actas.where('contrato_id').equals(contrato_id).delete()
      await db.so_semanas.where('contrato_id').equals(contrato_id).delete()
      await db.listado_precios.where('contrato_id').equals(contrato_id).delete()
      await db.so_reportes.where('contrato_id').equals(contrato_id).delete()
      await db.so_registros.where('contrato_id').equals(contrato_id).delete()
      await db.usuarios_cache.where('contrato_id').equals(contrato_id).delete()
      await db.inspectores_cache.where('contrato_id').equals(contrato_id).delete()
      await db.subcontratistas_cache.where('contrato_id').equals(contrato_id).delete()
    }
  )
}

export async function clearSyncedMutations(contrato_id) {
  await db.pending_mutations
    .where('contrato_id').equals(contrato_id)
    .and(m => m.status === 'synced')
    .delete()
}

export async function getSyncMeta(contrato_id) {
  return db.sync_meta.get(`last_sync_${contrato_id}`)
}

export async function setSyncMeta(contrato_id, extra = {}) {
  await db.sync_meta.put({
    key: `last_sync_${contrato_id}`,
    contrato_id,
    synced_at: new Date().toISOString(),
    ...extra,
  })
}

export async function getPendingMutations(contrato_id) {
  return db.pending_mutations
    .where('contrato_id').equals(contrato_id)
    .and(m => m.status === 'pending' || m.status === 'error')
    .sortBy('created_at')
}

export async function countPendingMutations(contrato_id) {
  return db.pending_mutations
    .where('contrato_id').equals(contrato_id)
    .and(m => m.status === 'pending' || m.status === 'error')
    .count()
}
