/**
 * Valor de compra de una línea y resumen por proveedor.
 * Cantidad × valor con IVA del proveedor elegido, o de la cotización ganadora.
 */

export function valorCompraLinea(item) {
  const directo = Number(item?.valor_compra_linea)
  if (Number.isFinite(directo) && directo > 0) return directo
  const cant = Number(item?.cantidad)
  const unit = Number(item?.valor_compra_unitario)
  if (Number.isFinite(cant) && cant > 0 && Number.isFinite(unit) && unit > 0) {
    return Math.round(cant * unit)
  }
  return null
}

/** Subtotal por proveedor y total de la solicitud. Solo tiene sentido si hay cifras. */
export function totalesCompraSolicitud(items) {
  const grupos = []
  const index = new Map()
  let total = 0
  for (const it of items || []) {
    const valor = valorCompraLinea(it)
    if (valor == null) continue
    total += valor
    const nombre = it.proveedor_nombre || it.proveedor_catalogo || 'Proveedor'
    const key = it.proveedor_id != null && it.proveedor_id !== '' ? `id:${it.proveedor_id}` : String(nombre)
    if (!index.has(key)) {
      index.set(key, grupos.length)
      grupos.push({ key, nombre, total: 0 })
    }
    grupos[index.get(key)].total += valor
  }
  return { grupos, total, alguna: grupos.length > 0 }
}

/**
 * Reemplaza la línea abierta por el borrador de la revisión.
 * El valor usa la oferta del proveedor elegido (IVA incluido) y se recalcula al cambiarlo.
 */
export function itemsConBorradorProveedor(items, item, draft) {
  const id = item?.id
  const base = Array.isArray(items) && items.some((it) => String(it?.id) === String(id))
    ? items
    : [...(items || []), item].filter(Boolean)
  return base.map((it) => {
    if (id == null || String(it?.id) !== String(id)) return it
    const cantNum = Number(draft?.cantidad)
    const cantidad = Number.isFinite(cantNum) && cantNum > 0 ? cantNum : Number(it?.cantidad)
    const unitOferta = Number(draft?.proveedor?.valor)
    const unitDraft = Number(draft?.valor_compra_unitario)
    const unitGuardado = Number(it?.valor_compra_unitario)
    const unit = Number.isFinite(unitOferta) && unitOferta > 0
      ? unitOferta
      : (Number.isFinite(unitDraft) && unitDraft > 0
        ? unitDraft
        : unitGuardado)
    const nombre = String(draft?.proveedor?.proveedor_nombre || '').trim()
    const pid = draft?.proveedor?.proveedor_id
    const tienePid = pid != null && pid !== ''
    const valor = Number.isFinite(cantidad) && cantidad > 0 && Number.isFinite(unit) && unit > 0
      ? Math.round(cantidad * unit)
      : null
    return {
      ...it,
      cantidad: Number.isFinite(cantidad) ? cantidad : it?.cantidad,
      valor_compra_unitario: Number.isFinite(unit) && unit > 0 ? unit : it?.valor_compra_unitario,
      valor_compra_linea: valor,
      proveedor_id: tienePid ? pid : (nombre ? null : it?.proveedor_id),
      proveedor_nombre: nombre || it?.proveedor_nombre || it?.proveedor_catalogo || 'Proveedor',
    }
  })
}
