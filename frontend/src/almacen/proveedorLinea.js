const NOMBRES_SIN_PROVEEDOR = new Set([
  'proveedor',
  'proveedor catálogo',
  'proveedor catalogo',
  'sin proveedor',
  'sin proveedor seleccionado',
  'sin proveedor asignado',
  'varios proveedores',
])

function nombreProveedorUtil(nombre) {
  const texto = String(nombre || '').trim()
  return Boolean(texto) && !NOMBRES_SIN_PROVEEDOR.has(texto.toLowerCase())
}

/** Proveedor escrito en la línea. No usa el del catálogo del insumo. */
export function nombreProveedorGuardado(item) {
  const nombre = String(item?.proveedor_nombre || item?.proveedor_seleccionado_nombre || '').trim()
  const pid = item?.proveedor_id ?? item?.proveedor_seleccionado_id
  const tieneId = pid != null && pid !== ''
  if (nombreProveedorUtil(nombre)) return nombre
  if (tieneId) return nombre || 'Sin proveedor'
  if (item?.es_recurrente) return 'Compra recurrente'
  return 'Sin proveedor'
}
