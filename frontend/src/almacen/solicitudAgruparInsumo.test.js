/**
 * En el popup de la solicitud, el mismo insumo se suma.
 * El detalle de cada sector queda en la revisión de línea.
 * node --test frontend/src/almacen/solicitudAgruparInsumo.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  agruparLineasMismoInsumo,
  detalleSectorLinea,
  estadoFilaInsumo,
  sectoresMismoInsumo,
} from './solicitudDetalleHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('agrupar líneas del mismo insumo', () => {
  const items = [
    {
      id: 1,
      insumo_id: 9,
      material_descripcion: 'Pantalón drill',
      cantidad: 2,
      valor_compra_unitario: 100,
      unidad: 'UND',
      capitulo: 'Dotación',
      tramo: '1',
      pk_id: 'PK-1',
      estado_validacion: 'aprobado',
    },
    {
      id: 2,
      insumo_id: 8,
      material_descripcion: 'Casco',
      cantidad: 1,
      valor_compra_unitario: 50,
      unidad: 'UND',
      capitulo: 'EPP',
    },
    {
      id: 3,
      insumo_id: 9,
      material_descripcion: 'Pantalón drill',
      cantidad: 3,
      valor_compra_unitario: 80,
      unidad: 'UND',
      capitulo: 'Dotación',
      tramo: '2',
      costado: 'Derecho',
      pk_id: 'PK-2',
      estado_validacion: 'pendiente',
    },
    {
      id: 4,
      cantidad: 4,
      descripcion_solicitada: 'Sin insumo',
    },
  ]

  it('suma cantidad y costo, y no mezcla líneas sin insumo', () => {
    const filas = agruparLineasMismoInsumo(items)
    assert.equal(filas.length, 3)
    assert.deepEqual(filas[0].items.map((it) => it.id), [1, 3])
    assert.equal(filas[0].cantidad, 5)
    assert.equal(filas[0].valor, 440)
    assert.equal(filas[0].unidad, 'UND')
    assert.equal(filas[0].capitulo, 'Dotación')
    assert.equal(filas[1].items.length, 1)
    assert.equal(filas[1].cantidad, 1)
    assert.equal(filas[1].valor, 50)
    assert.equal(filas[2].items[0].id, 4)
    assert.equal(filas[2].valor, null)
  })

  it('si el estado no coincide, la fila queda en varios', () => {
    const filas = agruparLineasMismoInsumo(items)
    assert.equal(estadoFilaInsumo(filas[0].items, { estado: 'enviada' }), 'varios')
    assert.equal(estadoFilaInsumo(filas[1].items, { estado: 'enviada' }), 'pendiente')
  })

  it('la revisión recupera cada sector del mismo insumo', () => {
    const sectores = sectoresMismoInsumo(items, items[0])
    assert.deepEqual(sectores.map((it) => it.id), [1, 3])
    assert.equal(detalleSectorLinea(sectores[0]).pk, 'PK-1')
    assert.equal(detalleSectorLinea(sectores[1]).lugar, '2 · Derecho')
    assert.equal(sectoresMismoInsumo(items, items[3]).length, 1)
  })

  it('la grilla muestra cantidad junto al valor y la revisión lista los sectores', () => {
    const tabla = readFileSync(join(dir, 'SolicitudMaterialesExcelTable.jsx'), 'utf8')
    const revision = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(tabla, /agruparLineasMismoInsumo/)
    assert.match(tabla, /textoCantidadJuntoValor/)
    assert.match(tabla, /linea-cant-valor/)
    assert.match(tabla, /CANT\. \/ VALOR/)
    assert.match(revision, /revision-sectores/)
    assert.match(revision, /Dónde se pidió/)
    assert.match(revision, /onSeleccionarSector/)
    assert.match(detalle, /onSeleccionarSector/)
  })
})
