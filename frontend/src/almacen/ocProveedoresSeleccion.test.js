/**
 * Selección de proveedores antes de generar la OC.
 * node --test frontend/src/almacen/ocProveedoresSeleccion.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  estadoProveedoresSolicitud,
  gruposProveedorPendientes,
  itemIdsDeGrupos,
  totalProveedoresSeleccionados,
} from './ocProveedoresSeleccion.js'

const dir = dirname(fileURLToPath(import.meta.url))

const items = [
  {
    id: 1,
    insumo_id: 10,
    insumo_codigo: 'A-1',
    material_descripcion: 'Arena',
    proveedor_id: 7,
    proveedor_nombre: 'Canteras',
    cantidad: 2,
    valor_compra_unitario: 1000,
    estado_validacion: 'pendiente',
  },
  {
    id: 2,
    insumo_id: 11,
    insumo_codigo: 'C-1',
    material_descripcion: 'Cemento',
    proveedor_id: 8,
    proveedor_nombre: 'Aceros',
    cantidad: 1,
    valor_compra_unitario: 500,
    estado_validacion: 'pendiente',
  },
  {
    id: 3,
    insumo_id: 12,
    material_descripcion: 'Varilla',
    proveedor_id: 8,
    proveedor_nombre: 'Aceros',
    cantidad: 1,
    valor_compra_unitario: 200,
    en_orden_compra: true,
    estado_validacion: 'aprobado',
  },
]

describe('selección de proveedores para la OC', () => {
  it('lista solo proveedores pendientes, con líneas y total con IVA', () => {
    const { grupos } = gruposProveedorPendientes(items)
    assert.deepEqual(grupos.map((g) => g.nombre), ['Canteras', 'Aceros'])
    assert.equal(grupos[0].lineas.length, 1)
    assert.equal(grupos[0].lineas[0].insumo, 'A-1 — Arena')
    assert.equal(grupos[0].total, 2000)
    assert.equal(grupos[1].lineas.length, 1)
    assert.equal(totalProveedoresSeleccionados(grupos, ['id:7']), 2000)
    assert.deepEqual(itemIdsDeGrupos(grupos, ['id:8']), [2])
  })

  it('distingue quién ya tiene OC y quién sigue pendiente', () => {
    const estado = estadoProveedoresSolicitud(items)
    const aceros = estado.find((p) => p.nombre === 'Aceros')
    const canteras = estado.find((p) => p.nombre === 'Canteras')
    assert.equal(canteras.estado, 'pendiente')
    assert.equal(aceros.estado, 'parcial')
  })

  it('el detalle abre el popup antes de generar y el PDF es el de todas las OC', () => {
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(detalle, /OcProveedoresModal/)
    assert.match(detalle, /data-testid="detalle-generar-oc"/)
    assert.match(detalle, /SolicitudOcsPdfButton/)
    assert.match(detalle, /oc-proveedores-estado/)
    const modal = readFileSync(join(dir, 'OcProveedoresModal.jsx'), 'utf8')
    assert.match(modal, /data-testid="oc-proveedores"/)
    assert.match(modal, /data-testid="oc-proveedores-confirmar"/)
    assert.match(modal, /marcados.length === 0/)
    assert.match(modal, /verEconomicos/)
    const pdf = readFileSync(join(dir, 'SolicitudOcsPdfButton.jsx'), 'utf8')
    assert.match(pdf, /openSolicitudOcsPdf/)
  })
})
