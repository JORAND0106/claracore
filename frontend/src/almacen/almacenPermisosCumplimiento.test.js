/**
 * Cumplimiento de permisos Almacén tras auditoría.
 * node --test frontend/src/almacen/almacenPermisosCumplimiento.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(dir, name), 'utf8')

describe('alta de movimientos solo con Crear', () => {
  it('helpers de registrar entrada/salida ya no usan Editar', () => {
    const src = read('almacenPermisos.js')
    const entrada = src.slice(
      src.indexOf('export function puedeRegistrarEntradaAlmacen'),
      src.indexOf('export function puedeRegistrarSalidaAlmacen'),
    )
    const salida = src.slice(
      src.indexOf('export function puedeRegistrarSalidaAlmacen'),
      src.indexOf('export function puedeEditarCantidadSalidaAlmacen'),
    )
    assert.match(entrada, /return Boolean\(permisos\?\.crear\)/)
    assert.doesNotMatch(entrada, /permisos\?\.editar/)
    assert.match(salida, /return Boolean\(permisos\?\.crear\)/)
    assert.doesNotMatch(salida, /permisos\?\.editar/)
  })

  it('PDF de movimiento exige Exportar o Crear', () => {
    const src = read('almacenPermisos.js')
    const body = src.slice(
      src.indexOf('export function puedeDescargarPdfMovimientoAlmacen'),
      src.indexOf('export function puedeEditarCantidadSalidaAlmacen') > src.indexOf('export function puedeDescargarPdfMovimientoAlmacen')
        ? src.indexOf('/**\n * Editar cantidad')
        : src.length,
    )
    // Fallback: take until next export after the helper
    const start = src.indexOf('export function puedeDescargarPdfMovimientoAlmacen')
    const next = src.indexOf('\nexport function', start + 1)
    const fn = src.slice(start, next === -1 ? undefined : next)
    assert.match(fn, /permisos\?\.exportar \|\| permisos\?\.crear/)
  })
})

describe('código alinea anular y plantillas con Eliminar/Exportar', () => {
  it('puedeAnularSolicitud usa solo eliminar', () => {
    const src = read('almacenShared.jsx')
    const start = src.indexOf('export function puedeAnularSolicitud')
    const body = src.slice(start, src.indexOf('\n}', start) + 2)
    assert.match(body, /permisos\?\.eliminar/)
    assert.doesNotMatch(body, /permisos\?\.crear/)
    assert.doesNotMatch(body, /permisos\?\.editar/)
  })

  it('catálogo separa plantillas CSV (Exportar) de Crear/importar', () => {
    const src = readFileSync(join(dir, '../admin/SeccionCatalogoInsumos.jsx'), 'utf8')
    assert.match(src, /const canExportar = permsEfectivos\?\.exportar/)
    assert.match(src, /canExportar && \(/)
    assert.match(src, /Plantilla insumos/)
  })

  it('inventario expone Excel solo con Exportar', () => {
    const src = read('InventarioPanel.jsx')
    assert.match(src, /data-testid="inventario-exportar-excel"/)
    assert.match(src, /permisos\?\.exportar/)
  })
})
