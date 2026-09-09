/**
 * Helpers puros — hoja unificada Tab Precios (presupuesto + manual + AIU/IVA).
 */
import {
  EMPTY_IMPUESTO,
  formImpuestoDesdeTributos,
  tributosPayloadDesdeForm,
} from '../../admin/catalogoInsumosTributos.js'

export function parseNum(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return null
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return NaN
  return n
}

export function uniqueCapitulos(listado) {
  const set = new Set()
  for (const it of listado || []) {
    const c = String(it?.capitulo || '').trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Filtra ítems del listado para autocomplete de filas manuales.
 * excludeLpIds: listado_precio_id ya presentes en la hoja (presupuesto o manual).
 */
export function filterListadoItems(listado, { capitulo = '', query = '', excludeLpIds = [], limit = 40 } = {}) {
  const cap = String(capitulo || '').trim().toLowerCase()
  const q = String(query || '').trim().toLowerCase()
  const excl = new Set((excludeLpIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))
  const out = []
  for (const it of listado || []) {
    const id = Number(it?.id)
    if (!Number.isFinite(id) || id <= 0 || excl.has(id)) continue
    if (cap && String(it?.capitulo || '').trim().toLowerCase() !== cap) continue
    if (q) {
      const hay = [
        it?.item_numero,
        it?.descripcion,
        it?.competencia,
      ].map((x) => String(x || '').toLowerCase()).join(' ')
      if (!hay.includes(q)) continue
    }
    out.push(it)
    if (out.length >= limit) break
  }
  return out
}

export function impuestoFromRow(row) {
  if (row?.impuesto && typeof row.impuesto === 'object') {
    return { ...EMPTY_IMPUESTO, ...row.impuesto }
  }
  return formImpuestoDesdeTributos(row?.tributos || {})
}

/**
 * Arma el payload de bulk a partir de filas + drafts de edición.
 * drafts: { [rowKey]: { vu_costo?, cantidad?, impuesto? } }
 */
export function buildBulkPayload(rows, drafts = {}) {
  const out = []
  for (const r of rows || []) {
    const key = rowKey(r)
    const d = drafts[key] || {}
    const origen = String(r.origen || 'presupuesto').toLowerCase() === 'manual' ? 'manual' : 'presupuesto'
    const vuRaw = d.vu_costo != null ? d.vu_costo : (r.vu_costo_mo != null ? r.vu_costo_mo : '')
    const vu = parseNum(vuRaw)
    if (vu == null || Number.isNaN(vu) || vu < 0) continue
    if (!r.listado_precio_id) continue
    const impuesto = d.impuesto || impuestoFromRow(r) || EMPTY_IMPUESTO
    const item = {
      listado_precio_id: Number(r.listado_precio_id),
      precio_unitario_sub: vu,
      origen,
      tributos: tributosPayloadDesdeForm(impuesto),
    }
    if (origen === 'manual') {
      const cantRaw = d.cantidad != null ? d.cantidad : (r.cantidad != null ? r.cantidad : '')
      const cant = parseNum(cantRaw)
      if (cant == null || Number.isNaN(cant) || cant < 0) continue
      item.cantidad_manual = cant
    }
    out.push(item)
  }
  return out
}

export function rowKey(r) {
  if (r?._draftKey) return String(r._draftKey)
  if (r?.precio_id != null) return `p-${r.precio_id}`
  if (r?.listado_precio_id != null) return `lp-${r.listado_precio_id}`
  return `tmp-${Math.random()}`
}

export function isDraftIncomplete(row, draft = {}) {
  if (!row?.listado_precio_id) return true
  const vu = parseNum(draft.vu_costo != null ? draft.vu_costo : row.vu_costo_mo)
  if (vu == null || Number.isNaN(vu) || vu < 0) return true
  const cant = parseNum(draft.cantidad != null ? draft.cantidad : row.cantidad)
  if (cant == null || Number.isNaN(cant) || cant < 0) return true
  return false
}

export function hasInvalidDrafts(rows, drafts = {}) {
  for (const r of rows || []) {
    const key = rowKey(r)
    const d = drafts[key] || {}
    const origen = String(r.origen || 'presupuesto').toLowerCase()
    const vuRaw = d.vu_costo
    if (vuRaw != null && String(vuRaw).trim() !== '') {
      const vu = parseNum(vuRaw)
      if (Number.isNaN(vu) || vu < 0) return true
    }
    if (origen === 'manual' || r._isDraft) {
      const cantRaw = d.cantidad
      if (cantRaw != null && String(cantRaw).trim() !== '') {
        const cant = parseNum(cantRaw)
        if (Number.isNaN(cant) || cant < 0) return true
      }
    }
  }
  return false
}
