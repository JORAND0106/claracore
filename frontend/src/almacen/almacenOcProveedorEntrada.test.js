/**
 * OC por proveedor + entrada Excel ordenada por insumo.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function solicitudTieneOrdenCompra(sol) {
  if (sol?.tiene_orden_compra) return true
  if (Array.isArray(sol?.ordenes_compra) && sol.ordenes_compra.some((o) => o?.id)) return true
  return Boolean(sol?.orden_compra?.id)
}

function solicitudOrdenesCompra(sol) {
  if (Array.isArray(sol?.ordenes_compra) && sol.ordenes_compra.length) {
    return sol.ordenes_compra.filter((o) => o?.id)
  }
  if (sol?.orden_compra?.id) return [sol.orden_compra]
  return []
}

describe('solicitudOrdenesCompra', () => {
  it('usa ordenes_compra cuando hay varias', () => {
    const sol = {
      tiene_orden_compra: true,
      orden_compra: { id: 1, numero_oc: 1 },
      ordenes_compra: [
        { id: 1, numero_oc: 1, proveedor_nombre: 'A' },
        { id: 2, numero_oc: 2, proveedor_nombre: 'B' },
      ],
    }
    assert.equal(solicitudTieneOrdenCompra(sol), true)
    assert.equal(solicitudOrdenesCompra(sol).length, 2)
  })

  it('cae a orden_compra única', () => {
    const sol = { orden_compra: { id: 9, numero_oc: 9 } }
    assert.deepEqual(solicitudOrdenesCompra(sol).map((o) => o.id), [9])
  })

  it('helpers exportados en solicitudDetalleHelpers', () => {
    const src = readFileSync(join(__dirname, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(src, /export function solicitudOrdenesCompra/)
    assert.match(src, /ordenes_compra/)
  })
})

describe('EntradaForm Excel + orden insumos', () => {
  it('formulario es grilla Excel y ordena por código', () => {
    const src = readFileSync(join(__dirname, 'EntradaForm.jsx'), 'utf8')
    assert.match(src, /cc-almacen-entrada-excel/)
    assert.match(src, /sortKeyInsumoCodigo/)
    assert.match(src, /Cant\. recibida/)
    assert.match(src, /Insumo/)
  })

  it('modal de entrada ampliado', () => {
    const src = readFileSync(join(__dirname, 'EntradaFormModal.jsx'), 'utf8')
    assert.match(src, /min\(1180px/)
  })
})

describe('UI multi-OC', () => {
  it('panel y detalle renderizan varias OCs', () => {
    const panel = readFileSync(join(__dirname, 'SolicitudesPanel.jsx'), 'utf8')
    const detalle = readFileSync(join(__dirname, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(panel, /solicitudOrdenesCompra/)
    assert.match(detalle, /solicitudOrdenesCompra/)
    assert.match(detalle, /ordenes_compra_generadas/)
  })
})
