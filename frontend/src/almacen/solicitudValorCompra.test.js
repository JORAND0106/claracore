/**
 * Valor de la línea y resumen por proveedor en la revisión.
 * node --test frontend/src/almacen/solicitudValorCompra.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  itemsConBorradorProveedor,
  totalesCompraSolicitud,
  valorCompraLinea,
} from './solicitudValorCompra.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('valor de la línea y resumen por proveedor', () => {
  const items = [
    {
      id: 1,
      cantidad: 2,
      valor_compra_unitario: 119,
      valor_compra_linea: 238,
      proveedor_id: 4,
      proveedor_nombre: 'Ferretería Norte',
    },
    {
      id: 2,
      cantidad: 3,
      valor_compra_unitario: 50,
      valor_compra_linea: 150,
      proveedor_id: 4,
      proveedor_nombre: 'Ferretería Norte',
    },
  ]

  it('usa la oferta del proveedor elegido y recalcula al cambiarlo', () => {
    const actual = itemsConBorradorProveedor(items, items[0], {
      cantidad: '2',
      valor_compra_unitario: '119',
      proveedor: { proveedor_id: 5, proveedor_nombre: 'Aceros del Sur', valor: 95 },
    })
    assert.equal(valorCompraLinea(actual[0]), 190)
    assert.equal(actual[0].proveedor_nombre, 'Aceros del Sur')
    const tot = totalesCompraSolicitud(actual)
    assert.equal(tot.grupos.length, 2)
    const aceros = tot.grupos.find((g) => g.nombre === 'Aceros del Sur')
    const ferre = tot.grupos.find((g) => g.nombre === 'Ferretería Norte')
    assert.equal(aceros.total, 190)
    assert.equal(ferre.total, 150)
    assert.equal(tot.total, 340)
  })

  it('sin proveedor elegido conserva la cotización ya resuelta', () => {
    const actual = itemsConBorradorProveedor(items, items[0], {
      cantidad: '2',
      valor_compra_unitario: '119',
      proveedor: null,
    })
    assert.equal(valorCompraLinea(actual[0]), 238)
    assert.equal(totalesCompraSolicitud(actual).total, 388)
  })

  it('la revisión y el listado muestran las cifras solo con visibilidad económica', () => {
    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(modal, /revision-linea-valor/)
    assert.match(modal, /revision-linea-resumen-proveedor/)
    assert.match(modal, /itemsConBorradorProveedor/)
    assert.match(modal, /if \(!verEconomicos\) return null/)
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(panel, /permisos\?\.verEconomicos === true/)
    assert.match(panel, /solicitud-lista-valor/)
    assert.match(panel, /valor_solicitud/)
  })
})
