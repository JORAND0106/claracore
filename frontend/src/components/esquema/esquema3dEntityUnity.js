/**
 * Contorno + sólido = una sola entidad visual en modo 3D.
 * El contorno fuente (sourceEntityId) no se dibuja aparte del sólido,
 * salvo manijas de edición en planta ortográfica (superior, sin giro libre).
 */
import { isEsquema3dIsoView, normalizeViewId } from './esquema3dViews.js'
import { linkedSourceEntityIds } from './esquema3dSolids.js'

/**
 * ¿Se debe dibujar el contorno 2D ligado a un sólido?
 * @returns {boolean}
 */
export function shouldDrawLinkedContour2d({
  mode3d = false,
  orbitFree = false,
  viewId = 'top',
  selected = false,
} = {}) {
  if (!mode3d) return true
  if (orbitFree) return false
  if (isEsquema3dIsoView(viewId)) return false
  if (normalizeViewId(viewId) !== 'top') return false
  return !!selected
}

/**
 * Filtra objetos 2D para el redibujo 3D: oculta contornos fuente que ya son sólido.
 * @param {object[]} objects
 * @param {object[]} solids
 * @param {{ mode3d?: boolean, orbitFree?: boolean, viewId?: string, selectedIds?: Set|string[] }} opts
 */
export function filterObjectsFor3dDraw(objects, solids, {
  mode3d = true,
  orbitFree = false,
  viewId = 'top',
  selectedIds = null,
} = {}) {
  const list = objects || []
  if (!mode3d) return list.slice()
  const linked = linkedSourceEntityIds(solids || [])
  if (!linked.size) return list.slice()
  const sel = selectedIds instanceof Set
    ? selectedIds
    : new Set(selectedIds || [])
  return list.filter((o) => {
    if (!o?.id || !linked.has(o.id)) return true
    return shouldDrawLinkedContour2d({
      mode3d: true,
      orbitFree,
      viewId,
      selected: sel.has(o.id),
    })
  })
}

/**
 * Contrato: tras extruir, el contorno fuente y el sólido no coexisten en pantalla
 * en iso / giro libre / perfiles.
 */
export function linkedContoursHiddenInOrbit(objects, solids) {
  const visible = filterObjectsFor3dDraw(objects, solids, {
    mode3d: true,
    orbitFree: true,
    viewId: 'top',
    selectedIds: (objects || []).map((o) => o.id), // aunque estén seleccionados
  })
  const linked = linkedSourceEntityIds(solids || [])
  return (objects || [])
    .filter((o) => linked.has(o?.id))
    .every((o) => !visible.some((v) => v.id === o.id))
}
