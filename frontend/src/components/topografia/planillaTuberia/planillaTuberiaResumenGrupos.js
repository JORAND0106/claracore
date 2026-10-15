/**
 * Agrupación del Resumen de Cantidades (solo presentación).
 * Total de grupo = suma de netos visibles — informativo; no cambia fórmulas ni SICOE.
 */
import { esCodigoOtros, nombreTrituradoPorTipo } from './planillaTuberiaCalc.js'

export const GRUPOS_RESUMEN = [
  { id: 'excavacion', titulo: 'Excavación', base: 'EXC' },
  { id: 'tuberia', titulo: 'Tubería', base: 'TUB' },
  { id: 'triturado', titulo: 'Mat. granular', base: 'TRI' },
  { id: 'relleno', titulo: 'Relleno granular', base: 'REL' },
  { id: 'geotextil', titulo: 'Geotextil', base: 'GEO' },
  { id: 'otros', titulo: 'Otros', base: null },
]

const BASE_A_GRUPO = {
  EXC: 'excavacion',
  EXC_ROC: 'excavacion',
  TUB: 'tuberia',
  TRI: 'triturado',
  REL: 'relleno',
  GEO: 'geotextil',
}

const GRUPO_ALIAS = {
  EXC: 'excavacion',
  excavacion: 'excavacion',
  TUB: 'tuberia',
  tuberia: 'tuberia',
  TRI: 'triturado',
  triturado: 'triturado',
  REL: 'relleno',
  relleno: 'relleno',
  GEO: 'geotextil',
  geotextil: 'geotextil',
  OTROS: 'otros',
  otros: 'otros',
}

export function tituloGrupoResumen(grupoId, tipo) {
  if (grupoId === 'triturado') return nombreTrituradoPorTipo(tipo)
  const g = GRUPOS_RESUMEN.find((x) => x.id === grupoId)
  return g?.titulo || grupoId
}

/** Grupo de una línea del Resumen (codigo + override.grupo opcional). */
export function grupoIdDeLinea(codigo, override = null) {
  const cod = String(codigo || '').trim().toUpperCase()
  if (BASE_A_GRUPO[cod]) return BASE_A_GRUPO[cod]
  if (esCodigoOtros(cod)) {
    const raw = String(override?.grupo || '').trim()
    if (raw) {
      const alias = GRUPO_ALIAS[raw] || GRUPO_ALIAS[raw.toUpperCase()]
      if (alias) return alias
    }
    return 'otros'
  }
  return 'otros'
}

/**
 * @param {object[]} netos
 * @param {{ displayNeto?: (n)=>any, overridesByCodigo?: Record<string, object>, tipo?: string }} opts
 * @returns {{ id, titulo, total, lineas }[]}
 */
export function agruparNetosResumen(netos, opts = {}) {
  const displayNeto = typeof opts.displayNeto === 'function'
    ? opts.displayNeto
    : (n) => (n?.neto != null ? Number(n.neto) : 0)
  const ovMap = opts.overridesByCodigo || {}
  const tipo = opts.tipo
  const buckets = Object.fromEntries(GRUPOS_RESUMEN.map((g) => [g.id, []]))
  for (const n of netos || []) {
    if (!n || typeof n !== 'object') continue
    const cod = String(n.codigo || '').trim().toUpperCase()
    const ov = ovMap[cod] || null
    const gid = grupoIdDeLinea(cod, ov)
    if (!buckets[gid]) buckets[gid] = []
    buckets[gid].push(n)
  }
  return GRUPOS_RESUMEN.map((g) => {
    const lineas = buckets[g.id] || []
    let total = 0
    for (const n of lineas) {
      const v = displayNeto(n)
      const num = v === '' || v == null ? NaN : Number(v)
      if (Number.isFinite(num)) total += num
    }
    return {
      id: g.id,
      titulo: tituloGrupoResumen(g.id, tipo),
      base: g.base,
      total: Math.round(total * 100) / 100,
      lineas,
    }
  })
}

/** Default descontar_de al agregar línea con + en un grupo. */
export function descontarDeDefaultGrupo(grupoId) {
  if (grupoId === 'excavacion') return 'EXC'
  if (grupoId === 'triturado') return 'TRI'
  if (grupoId === 'relleno') return 'REL'
  return null
}
