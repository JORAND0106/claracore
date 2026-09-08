import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EXPORT_MARGIN, EXPORT_TITLE_H, sceneExportBounds } from './esquemaExport.js'

describe('esquemaExport · rotulado', () => {
  it('expone márgenes y banda de título del PNG rotulado', () => {
    assert.equal(EXPORT_MARGIN, 48)
    assert.equal(EXPORT_TITLE_H, 56)
  })

  it('ignora la imagen de fondo fit al calcular bounds', () => {
    const bb = sceneExportBounds([
      { type: 'image', fit: true, x: 0, y: 0, w: 2000, h: 2000 },
      { type: 'rect', x1: 10, y1: 20, x2: 110, y2: 80 },
    ])
    assert.equal(bb.x, 10)
    assert.equal(bb.y, 20)
    assert.equal(bb.w, 100)
    assert.equal(bb.h, 60)
  })

  it('usa lienzo por defecto si no hay entidades dibujadas', () => {
    const bb = sceneExportBounds([])
    assert.equal(bb.w, 400)
    assert.equal(bb.h, 280)
  })
})
