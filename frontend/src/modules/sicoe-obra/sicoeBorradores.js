/**
 * Borradores SicoeObra: quién puede eliminar y limpieza local tras borrar.
 */
import { sicoeNuevoReporteDraftClear } from './sicoeNuevoReporteDraft.js'

export function sicoeEsBorradorReporte(rep) {
  return String(rep?.estado || '').trim() === 'Borrador'
}

export function sicoePuedeEliminarBorrador(usuario, rep, { permisoEliminar = false } = {}) {
  if (!sicoeEsBorradorReporte(rep)) return false
  if (permisoEliminar) return true
  const uid = Number(usuario?.id ?? usuario?.sub ?? usuario?.user_id)
  const creado = Number(rep?.creado_por)
  if (!Number.isFinite(uid) || !Number.isFinite(creado)) return false
  return uid === creado
}

/** Limpia borrador local del asistente y fila IndexedDB si aplica. */
export async function sicoeLimpiarBorradorLocalTrasEliminar({
  contratoId,
  userId,
  reporteId,
  db = null,
}) {
  try {
    sicoeNuevoReporteDraftClear(contratoId, userId, reporteId)
  } catch { /* noop */ }
  try {
    sicoeNuevoReporteDraftClear(contratoId, userId, null)
  } catch { /* noop */ }
  if (db && reporteId != null) {
    try {
      const rid = Number(reporteId)
      const cid = Number(contratoId)
      if (Number.isFinite(rid)) {
        await db.so_registros?.where?.('reporte_id')?.equals?.(rid)?.delete?.()
        await db.so_reportes?.delete?.(rid)
      }
      if (Number.isFinite(cid) && Number.isFinite(rid)) {
        // Algunas filas offline usan id string local_*
        const locals = await db.so_reportes?.where?.('contrato_id')?.equals?.(cid)?.toArray?.()
        if (Array.isArray(locals)) {
          for (const row of locals) {
            if (String(row?.id) === String(reporteId) || Number(row?.id) === rid) {
              await db.so_reportes.delete(row.id)
            }
          }
        }
      }
    } catch { /* noop */ }
  }
}
