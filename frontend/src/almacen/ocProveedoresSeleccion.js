/**
 * Proveedores que pueden entrar en una OC y los que ya tienen orden.
 * El total usa el valor con IVA de la línea (cantidad × valor unitario de compra).
 */
import { valorCompraLinea } from './solicitudValorCompra.js'

function nombreProveedor(it) {
  if (it?.es_recurrente) return 'Compra recurrente'
  return it?.proveedor_nombre || it?.proveedor_catalogo || 'Proveedor'
}

function claveProveedor(it) {
  if (it?.es_recurrente) return 'recurrente'
  const pid = it?.proveedor_id
  if (pid != null && pid !== '') return `id:${pid}`
  return `nombre:${nombreProveedor(it).trim().toLowerCase()}`
}

function textoInsumo(it) {
  const codigo = String(it?.insumo_codigo || '').trim()
  const desc = String(
    it?.material_descripcion || it?.descripcion_solicitada || it?.descripcion || '',
  ).trim() || 'Sin descripción'
  return codigo ? `${codigo} — ${desc}` : desc
}

function sinInsumo(it) {
  return Boolean(it?.sin_insumo) || (!it?.insumo_id && !it?.es_recurrente)
}

/**
 * Agrupa las líneas que todavía pueden generar OC.
 * Las que ya están en una orden, las rechazadas y las sin insumo quedan fuera.
 */
export function gruposProveedorPendientes(items) {
  const grupos = []
  const index = new Map()
  let sinInsumoCount = 0
  for (const it of items || []) {
    if ((it?.estado_validacion || 'pendiente') === 'rechazado') continue
    if (it?.en_orden_compra) continue
    if (sinInsumo(it)) {
      sinInsumoCount += 1
      continue
    }
    const key = claveProveedor(it)
    if (!index.has(key)) {
      index.set(key, grupos.length)
      grupos.push({
        key,
        nombre: nombreProveedor(it),
        lineas: [],
        total: 0,
      })
    }
    const valor = valorCompraLinea(it)
    const grupo = grupos[index.get(key)]
    grupo.lineas.push({
      id: it.id,
      insumo: textoInsumo(it),
      cantidad: it.cantidad,
      unidad: it.unidad || '',
      valorUnitario: it.valor_compra_unitario,
      valorLinea: valor,
    })
    if (valor != null) grupo.total += valor
  }
  return { grupos, sinInsumoCount }
}

/** Una fila por proveedor: ya tiene OC, o todavía está pendiente. */
export function estadoProveedoresSolicitud(items) {
  const map = new Map()
  for (const it of items || []) {
    if ((it?.estado_validacion || 'pendiente') === 'rechazado') continue
    if (sinInsumo(it)) continue
    const key = claveProveedor(it)
    if (!map.has(key)) {
      map.set(key, { key, nombre: nombreProveedor(it), enOc: 0, fuera: 0 })
    }
    const row = map.get(key)
    if (it?.en_orden_compra) row.enOc += 1
    else row.fuera += 1
  }
  return [...map.values()].map((row) => ({
    ...row,
    estado: row.fuera === 0 ? 'con_oc' : (row.enOc === 0 ? 'pendiente' : 'parcial'),
  }))
}

export function totalProveedoresSeleccionados(grupos, claves) {
  const on = new Set(claves || [])
  return (grupos || []).reduce((sum, g) => (on.has(g.key) ? sum + (g.total || 0) : sum), 0)
}

export function itemIdsDeGrupos(grupos, claves) {
  const on = new Set(claves || [])
  const ids = []
  for (const g of grupos || []) {
    if (!on.has(g.key)) continue
    for (const linea of g.lineas) {
      if (linea?.id != null) ids.push(linea.id)
    }
  }
  return ids
}
