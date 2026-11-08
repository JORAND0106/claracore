/**
 * Esquemas del reporte guardados pero aún sin registros asignados («Sin asignar»).
 * Persistencia local (IndexedDB) + metadatos suficientes para reabrir y asignar después.
 * C-OUT-18 / C-OUT-14: Guardar nunca depende de la asignación.
 */
import Dexie from 'dexie'

const DB_NAME = 'ClaraCore_sicoe_esquemas_sin_asignar_v1'

const db = new Dexie(DB_NAME)
db.version(1).stores({
  items: 'id, reporteId, contratoId, updatedAt, esquema_id, numero',
})

function rowId(contratoId, reporteId, esquemaId) {
  return `${contratoId || 'x'}:${reporteId || 'x'}:${esquemaId}`
}

/**
 * @param {{
 *   contratoId: string|number,
 *   reporteId: string|number,
 *   entrada: object, // buildEsquemaHistorialEntrada + scene/url/numero
 * }} args
 */
export async function upsertEsquemaSinAsignar({ contratoId, reporteId, entrada } = {}) {
  if (!entrada?.esquema_id || !entrada?.url) {
    return { ok: false, error: 'Entrada de esquema incompleta.' }
  }
  const id = rowId(contratoId, reporteId, entrada.esquema_id)
  const row = {
    id,
    contratoId: contratoId == null ? null : String(contratoId),
    reporteId: reporteId == null ? null : String(reporteId),
    esquema_id: String(entrada.esquema_id),
    numero: entrada.numero ?? null,
    nombre: String(entrada.nombre || 'Esquema').trim() || 'Esquema',
    url: entrada.url,
    scene: entrada.scene || entrada.esquema_scene || null,
    creado_en: entrada.creado_en || new Date().toISOString(),
    updatedAt: Date.now(),
    entrada: { ...entrada },
  }
  try {
    await db.items.put(row)
    return { ok: true, row }
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo guardar Sin asignar' }
  }
}

export async function listarEsquemasSinAsignar({ contratoId, reporteId } = {}) {
  try {
    const rid = reporteId == null ? null : String(reporteId)
    const cid = contratoId == null ? null : String(contratoId)
    let rows = await db.items.toArray()
    rows = rows.filter((r) => {
      if (rid != null && String(r.reporteId) !== rid) return false
      if (cid != null && String(r.contratoId) !== cid) return false
      return true
    })
    return rows.sort((a, b) => {
      const na = Number(a.numero)
      const nb = Number(b.numero)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
  } catch {
    return []
  }
}

export async function removeEsquemaSinAsignar({ contratoId, reporteId, esquemaId } = {}) {
  if (!esquemaId) return false
  try {
    await db.items.delete(rowId(contratoId, reporteId, esquemaId))
    return true
  } catch {
    return false
  }
}

/** Filas de lista UI (mismo shape que listarEsquemasDelReporte). */
export function sinAsignarToListRows(rows) {
  return (rows || []).map((r) => ({
    esquema_id: r.esquema_id,
    numero: r.numero ?? null,
    nombre: r.nombre || 'Esquema',
    url: r.url,
    scene: r.scene || r.entrada?.scene || null,
    creado_en: r.creado_en || null,
    registros: [],
    thumb: r.url,
    sinAsignar: true,
  }))
}

/**
 * Une esquemas de registros + sin asignar (sin duplicar por esquema_id/numero).
 */
export function mergeEsquemasLista(asignados, sinAsignarRows) {
  const map = new Map()
  for (const row of asignados || []) {
    const k = row.esquema_id || (row.numero != null ? `num:${row.numero}` : row.url)
    map.set(String(k), { ...row, sinAsignar: false })
  }
  for (const row of sinAsignarToListRows(sinAsignarRows)) {
    const k = row.esquema_id || (row.numero != null ? `num:${row.numero}` : row.url)
    if (map.has(String(k))) continue // ya asignado a algún registro
    map.set(String(k), row)
  }
  return [...map.values()].sort((a, b) => {
    const na = Number(a.numero)
    const nb = Number(b.numero)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    if (Number.isFinite(na)) return -1
    if (Number.isFinite(nb)) return 1
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
  })
}
