/** Pie de foto automático para gráficos de memorias de Presupuesto. */

function absRango(absIni, absFin) {
  const a = absIni != null ? String(absIni).trim() : ''
  const b = absFin != null ? String(absFin).trim() : ''
  if (a && b) return `${a}-${b}`
  return a || b
}

/**
 * Concatena valores distintos de Tramo, Infraestructura, Abs e Id_Pol.
 * @param {Array<Record<string, unknown>>} regs
 * @returns {string}
 */
export function buildCaptionPieFoto(regs) {
  const tramos = []
  const infras = []
  const absList = []
  const pols = []
  const seenT = new Set()
  const seenI = new Set()
  const seenA = new Set()
  const seenP = new Set()

  for (const r of regs || []) {
    const t = String(r?.tramo || '').trim()
    if (t && !seenT.has(t)) {
      seenT.add(t)
      tramos.push(t)
    }
    const inf = String(r?.infraestructura || '').trim()
    if (inf && !seenI.has(inf)) {
      seenI.add(inf)
      infras.push(inf)
    }
    const ar = absRango(r?.abs_inicio, r?.abs_final)
    if (ar && !seenA.has(ar)) {
      seenA.add(ar)
      absList.push(ar)
    }
    const pol = String(r?.id_pol || '').trim()
    if (pol && !seenP.has(pol)) {
      seenP.add(pol)
      pols.push(pol)
    }
  }

  const parts = []
  if (tramos.length) parts.push(`Tramo: ${tramos.join(', ')}`)
  if (infras.length) parts.push(`Infraestructura: ${infras.join(', ')}`)
  if (absList.length) parts.push(`Abs: ${absList.join(', ')}`)
  if (pols.length) parts.push(`Id_Pol: ${pols.join(', ')}`)
  return parts.length ? parts.join(' · ') : '—'
}
