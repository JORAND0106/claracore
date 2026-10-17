import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { squareDrawingAreaSize } from './esquemaGeometry.js'

describe('esquemaDrawingArea — lienzo cuadrado', () => {
  it('conserva el ancho y fija alto = ancho', () => {
    assert.deepEqual(squareDrawingAreaSize(900), { w: 900, h: 900 })
    assert.deepEqual(squareDrawingAreaSize(1200), { w: 1200, h: 1200 })
  })

  it('sigue cuadrado al cambiar el ancho (resize / giro)', () => {
    for (const w of [390, 768, 844, 1024, 1440, 1600]) {
      const size = squareDrawingAreaSize(w)
      assert.equal(size.w, size.h)
      assert.equal(size.w, Math.max(480, w))
    }
  })

  it('no deforma: el tamaño CSS del lienzo no altera coordenadas world', () => {
    // Contrato: pan/zoom y metersToWorld son independientes del tamaño CSS.
    // Solo cambia el viewport; un cuadrado mayor muestra más mundo, sin escalar entidades.
    const a = squareDrawingAreaSize(800)
    const b = squareDrawingAreaSize(1200)
    assert.equal(a.h / a.w, 1)
    assert.equal(b.h / b.w, 1)
    assert.notEqual(a.w, b.w)
  })
})
