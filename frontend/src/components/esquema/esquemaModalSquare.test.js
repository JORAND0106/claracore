import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { squareModalOuterSize } from './esquemaGeometry.js'

describe('esquemaModalSquare — ventana cuadrada', () => {
  it('conserva el menor lado disponible (ancho = alto)', () => {
    assert.deepEqual(squareModalOuterSize(1200, 900), { w: 900, h: 900, side: 900 })
    assert.deepEqual(squareModalOuterSize(800, 1000), { w: 800, h: 800, side: 800 })
  })

  it('no supera el tope y respeta mínimo', () => {
    const s = squareModalOuterSize(2000, 2000)
    assert.equal(s.w, s.h)
    assert.ok(s.side >= 280)
  })
})
