/**
 * ClaraGIS — mesa de validación: filtros iniciales, foco de revisión y bundles.
 */
import {
  sicoeFSicoeVacios,
  sicoeFiltroSnapshot,
  sicoeBundleTieneCriteriosUsuario,
} from './sicoeFiltroCatalogo.js'
import { permisoReporteCantidades, esDesarrolladorUsuario } from '../../utils/permisosContrato.js'

export const CLARAGIS_TITULO = 'ClaraGIS'
export const CLARAGIS_HINT =
  'El plano siempre muestra eje y abscisado para ubicarse. Use Filtros para ver reportes; la intensidad es relativa al filtro activo (máx. costo directo = calor máximo). Validadores: al entrar se carga No Revisado de su nivel.'

/** Bundle vacío canónico (misma forma que ModuloPlanoMapaCalor). */
export function claraGisBundleVacio() {
  return {
    fSicoe: sicoeFSicoeVacios(),
    itemsChips: [],
    itemsOp: 'and',
    capasValidacion: [],
    capasValidacionOp: 'and',
    q_observacion: '',
    q_nodo: '',
    panelCapitulos: [],
    panelActasRpo: [],
  }
}

/**
 * Capas iniciales «No Revisado» en el nivel del validador.
 * @param {Array<{nivel:number,estado:string}>} capasIniciales — ya resueltas por el host (App)
 */
export function claraGisBundleNoRevisado(capasIniciales) {
  const capas = Array.isArray(capasIniciales)
    ? capasIniciales
      .filter((c) => c && c.nivel != null && String(c.estado || '').trim())
      .map((c) => ({ nivel: Number(c.nivel), estado: String(c.estado).trim() }))
    : []
  if (!capas.length) return claraGisBundleVacio()
  return sicoeFiltroSnapshot({
    ...claraGisBundleVacio(),
    capasValidacion: capas,
    capasValidacionOp: 'and',
  })
}

/** ¿El usuario debe recibir carga automática de No Revisado? */
export function claraGisEsMesaValidador(usuario, contratoId, capasIniciales) {
  if (!usuario) return false
  if (esDesarrolladorUsuario(usuario)) return false
  const capas = Array.isArray(capasIniciales) ? capasIniciales : []
  if (!capas.length) return false
  const p = permisoReporteCantidades(usuario, contratoId)
  return !!(p?.validar)
}

/**
 * Bundle de foco: solo el ítem del registro en revisión (sin capas No Revisado),
 * para ver también reportes anteriores del mismo ítem.
 */
export function claraGisBundleFocoItem(itemNumero, itemDescripcion = '') {
  const item = String(itemNumero || '').trim()
  if (!item) return claraGisBundleVacio()
  const f = sicoeFSicoeVacios()
  f.item = item
  f.items = []
  return sicoeFiltroSnapshot({
    ...claraGisBundleVacio(),
    fSicoe: f,
    itemsChips: [item],
    itemsOp: 'and',
  })
}

/**
 * Anota features del calor con claragis_modo: 'activo' | 'referencia'.
 * @param {object} heatFc FeatureCollection
 * @param {string|number|null} registroIdEnRevision
 */
export function claraGisAnotarFocoFeatures(heatFc, registroIdEnRevision) {
  const rid = registroIdEnRevision != null && String(registroIdEnRevision).trim() !== ''
    ? String(registroIdEnRevision)
    : null
  const feats = Array.isArray(heatFc?.features) ? heatFc.features : []
  if (!rid) {
    return {
      type: 'FeatureCollection',
      features: feats.map((f) => ({
        ...f,
        properties: { ...(f.properties || {}), claragis_modo: null },
      })),
    }
  }
  return {
    type: 'FeatureCollection',
    features: feats.map((f) => {
      const id = f?.properties?.id != null ? String(f.properties.id) : ''
      const modo = id && id === rid ? 'activo' : 'referencia'
      return {
        ...f,
        properties: { ...(f.properties || {}), claragis_modo: modo },
      }
    }),
  }
}

/** Expresión Mapbox de opacidad según modo de foco. */
export function claraGisOpacidadExpr(baseOpacity, { focusActive = false } = {}) {
  if (!focusActive) return baseOpacity
  return [
    'case',
    ['==', ['get', 'claragis_modo'], 'activo'],
    Math.min(1, baseOpacity + 0.25),
    ['==', ['get', 'claragis_modo'], 'referencia'],
    Math.max(0.12, baseOpacity * 0.35),
    0.05,
  ]
}

/** Radio / stroke extra para el registro en revisión. */
export function claraGisStrokeWidthExpr(base, { focusActive = false } = {}) {
  if (!focusActive) return base
  return [
    'case',
    ['==', ['get', 'claragis_modo'], 'activo'],
    typeof base === 'number' ? base + 2.5 : 4.5,
    base,
  ]
}

export function claraGisTieneCriterios(bundle) {
  return sicoeBundleTieneCriteriosUsuario(bundle)
}
