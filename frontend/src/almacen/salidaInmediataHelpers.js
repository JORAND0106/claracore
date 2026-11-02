/**
 * Prefill del popup «Salió material» cuando la entrada pide salida inmediata.
 * La salida real (y el descuento de stock) solo ocurre al confirmar el popup.
 */

export function buildPrefillSalidaInmediata(entrada, extras = {}) {
  if (!entrada?.id) return null
  const itemsRaw = Array.isArray(entrada.items) ? entrada.items : []
  const items = itemsRaw
    .filter((it) => it?.id != null && Number(it.cantidad_recibida) > 0)
    .map((it) => ({
      entrada_item_id: Number(it.id),
      cantidad_salida: Number(it.cantidad_recibida),
      material_descripcion: it.material_descripcion
        || it.almacen_orden_compra_item?.material_descripcion
        || entrada.insumo_label
        || 'Material',
      unidad: it.unidad || it.almacen_orden_compra_item?.unidad || entrada.insumo_unidad || '',
    }))
  if (!items.length) return null

  const receptorId = entrada.created_by != null ? Number(entrada.created_by) : null
  const receptorLabel = (entrada.usuario_nombre || '').trim()

  return {
    entradaId: Number(entrada.id),
    codigoEntrada: entrada.codigo || entrada.numero_entrada || null,
    items,
    pkId: extras.pkId || entrada.pk_id || '',
    pkLabel: extras.pkLabel || entrada.pk_id || '',
    tramo: extras.tramo || entrada.tramo || '',
    costado: extras.costado || entrada.costado || '',
    receptor: receptorId
      ? { id: receptorId, label: receptorLabel || `Usuario #${receptorId}` }
      : null,
  }
}

/** Consolida líneas del prefill para mostrar en el resumen (misma presentación que el recibo). */
export function consolidarPrefillInsumos(items) {
  const map = new Map()
  for (const it of items || []) {
    const key = `${String(it.material_descripcion || '').trim().toLowerCase()}|${String(it.unidad || '').trim().toLowerCase()}`
    const prev = map.get(key)
    if (prev) {
      prev.cantidad_salida += Number(it.cantidad_salida) || 0
      continue
    }
    map.set(key, {
      key,
      material_descripcion: it.material_descripcion || 'Material',
      unidad: it.unidad || '',
      cantidad_salida: Number(it.cantidad_salida) || 0,
    })
  }
  return [...map.values()]
}
