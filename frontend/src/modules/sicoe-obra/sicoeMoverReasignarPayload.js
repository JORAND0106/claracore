/**
 * Convierte snapshot de SicoeFiltroModal al body de
 * POST …/registros/reasignar-subcontratista/buscar
 */
import {
  sicoeFSicoeToFiltros,
  sicoeFiltroSnapshot,
  sicoeItemsChipsFromFSicoe,
} from './sicoeFiltroCatalogo.js'

function asIntOrNull(v) {
  if (v === '' || v == null) return null
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

function asFloatOrNull(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function sicoeBundleToReasignarPayload(bundle) {
  const snap = sicoeFiltroSnapshot(bundle || {})
  const fNorm = sicoeFSicoeToFiltros(snap.fSicoe)
  Object.keys(fNorm).forEach((k) => {
    if (fNorm[k] === '' || fNorm[k] === undefined) fNorm[k] = null
  })
  const capas = Array.isArray(snap.capasValidacion) ? snap.capasValidacion : []
  const ser = capas
    .map((c) => {
      const est = String(c?.estado || '').trim()
      if (!est) return null
      if (c?.nivel != null && c.nivel !== '') {
        const n = parseInt(c.nivel, 10)
        if (Number.isFinite(n) && n >= 1 && n <= 6) return { nivel: n, estado: est }
      }
      if (c?.cargo_id != null && c.cargo_id !== '') {
        const id = parseInt(c.cargo_id, 10)
        if (Number.isFinite(id)) return { cargo_id: id, estado: est }
      }
      return null
    })
    .filter(Boolean)
  const capaFirst = capas[0] || null
  const itemsChips = snap.itemsChips?.length
    ? snap.itemsChips
    : sicoeItemsChipsFromFSicoe(snap.fSicoe)
  const listEx = []
  const seen = new Set()
  for (const x of itemsChips || []) {
    const s = String(x || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    listEx.push(s)
  }
  const draftItem = String(fNorm.item ?? '').trim()
  if (draftItem && !seen.has(draftItem)) listEx.push(draftItem)
  const itemMasivo = listEx.length === 1 && !(snap.itemsChips?.length) ? listEx[0] : null
  const itemsFiltroMasivo =
    listEx.length === 0 || (listEx.length === 1 && !(snap.itemsChips?.length))
      ? null
      : JSON.stringify(listEx)
  const itemsFiltroOpMasivo =
    listEx.length > 1 ? (snap.itemsOp === 'or' || snap.fSicoe?.itemsOp === 'or' ? 'or' : 'and') : null

  return {
    numero_reporte: asIntOrNull(fNorm.numero_reporte),
    numero_registro: asIntOrNull(fNorm.numero_registro),
    semana: asIntOrNull(fNorm.semana),
    acta_rpo: asIntOrNull(fNorm.acta_rpo),
    subcontratista_id: asIntOrNull(fNorm.subcontratista_id),
    capitulo: fNorm.capitulo || null,
    item: itemMasivo,
    items_filtro: itemsFiltroMasivo,
    items_filtro_op: itemsFiltroOpMasivo,
    tramo: fNorm.tramo || null,
    costado: fNorm.costado || null,
    pk_id: asIntOrNull(fNorm.pk_id),
    abs_inicio: asFloatOrNull(fNorm.abs_inicio),
    abs_final: asFloatOrNull(fNorm.abs_final),
    estado: fNorm.estado || null,
    etiqueta_validacion: (fNorm.etiqueta_validacion && String(fNorm.etiqueta_validacion).trim()) || null,
    cargo_id: capaFirst?.cargo_id != null ? asIntOrNull(capaFirst.cargo_id) : null,
    estado_validacion: capaFirst?.estado || null,
    validacion_capas: ser.length > 0 ? JSON.stringify(ser) : null,
    validacion_capas_op:
      ser.length > 1 ? (snap.capasValidacionOp === 'or' ? 'or' : 'and') : null,
    q_observacion: (snap.q_observacion || '').trim() || null,
    q_nodo: (snap.q_nodo || '').trim() || null,
    pendiente_item: false,
  }
}
