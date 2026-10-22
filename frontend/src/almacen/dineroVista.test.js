import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fmtDinero, truncarDinero, unitarioSeVeEnCero } from './dineroVista.js'
import { valorCompraLinea, totalesCompraSolicitud } from './solicitudValorCompra.js'

describe('dinero visible', () => {
  it('corta el decimal y no redondea', () => {
    assert.equal(truncarDinero(42979871.06), 42979871)
    assert.equal(truncarDinero(100.6), 100)
    assert.equal(truncarDinero(100.99), 100)
    assert.equal(fmtDinero(100.6).replace(/\s/g, ''), '$100')
    assert.equal(fmtDinero(42979871.06).replace(/\s/g, ''), '$42.979.871')
  })

  it('un unitario menor que un peso se vería como cero', () => {
    assert.equal(unitarioSeVeEnCero(0.4), true)
    assert.equal(unitarioSeVeEnCero(100.6), false)
    assert.equal(fmtDinero(0.4).replace(/\s/g, ''), '$0')
  })

  it('la línea y el total usan el producto exacto', () => {
    const lineas = [
      { cantidad: 1.5, valor_compra_unitario: 10.01 },
      { cantidad: 2, valor_compra_unitario: 119 },
    ]
    assert.equal(valorCompraLinea(lineas[0]), 1.5 * 10.01)
    assert.equal(totalesCompraSolicitud(lineas).total, (1.5 * 10.01) + (2 * 119))
  })
})
