/** Resumen previo a enviar versión de programación a validación. */
import { fmtDateHuman, fmtDateIso } from './progObraFormat'

const PRESUPUESTO_TIPO_POLIGONO = 'Presupuesto de Obra'

export function aggregatePptoItemKeysByPk(presupuestoRows) {
  const byPk = new Map()
  for (const r of presupuestoRows || []) {
    if (r.dado_de_baja === true) continue
    if (String(r.tipo_ejecucion || '').trim() !== PRESUPUESTO_TIPO_POLIGONO) continue
    const pk = String(r.pk_id || '').trim()
    const cap = String(r.capitulo || '').trim()
    const it = String(r.item || '').trim()
    if (!pk || !cap || !it) continue
    if (!byPk.has(pk)) byPk.set(pk, new Set())
    byPk.get(pk).add(`${cap}\u0000${it}`)
  }
  return byPk
}

/**
 * @param {Map<string, Set<string>>} pptoByPk
 * @param {Map<string, object[]>} actividadesByPk — pk → filas prog_actividades
 */
export function buildProgValidationPreCheck(pptoByPk, actividadesByPk) {
  const pksSinProgramar = []
  const pksItemsSinFecha = []
  let totalItemsSinFecha = 0
  let minInicio = null
  let maxFin = null

  for (const [pk, itemKeys] of pptoByPk) {
    const acts = actividadesByPk.get(pk) || []
    const withDate = new Set()
    for (const a of acts) {
      if (!a?.fecha_inicio) continue
      const cap = String(a.capitulo || '').trim()
      const it = String(a.item || '').trim()
      if (!cap || !it) continue
      withDate.add(`${cap}\u0000${it}`)
      const fi = fmtDateIso(a.fecha_inicio)
      const ff = fmtDateIso(a.fecha_fin_calculada)
      if (fi && (!minInicio || fi < minInicio)) minInicio = fi
      if (ff && (!maxFin || ff > maxFin)) maxFin = ff
    }

    let missing = 0
    for (const k of itemKeys) {
      if (!withDate.has(k)) missing += 1
    }

    if (withDate.size === 0 && itemKeys.size > 0) {
      pksSinProgramar.push(pk)
    }
    if (missing > 0) {
      pksItemsSinFecha.push({ pk, missing, total: itemKeys.size })
      totalItemsSinFecha += missing
    }
  }

  return {
    pksSinProgramar: pksSinProgramar.sort(),
    pksItemsSinFecha: pksItemsSinFecha.sort((a, b) => a.pk.localeCompare(b.pk, undefined, { numeric: true })),
    totalItemsSinFecha,
    rutaCritica: {
      inicio: minInicio ? fmtDateHuman(minInicio) : null,
      fin: maxFin ? fmtDateHuman(maxFin) : null,
      inicioIso: minInicio,
      finIso: maxFin,
    },
  }
}
