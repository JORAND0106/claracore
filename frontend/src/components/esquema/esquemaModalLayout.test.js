import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESQUEMA_CONTEXT_SIDEBAR_W,
  squareModalOuterSize,
} from './esquemaGeometry.js'

describe('esquemaModalOuterSize — ventana más ancha con lateral', () => {
  it('conserva la altura del área de dibujo y suma el ancho del panel', () => {
    const s = squareModalOuterSize(1400, 900, ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(s.h, s.side)
    assert.equal(s.w, s.side + ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(s.sidebar, ESQUEMA_CONTEXT_SIDEBAR_W)
    // El área de dibujo (side) no se reduce respecto al alto disponible
    assert.equal(s.side, 900)
  })

  it('si el viewport es estrecho, ajusta el lado para que quepa el lateral', () => {
    const s = squareModalOuterSize(1000, 900, 300)
    assert.equal(s.w, s.side + 300)
    assert.ok(s.w <= 1000)
    assert.equal(s.h, s.side)
    assert.equal(s.side, 700) // 1000 - 300
  })

  it('sin lateral (huella) sigue siendo cuadrada', () => {
    const s = squareModalOuterSize(1200, 900, 0)
    assert.deepEqual(s, { w: 900, h: 900, side: 900, sidebar: 0 })
  })

  it('respeta mínimo de lado', () => {
    const s = squareModalOuterSize(200, 200, 300)
    assert.ok(s.side >= 280)
  })
})
