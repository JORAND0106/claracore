/**
 * Resuelve el objetivo de Extruir / editar extrusión a partir de la selección actual.
 * Regla C-3D-05 / C-TX: la acción opera solo sobre el elemento seleccionado ahora.
 */
import { extrudeModeForView, isEsquema3dDrawView, normalizeViewId } from './esquema3dViews.js'
import {
  isClosedDrawableEntity,
  solidCanEditExtrusion,
  solidForSourceEntity,
} from './esquema3dSolids.js'

/**
 * @param {{
 *   selectedSolidIds?: Array<string|number>,
 *   selectedEntityIds?: Iterable<string|number>,
 *   solids?: object[],
 *   objects?: object[],
 *   viewId?: string,
 * }} args
 * @returns {{
 *   ok: true,
 *   kind: 'edit'|'create',
 *   solid?: object|null,
 *   entity?: object|null,
 *   mode: 'cotas'|'length',
 *   viewId: string,
 * } | { ok: false, error: string }}
 */
export function resolveExtrudeSelection({
  selectedSolidIds = [],
  selectedEntityIds = [],
  solids = [],
  objects = [],
  viewId = 'top',
} = {}) {
  const vid = normalizeViewId(viewId)
  if (!isEsquema3dDrawView(vid)) {
    return { ok: false, error: 'Cambie a una de las seis vistas de cara para extruir.' }
  }

  const entIdSet = selectedEntityIds instanceof Set
    ? selectedEntityIds
    : new Set([...(selectedEntityIds || [])].map(String))

  const closedSelected = (objects || []).filter(
    (o) => o && entIdSet.has(String(o.id)) && isClosedDrawableEntity(o),
  )
  const selectedSolids = (selectedSolidIds || [])
    .map((id) => (solids || []).find((s) => String(s?.id) === String(id)))
    .filter(Boolean)

  // Contorno seleccionado manda si no coincide con el sólido aún amarrado (regresión A→B).
  if (closedSelected.length === 1) {
    const entity = closedSelected[0]
    const linked = solidForSourceEntity(solids, entity.id)
    if (solidCanEditExtrusion(linked)) {
      const editView = normalizeViewId(linked.extrudeParams?.viewId || linked.viewPlane || vid)
      const mode = linked.extrudeParams?.lengthM != null && Number(linked.extrudeParams.lengthM) > 0
        ? 'length'
        : extrudeModeForView(editView)
      return {
        ok: true, kind: 'edit', solid: linked, entity, mode, viewId: editView,
      }
    }
    // Contorno sin extruir: crear (ignora sólido previo en selectedSolidIds).
    if (selectedSolids.length > 1) {
      return { ok: false, error: 'Seleccione un elemento' }
    }
    return {
      ok: true,
      kind: 'create',
      solid: null,
      entity,
      mode: extrudeModeForView(vid),
      viewId: vid,
    }
  }

  if (closedSelected.length > 1) {
    return { ok: false, error: 'Seleccione un elemento' }
  }

  // Solo sólido(s) seleccionado(s), sin contorno cerrado en selectedIds.
  if (selectedSolids.length === 1) {
    const solid = selectedSolids[0]
    if (!solidCanEditExtrusion(solid)) {
      return { ok: false, error: 'Seleccione un elemento' }
    }
    const entity = solid.sourceEntityId
      ? (objects || []).find((o) => String(o.id) === String(solid.sourceEntityId)) || null
      : null
    const editView = normalizeViewId(solid.extrudeParams?.viewId || solid.viewPlane || vid)
    const mode = solid.extrudeParams?.lengthM != null && Number(solid.extrudeParams.lengthM) > 0
      ? 'length'
      : extrudeModeForView(editView)
    return {
      ok: true, kind: 'edit', solid, entity, mode, viewId: editView,
    }
  }

  if (selectedSolids.length > 1) {
    return { ok: false, error: 'Seleccione un elemento' }
  }

  return { ok: false, error: 'Seleccione un elemento' }
}

/** Cotas iniciales al editar (o null si creación / sin params). */
export function initialCotasFromSolid(solid) {
  const params = solid?.extrudeParams || {}
  if (params.cotaSuperior == null || params.cotaInferior == null) return null
  const sup = Number(params.cotaSuperior)
  const inf = Number(params.cotaInferior)
  if (!Number.isFinite(sup) || !Number.isFinite(inf)) return null
  return {
    superior: sup.toFixed(3),
    inferior: inf.toFixed(3),
    altura: (sup - inf).toFixed(3),
  }
}
