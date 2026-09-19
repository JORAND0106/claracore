import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPORT_MARGIN,
  EXPORT_MARGIN_CONTOUR_COLOR,
  EXPORT_MARGIN_CONTOUR_WIDTH,
  EXPORT_TITLE_H,
  drawExportMarginContour,
  sceneExportBounds,
} from './esquemaExport.js'

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

describe('esquemaExport · contorno del margen', () => {
  it('expone estilo de contorno del área imprimible', () => {
    assert.equal(EXPORT_MARGIN_CONTOUR_WIDTH, 2)
    assert.ok(EXPORT_MARGIN_CONTOUR_COLOR.startsWith('#'))
  })

  it('dibuja strokeRect inset dentro del área de margen', () => {
    const calls = []
    const ctx = {
      save() { calls.push('save') },
      restore() { calls.push('restore') },
      setLineDash(v) { calls.push(['dash', v]) },
      strokeRect(x, y, w, h) { calls.push(['stroke', x, y, w, h]) },
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: '',
      lineCap: '',
    }
    drawExportMarginContour(ctx, { x: 10, y: 20, w: 200, h: 100 })
    assert.equal(ctx.strokeStyle, EXPORT_MARGIN_CONTOUR_COLOR)
    assert.equal(ctx.lineWidth, EXPORT_MARGIN_CONTOUR_WIDTH)
    const stroke = calls.find((c) => Array.isArray(c) && c[0] === 'stroke')
    assert.ok(stroke)
    const hw = EXPORT_MARGIN_CONTOUR_WIDTH / 2
    assert.equal(stroke[1], 10 + hw)
    assert.equal(stroke[2], 20 + hw)
    assert.equal(stroke[3], 200 - EXPORT_MARGIN_CONTOUR_WIDTH)
    assert.equal(stroke[4], 100 - EXPORT_MARGIN_CONTOUR_WIDTH)
    assert.ok(calls.includes('save'))
    assert.ok(calls.includes('restore'))
  })

  it('no dibuja si el rectángulo es inválido', () => {
    let stroked = false
    const ctx = {
      save() {},
      restore() {},
      setLineDash() {},
      strokeRect() { stroked = true },
    }
    drawExportMarginContour(ctx, { x: 0, y: 0, w: 2, h: 100 })
    drawExportMarginContour(ctx, null)
    assert.equal(stroked, false)
  })
})
