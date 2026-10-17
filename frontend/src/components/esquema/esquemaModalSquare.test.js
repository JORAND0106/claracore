import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { squareModalOuterSize } from './esquemaGeometry.js'

describe('esquemaModalSquare — ventana con área de dibujo cuadrada', () => {
  it('sin lateral: conserva el menor lado disponible (ancho = alto)', () => {
    assert.deepEqual(squareModalOuterSize(1200, 900, 0), { w: 900, h: 900, side: 900, sidebar: 0 })
    assert.deepEqual(squareModalOuterSize(800, 1000, 0), { w: 800, h: 800, side: 800, sidebar: 0 })
  })

  it('con lateral por defecto: ancho = lado + panel, alto = lado', () => {
    const s = squareModalOuterSize(1600, 900)
    assert.equal(s.h, s.side)
    assert.equal(s.w, s.side + s.sidebar)
    assert.ok(s.sidebar > 0)
  })

  it('no supera el tope y respeta mínimo', () => {
    const s = squareModalOuterSize(2000, 2000, 0)
    assert.equal(s.w, s.h)
    assert.ok(s.side >= 280)
  })
})
