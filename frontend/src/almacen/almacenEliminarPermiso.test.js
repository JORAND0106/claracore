/**
 * El botón de eliminar depende del permiso Eliminar, no de Editar ni Validar.
 * node --test frontend/src/almacen/almacenEliminarPermiso.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(dir, name), 'utf8')

function puedeAnularSolicitud(s, permisos) {
  const src = read('almacenShared.jsx')
  const start = src.indexOf('export function puedeAnularSolicitud')
  const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('\n}', start))
  return new Function('s', 'permisos', body)(s, permisos)
}

describe('eliminar solo con permiso Eliminar', () => {
  it('entradas, salidas y devoluciones no usan Editar para mostrar el botón', () => {
    for (const file of ['EntradasPanel.jsx', 'SalidasPanel.jsx', 'DevolucionesListModal.jsx']) {
      const src = read(file)
      assert.match(src, /const puedeEliminar = Boolean\(permisos\?\.eliminar\)/)
      assert.doesNotMatch(src, /puedeEliminar = Boolean\(permisos\?\.editar\)/)
      assert.match(src, /CcConfirmModal/)
    }
  })

  it('la solicitud y sus líneas tienen confirmación y un registro a la vez', () => {
    const panel = read('SolicitudesPanel.jsx')
    const detalle = read('SolicitudDetalleModal.jsx')
    const form = read('SolicitudForm.jsx')
    const tabla = read('SolicitudFormExcelTable.jsx')
    assert.match(panel, /const puedeEliminar = Boolean\(permisos\?\.eliminar\)/)
    assert.match(panel, /data-testid="eliminar-solicitud"/)
    assert.match(panel, /eliminarSolicitud\(/)
    assert.doesNotMatch(panel, /eliminarSolicitudDesarrollador/)
    assert.match(detalle, /puedeEliminar=\{Boolean\(permisos\?\.eliminar\)\}/)
    assert.match(detalle, /Se elimina una línea a la vez/)
    assert.match(detalle, /verEconomicos && eliminarLinea\.valor_compra_unitario/)
    assert.match(form, /puedeEliminarLinea=\{Boolean\(permisos\?\.eliminar\)\}/)
    assert.match(tabla, /data-testid="eliminar-fila-solicitud"/)
    assert.match(form, /incluida en una orden de compra/)
  })

  it('anular una enviada no elimina un borrador', () => {
    const borrador = { id: 1, estado: 'borrador', created_by: 4 }
    const enviada = { id: 2, estado: 'enviada', created_by: 4 }
    const perms = { userId: 4, crear: true, editar: true, validar: true, eliminar: false }
    assert.equal(puedeAnularSolicitud(borrador, perms), false)
    assert.equal(puedeAnularSolicitud(enviada, perms), true)
    assert.equal(puedeAnularSolicitud(enviada, { userId: 9, eliminar: true }), false)
  })
})

describe('catálogo: cifras solo con visibilidad económica', () => {
  it('el popup de la cotización muestra el valor solo si el rol puede verlo', () => {
    const src = readFileSync(join(dir, '../admin/SeccionCatalogoInsumos.jsx'), 'utf8')
    assert.match(src, /verEconomicos && bajaCotizacion/)
    assert.match(src, /data-testid="cotizacion-eliminar"/)
    assert.match(src, /data-testid="cotizacion-quitar-pdf"/)
    assert.match(src, /canEliminar/)
    assert.match(src, /const canEliminar = permsEfectivos\?\.eliminar/)
  })
})
