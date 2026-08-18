/**
 * Agrupación por competencia (IDU / ESP) para export Excel de presupuesto.
 * Valores dinámicos por contrato — no se asume un número fijo.
 */

import { compararTextoAsc } from './pptoTipoEntidad.js'

/** Etiqueta visible cuando el campo viene vacío. */
export const PPTO_COMPETENCIA_SIN = '(Sin competencia)'

/**
 * @param {unknown} v
 * @returns {string} clave normalizada (trim); vacío si no hay valor
 */
export function normalizarCompetenciaKey(v) {
  return String(v ?? '').trim()
}

/**
 * Etiqueta para encabezados / subfilas.
 * @param {unknown} v
 * @returns {string}
 */
export function etiquetaCompetencia(v) {
  const k = normalizarCompetenciaKey(v)
  return k || PPTO_COMPETENCIA_SIN
}

/**
 * Orden: competencias con nombre primero (locale es), vacío al final.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function compararCompetenciaAsc(a, b) {
  const sa = normalizarCompetenciaKey(a)
  const sb = normalizarCompetenciaKey(b)
  if (!sa && !sb) return 0
  if (!sa) return 1
  if (!sb) return -1
  return compararTextoAsc(sa, sb)
}

/**
 * Índice capítulo → lista de agregados por competencia (ordenados).
 * @param {Array<{ capitulo?: unknown, competencia?: unknown, cantidad?: unknown, costo_directo?: unknown }>} lista
 * @returns {Map<string, Array<{ competencia: string, cantidad: number, costoDirecto: number }>>}
 */
export function indexCompetenciasPorCapitulo(lista) {
  /** @type {Map<string, Map<string, { competencia: string, cantidad: number, costoDirecto: number }>>} */
  const tmp = new Map()
  for (const row of lista || []) {
    const cap = String(row?.capitulo ?? '').trim()
    if (!cap) continue
    const comp = normalizarCompetenciaKey(row?.competencia)
    if (!tmp.has(cap)) tmp.set(cap, new Map())
    const byComp = tmp.get(cap)
    const prev = byComp.get(comp) || { competencia: comp, cantidad: 0, costoDirecto: 0 }
    prev.cantidad += Number(row?.cantidad) || 0
    prev.costoDirecto += Math.round(Number(row?.costo_directo) || 0)
    byComp.set(comp, prev)
  }
  /** @type {Map<string, Array<{ competencia: string, cantidad: number, costoDirecto: number }>>} */
  const out = new Map()
  for (const [cap, byComp] of tmp) {
    const arr = [...byComp.values()].sort((a, b) => compararCompetenciaAsc(a.competencia, b.competencia))
    out.set(cap, arr)
  }
  return out
}

/**
 * ¿Conviene mostrar desglose por competencia en Resumen / memorias?
 * Sí si hay ≥2 claves distintas, o al menos una competencia no vacía.
 * @param {Array<{ competencia?: unknown }>} filas
 * @returns {boolean}
 */
export function debeMostrarDesgloseCompetencia(filas) {
  const keys = new Set()
  let algunaNombrada = false
  for (const r of filas || []) {
    const k = normalizarCompetenciaKey(r?.competencia)
    keys.add(k)
    if (k) algunaNombrada = true
  }
  if (keys.size >= 2) return true
  return algunaNombrada
}

/**
 * Agrupa registros por competencia (dinámico). Orden: nombre asc, vacío al final.
 * Dentro de cada bucket se conserva el orden relativo de entrada
 * (el caller aplica orden Tramo→Infra→Abs vía agruparRegistrosPorTipoEntidad).
 *
 * @param {Array<Record<string, unknown>>} registros
 * @returns {Array<{ competencia: string, label: string, registros: Array<Record<string, unknown>> }>}
 */
export function agruparRegistrosPorCompetencia(registros) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const buckets = new Map()
  for (const r of registros || []) {
    const k = normalizarCompetenciaKey(r?.competencia)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(r)
  }
  const keys = [...buckets.keys()].sort(compararCompetenciaAsc)
  return keys.map((k) => ({
    competencia: k,
    label: etiquetaCompetencia(k),
    registros: buckets.get(k) || [],
  }))
}

/**
 * Texto Título 1 para bloque de competencia en memorias.
 * Incluye conteo para verificar que el bloque no es solo una etiqueta.
 * @param {string} label
 * @param {number} [nRegistros]
 * @returns {string}
 */
export function encabezadoGrupoCompetencia(label, nRegistros) {
  const base = `Competencia: ${label || PPTO_COMPETENCIA_SIN}`
  const n = Number(nRegistros)
  if (!Number.isFinite(n) || n < 0) return base
  const unidad = n === 1 ? 'registro' : 'registros'
  return `${base} — ${n} ${unidad}`
}

/**
 * Filtra gráficos del ítem a los que intersectan con los ids del bloque de competencia.
 * Si el gráfico no trae presupuesto_ids, se conserva (comportamiento previo).
 *
 * @param {Array<object>} graficosPrep
 * @param {Array<Record<string, unknown>>} registrosBloque
 * @returns {Array<object>}
 */
export function filtrarGraficosPorRegistrosBloque(graficosPrep, registrosBloque) {
  const ids = new Set()
  for (const r of registrosBloque || []) {
    const n = Number(r?.id)
    if (Number.isFinite(n) && n > 0) ids.add(n)
  }
  return (Array.isArray(graficosPrep) ? graficosPrep : []).filter((g) => {
    const raw = Array.isArray(g?.presupuesto_ids) ? g.presupuesto_ids : null
    if (!raw || !raw.length) return true
    return raw.some((v) => {
      const n = Number(v)
      return Number.isFinite(n) && ids.has(n)
    })
  })
}
