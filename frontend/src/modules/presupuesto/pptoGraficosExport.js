/**
 * Filtrado y subagrupación de gráficos de exportación por subtabla / grupo.
 */
import { clasificarTipoEntidad, ordenarRegistrosSubtabla } from './pptoTipoEntidad.js'

/**
 * Keys de grupo de entidad cubiertas por los tipos_entidad del gráfico
 * (registros del grupo asociados al ítem).
 *
 * @param {{ tipos_entidad?: unknown }} grafico
 * @returns {Set<string>|null} null = sin metadata (mostrar en todas las subtablas)
 */
export function keysGrupoEntidadDeGrafico(grafico) {
  const tipos = Array.isArray(grafico?.tipos_entidad) ? grafico.tipos_entidad : null
  if (!tipos || !tipos.length) return null
  const keys = new Set()
  for (const t of tipos) {
    const k = clasificarTipoEntidad(t)
    keys.add(k || 'otros')
  }
  return keys
}

/**
 * ¿El gráfico debe aparecer tras la subtabla `grupoKey`?
 * Si el grupo cruza varios tipos, el mismo gráfico se repite en cada una.
 *
 * @param {object} grafico
 * @param {string} grupoKey
 * @returns {boolean}
 */
export function graficoAplicaAGrupoEntidad(grafico, grupoKey) {
  if (!grafico) return false
  const keys = keysGrupoEntidadDeGrafico(grafico)
  if (keys == null) return true
  return keys.has(grupoKey)
}

/**
 * @param {Array<object>} graficos
 * @param {string} grupoKey
 * @returns {Array<object>}
 */
export function filtrarGraficosPorGrupoEntidad(graficos, grupoKey) {
  return (Array.isArray(graficos) ? graficos : []).filter(
    (g) => g?.image && graficoAplicaAGrupoEntidad(g, grupoKey),
  )
}

/** @param {unknown} v @returns {number|null} */
function toPid(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * IDs de presupuesto asociados al gráfico (payload de export).
 * @param {object} grafico
 * @returns {number[]}
 */
export function presupuestoIdsDeGrafico(grafico) {
  const raw = Array.isArray(grafico?.presupuesto_ids) ? grafico.presupuesto_ids : []
  const out = []
  const seen = new Set()
  for (const v of raw) {
    const pid = toPid(v)
    if (pid == null || seen.has(pid)) continue
    seen.add(pid)
    out.push(pid)
  }
  return out
}

/**
 * Subagrupa registros de una subtabla (Área/Longitud/Unidad) por grupo de gráfico.
 *
 * Prioridad: pertenencia al grupo de gráfico > orden Tramo/Infra/Abs (este último
 * se aplica dentro de cada subgrupo).
 *
 * Un registro en varios grupos queda solo en el primero (por orden, luego grupo_id).
 * Los sin gráfico van al final como remanente (sin graficos).
 *
 * @param {Array<Record<string, unknown>>} registros  ya filtrados por tipo de entidad
 * @param {Array<object>} graficosPrep  gráficos del ítem (con image + presupuesto_ids)
 * @param {string} grupoKey  'area' | 'longitud' | 'unidad' | 'otros'
 * @returns {Array<{ grupoId: string|null, graficos: object[], registros: object[] }>}
 */
export function subagruparRegistrosPorGrupoGrafico(registros, graficosPrep, grupoKey) {
  const regs = Array.isArray(registros) ? registros : []
  if (!regs.length) return []

  const grafsTipo = filtrarGraficosPorGrupoEntidad(graficosPrep, grupoKey)
  const regIds = new Set()
  for (const r of regs) {
    const pid = toPid(r?.id)
    if (pid != null) regIds.add(pid)
  }

  /** @type {Map<string, { grupoId: string, orden: number, graficos: object[], pids: Set<number> }>} */
  const grupos = new Map()
  for (const g of grafsTipo) {
    const gid = g?.grupo_id != null && String(g.grupo_id) ? String(g.grupo_id) : `url:${g?.caption || ''}:${g?.orden ?? 0}`
    let entry = grupos.get(gid)
    if (!entry) {
      entry = {
        grupoId: gid,
        orden: Number.isFinite(Number(g?.orden)) ? Number(g.orden) : 0,
        graficos: [],
        pids: new Set(),
      }
      grupos.set(gid, entry)
    }
    entry.orden = Math.min(entry.orden, Number.isFinite(Number(g?.orden)) ? Number(g.orden) : entry.orden)
    entry.graficos.push(g)
    for (const pid of presupuestoIdsDeGrafico(g)) {
      if (regIds.has(pid)) entry.pids.add(pid)
    }
  }

  // Orden de grupos: orden asc, luego grupo_id.
  const gruposOrdenados = [...grupos.values()].sort((a, b) => {
    if (a.orden !== b.orden) return a.orden - b.orden
    return String(a.grupoId).localeCompare(String(b.grupoId))
  })

  // Asignación exclusiva: primer grupo que reclama el pid.
  /** @type {Map<number, string>} */
  const pidToGid = new Map()
  for (const g of gruposOrdenados) {
    for (const pid of g.pids) {
      if (!pidToGid.has(pid)) pidToGid.set(pid, g.grupoId)
    }
  }

  /** @type {Map<string, object[]>} */
  const buckets = new Map()
  for (const g of gruposOrdenados) buckets.set(g.grupoId, [])
  const remanente = []

  for (const r of regs) {
    const pid = toPid(r?.id)
    const gid = pid != null ? pidToGid.get(pid) : undefined
    if (gid != null && buckets.has(gid)) buckets.get(gid).push(r)
    else remanente.push(r)
  }

  const out = []
  for (const g of gruposOrdenados) {
    const list = buckets.get(g.grupoId) || []
    // Solo subgrupos con registros de esta subtabla (evita gráfico huérfano aquí).
    if (!list.length) continue
    out.push({
      grupoId: g.grupoId,
      graficos: g.graficos.filter((x) => x?.image),
      registros: ordenarRegistrosSubtabla(list),
    })
  }
  if (remanente.length) {
    out.push({
      grupoId: null,
      graficos: [],
      registros: ordenarRegistrosSubtabla(remanente),
    })
  }
  return out
}
