/**
 * Fusión en memoria de varios Reportes Diarios de la misma fecha
 * (transición post-segmentación por tramo → 1 diario/fecha).
 *
 * Estampa el `tramo` del documento de origen en cada fila de
 * asistencia / materiales / equipos_uso que aún no lo tenga.
 */

import { normalizeTramoValue } from './bitacoraTramoHelpers.js'

function asArray(val) {
  return Array.isArray(val) ? val.filter((x) => x && typeof x === 'object') : []
}

function stampTramoFilas(rows, tramoDoc) {
  const t = normalizeTramoValue(tramoDoc)
  return asArray(rows).map((row) => {
    const next = { ...row }
    if (t && !normalizeTramoValue(next.tramo)) {
      next.tramo = t
    }
    return next
  })
}

/** Diario keeper = menor id. */
export function pickKeeperDiario(diarios) {
  const list = Array.isArray(diarios) ? diarios.filter((d) => d?.id != null) : []
  if (!list.length) return null
  return [...list].sort((a, b) => Number(a.id) - Number(b.id))[0]
}

/**
 * @param {object[]} diarios lista de entradas tipo diario (misma fecha)
 * @returns {object|null} entrada fusionada lista para el editor
 */
export function mergeDiariosParaEditor(diarios) {
  const list = (Array.isArray(diarios) ? diarios : [])
    .filter((d) => d && d.id != null)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
  if (!list.length) return null
  if (list.length === 1) return { ...list[0] }

  const base = { ...list[0] }
  const asistencia = []
  const materiales = []
  const personal = []
  const eventos = []
  const imagenes = []
  const equipos = []

  for (const src of list) {
    const tramoDoc = src.tramo
    asistencia.push(...stampTramoFilas(src.asistencia_colaboradores, tramoDoc))
    materiales.push(...stampTramoFilas(src.materiales, tramoDoc))
    personal.push(...asArray(src.personal))
    eventos.push(...asArray(src.eventos))
    imagenes.push(...asArray(src.imagenes))
    for (const u of asArray(src.equipos_uso)) {
      const uu = { ...u }
      const t = normalizeTramoValue(tramoDoc)
      if (t && !normalizeTramoValue(uu.tramo)) uu.tramo = t
      equipos.push(uu)
    }
  }

  base.asistencia_colaboradores = asistencia
  base.materiales = materiales
  base.personal = personal
  base.eventos = eventos
  base.imagenes = imagenes
  base.equipos_uso = equipos
  base.tramo = null
  base._merged_from_ids = list.map((d) => Number(d.id))
  base._merged_pendiente_persistir = true
  return base
}
