/**
 * Sync de coordenadas Inicio/Fin entre planilla de tubería (Topografía)
 * y la tabla de coordenadas de la herramienta de esquema.
 */

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function rowLabel(r) {
  return String(r?.num ?? r?.desc ?? r?.descripcion ?? '').trim().toLowerCase()
}

/**
 * Filas iniciales de la tabla a partir del tramo Magna GK de la planilla.
 * @param {{ norteIni?: *, esteIni?: *, norteFin?: *, esteFin?: * }|null} seed
 * @returns {Array<{num:string,norte:number,este:number,cota:string,desc:string}>}
 */
export function coordRowsFromSeedTramo(seed) {
  const s = seed && typeof seed === 'object' ? seed : null
  if (!s) return []
  const nIni = numOrNull(s.norteIni ?? s.norte_abs_inicial ?? s.norte_ini)
  const eIni = numOrNull(s.esteIni ?? s.este_abs_inicial ?? s.este_ini)
  const nFin = numOrNull(s.norteFin ?? s.norte_abs_final ?? s.norte_fin)
  const eFin = numOrNull(s.esteFin ?? s.este_abs_final ?? s.este_fin)
  if (![nIni, eIni, nFin, eFin].every((n) => n != null)) return []
  return [
    { num: 'Inicio', norte: nIni, este: eIni, cota: '', desc: 'Inicio' },
    { num: 'Fin', norte: nFin, este: eFin, cota: '', desc: 'Fin' },
  ]
}

/**
 * Extrae Inicio/Fin (o primeras/últimas filas con N/E) para devolver a la planilla.
 * @param {Array<object>|null|undefined} rows
 * @returns {{ norteIni: number, esteIni: number, norteFin: number, esteFin: number }|null}
 */
export function seedTramoFromCoordRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  const withNe = list.filter((r) => {
    const n = numOrNull(r?.norte)
    const e = numOrNull(r?.este)
    return n != null && e != null
  })
  if (withNe.length < 2) return null

  let ini = withNe.find((r) => {
    const lab = rowLabel(r)
    return lab === 'inicio' || lab === '1' || lab.startsWith('ini')
  })
  let fin = withNe.find((r) => {
    const lab = rowLabel(r)
    return lab === 'fin' || lab === '2' || lab.startsWith('fin')
  })
  if (!ini || !fin || ini === fin) {
    ini = withNe[0]
    fin = withNe[withNe.length - 1]
  }
  const norteIni = numOrNull(ini.norte)
  const esteIni = numOrNull(ini.este)
  const norteFin = numOrNull(fin.norte)
  const esteFin = numOrNull(fin.este)
  if (![norteIni, esteIni, norteFin, esteFin].every((n) => n != null)) return null
  return { norteIni, esteIni, norteFin, esteFin }
}

/**
 * Patch de params de planilla a partir de un seed { norteIni, … }.
 * @returns {object|null} campos a fusionar en setParams
 */
export function planillaParamsPatchFromSeed(seed) {
  const raw = seed && typeof seed === 'object' ? seed : null
  if (!raw) return null
  const norteIni = numOrNull(raw.norteIni)
  const esteIni = numOrNull(raw.esteIni)
  const norteFin = numOrNull(raw.norteFin)
  const esteFin = numOrNull(raw.esteFin)
  if (![norteIni, esteIni, norteFin, esteFin].every((n) => n != null)) return null
  return {
    norte_abs_inicial: String(norteIni),
    este_abs_inicial: String(esteIni),
    norte_abs_final: String(norteFin),
    este_abs_final: String(esteFin),
  }
}
