/**
 * Precarga la tabla de coordenadas del editor de dibujo
 * desde los puntos topográficos de la portada del reporte.
 */

/**
 * @param {unknown} puntos
 * @returns {{ num: string, norte: number|string, este: number|string, cota: number|string, desc: string }[]}
 */
export function coordRowsDesdePuntosPortada(puntos) {
  if (!Array.isArray(puntos) || !puntos.length) return []
  const out = []
  let auto = 1
  for (const p of puntos) {
    if (!p || typeof p !== 'object') continue
    const norteRaw = p.norte
    const esteRaw = p.este
    const norte = norteRaw === '' || norteRaw == null ? null : Number(norteRaw)
    const este = esteRaw === '' || esteRaw == null ? null : Number(esteRaw)
    if (norte == null && este == null) continue
    if ((norte != null && !Number.isFinite(norte)) || (este != null && !Number.isFinite(este))) continue
    const num = String(p.punto ?? p.num ?? p.nombre ?? '').trim() || String(auto)
    out.push({
      num,
      norte: norte != null && Number.isFinite(norte) ? norte : '',
      este: este != null && Number.isFinite(este) ? este : '',
      cota: p.cota == null || p.cota === '' ? '' : Number.isFinite(Number(p.cota)) ? Number(p.cota) : String(p.cota),
      desc: String(p.descripcion ?? p.desc ?? '').trim(),
    })
    auto += 1
  }
  return out
}
