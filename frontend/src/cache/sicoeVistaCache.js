import {
  buildVistaCacheKey,
  getVistaCache,
  hashVistaPayload,
  invalidateVistaModulo,
  setVistaCache,
  VISTA_CACHE_TTL,
} from './vistaCache.js'
import { sicoeFiltroSnapshot } from '../modules/sicoe-obra/sicoeFiltroCatalogo.js'

const MODULO = 'sicoe'
const VISTA_BUSQUEDA = 'busqueda'
const MAX_STACK = 24

/** Stack de navegación drill por contrato (persiste al cambiar de módulo). */
const navegacionStacks = new Map()

function stackKey(contratoId) {
  return String(contratoId)
}

export function sicoeBundleNormalizado(bundle) {
  return sicoeFiltroSnapshot(bundle || {})
}

export function sicoeBundleCacheHash(bundle) {
  return hashVistaPayload(sicoeBundleNormalizado(bundle))
}

export function sicoeVistaCacheKey(contratoId, bundle, vistaId = VISTA_BUSQUEDA) {
  return buildVistaCacheKey(MODULO, contratoId, vistaId, sicoeBundleCacheHash(bundle))
}

export function sicoeNivelDrill(bundle, analisis) {
  const b = sicoeBundleNormalizado(bundle)
  const f = b.fSicoe || {}
  if (String(f.item || '').trim()) return 'item'
  if (String(f.capitulo || '').trim()) return 'capitulo'
  if (b.itemsChips?.length) return 'items_chips'
  if (b.panelActasRpo?.length) return 'panel_actas'
  if (b.panelCapitulos?.length) return 'panel_caps'
  return analisis?.modo || 'general'
}

/**
 * @typedef {object} SicoeVistaEntrada
 * @property {object} bundle
 * @property {string} cacheKey
 * @property {Array} reportes
 * @property {object|null} analisis
 * @property {boolean} hayMas
 * @property {number} offsetActual
 * @property {boolean} busquedaRealizada
 */

/**
 * @param {number|string} contratoId
 * @param {SicoeVistaEntrada} entrada
 */
export function sicoePushNavegacion(contratoId, entrada) {
  if (!contratoId || !entrada?.cacheKey) return
  const k = stackKey(contratoId)
  const stack = navegacionStacks.get(k) || []
  const top = stack[stack.length - 1]
  if (top?.cacheKey === entrada.cacheKey) {
    stack[stack.length - 1] = entrada
  } else {
    stack.push(entrada)
    if (stack.length > MAX_STACK) stack.shift()
  }
  navegacionStacks.set(k, stack)
}

/**
 * @param {number|string} contratoId
 * @returns {SicoeVistaEntrada|null}
 */
export function sicoePopNavegacion(contratoId) {
  const k = stackKey(contratoId)
  const stack = navegacionStacks.get(k) || []
  if (stack.length <= 1) return null
  stack.pop()
  const prev = stack[stack.length - 1] || null
  navegacionStacks.set(k, stack)
  return prev
}

export function sicoeClearNavegacion(contratoId) {
  if (contratoId == null) {
    navegacionStacks.clear()
    return
  }
  navegacionStacks.delete(stackKey(contratoId))
}

export function sicoePeekNavegacion(contratoId) {
  const stack = navegacionStacks.get(stackKey(contratoId)) || []
  return stack[stack.length - 1] || null
}

/**
 * @param {number|string} contratoId
 * @param {object} bundle
 * @returns {SicoeVistaEntrada|null}
 */
export function sicoeGetVistaCache(contratoId, bundle) {
  const key = sicoeVistaCacheKey(contratoId, bundle)
  const entry = getVistaCache(key, { modulo: MODULO })
  if (!entry?.data) return null
  return { ...entry.data, cacheKey: key }
}

/**
 * @param {number|string} contratoId
 * @param {SicoeVistaEntrada} payload
 */
export function sicoeSetVistaCache(contratoId, payload) {
  if (!contratoId || !payload?.bundle) return
  const key = payload.cacheKey || sicoeVistaCacheKey(contratoId, payload.bundle)
  const data = {
    bundle: sicoeBundleNormalizado(payload.bundle),
    reportes: payload.reportes ?? [],
    analisis: payload.analisis ?? null,
    hayMas: !!payload.hayMas,
    offsetActual: payload.offsetActual ?? 0,
    busquedaRealizada: payload.busquedaRealizada !== false,
  }
  setVistaCache(key, data, { modulo: MODULO })
  sicoePushNavegacion(contratoId, { ...data, cacheKey: key })
}

export function invalidateSicoeVistaCache(contratoId) {
  invalidateVistaModulo(MODULO, contratoId)
  sicoeClearNavegacion(contratoId)
}

export { VISTA_CACHE_TTL, MODULO as SICOE_CACHE_MODULO }
