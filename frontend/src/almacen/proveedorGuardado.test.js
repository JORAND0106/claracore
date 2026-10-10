import assert from 'node:assert/strict'
import test from 'node:test'

import { gruposProveedorPendientes } from './ocProveedoresSeleccion.js'
import { etiquetaProveedorLinea, resumenProveedoresSolicitud } from './solicitudDetalleHelpers.js'
import { totalesCompraSolicitud } from './solicitudValorCompra.js'

test('Prov, valor y OC leen el proveedor guardado en la línea', () => {
  const pepito = {
    id: 1,
    insumo_id: 10,
    proveedor_id: 1,
    proveedor_seleccionado_id: 1,
    proveedor_nombre: 'Pepito Pérez',
    proveedor_catalogo: 'Catálogo que no manda',
    cantidad: 2,
    valor_compra_unitario: 10,
    estado_validacion: 'aprobado',
  }
  const otroInsumo = {
    ...pepito,
    id: 2,
    insumo_id: 11,
    proveedor_catalogo: 'Otro catálogo',
  }
  const sinGuardar = {
    id: 3,
    insumo_id: 12,
    proveedor_catalogo: 'Catálogo que no manda',
    cantidad: 1,
    valor_compra_unitario: 5,
    estado_validacion: 'pendiente',
  }

  assert.equal(etiquetaProveedorLinea(pepito), 'Pepito Pérez')
  assert.equal(etiquetaProveedorLinea(sinGuardar), 'Sin proveedor')
  assert.equal(etiquetaProveedorLinea({ sin_insumo: true, proveedor_catalogo: 'X' }), 'Sin insumo asignado')
  assert.equal(etiquetaProveedorLinea({ es_recurrente: true }), 'Compra recurrente')
  assert.equal(
    etiquetaProveedorLinea({
      es_recurrente: true,
      proveedor_seleccionado_nombre: 'Pepito Pérez',
      proveedor_seleccionado_id: 1,
    }),
    'Pepito Pérez',
  )

  const resumen = resumenProveedoresSolicitud([pepito, otroInsumo, sinGuardar, { sin_insumo: true }])
  assert.deepEqual(resumen.proveedores, ['Pepito Pérez', 'Sin proveedor'])
  assert.equal(resumen.lineas_sin_insumo, 1)

  const oc = gruposProveedorPendientes([pepito, otroInsumo, sinGuardar])
  assert.equal(oc.grupos.length, 2)
  assert.equal(oc.grupos[0].nombre, 'Pepito Pérez')
  assert.equal(oc.grupos[0].lineas.length, 2)
  assert.equal(oc.grupos[1].nombre, 'Sin proveedor')

  const tot = totalesCompraSolicitud([pepito, otroInsumo, sinGuardar])
  assert.equal(tot.grupos[0].nombre, 'Pepito Pérez')
  assert.equal(tot.grupos[0].total, 40)
  assert.equal(tot.grupos.find((g) => g.nombre === 'Sin proveedor').total, 5)
})
