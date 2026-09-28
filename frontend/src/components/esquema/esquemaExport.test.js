import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPORT_MARGIN,
  EXPORT_MARGIN_CONTOUR_COLOR,
  EXPORT_MARGIN_CONTOUR_WIDTH,
  EXPORT_MAX_INNER,
  EXPORT_MIN_WIDTH,
  EXPORT_MIN_WIDTH_WITH_TABLE,
  EXPORT_SCALE_CAP,
  EXPORT_TITLE_H,
  drawExportMarginContour,
  EXPORT_TABLE_MIN_HEIGHT_FRAC,
  computeEsquemaExportSize,
  exportCoordTableBlockHeight,
  exportCoordTableMetrics,
  sceneExportBounds,
} from './esquemaExport.js'

describe('esquemaExport · rotulado', () => {
  it('expone márgenes y banda de título del PNG rotulado', () => {
    assert.equal(EXPORT_MARGIN, 48)
    assert.equal(EXPORT_TITLE_H, 56)
  })

  it('exporta a resolución mayor que el histórico (1100 / 2.2)', () => {
    assert.ok(EXPORT_MAX_INNER >= 2000)
    assert.ok(EXPORT_SCALE_CAP >= 3)
    assert.ok(EXPORT_MIN_WIDTH >= 1400)
  })

  it('tipografía de tabla es ≥ 35 % mayor que 11/12 px históricos', () => {
    const m = exportCoordTableMetrics(1100)
    assert.ok(m.scale >= 1.35)
    assert.ok(m.headerFontPx >= 14)
    assert.ok(m.bodyFontPx >= 15)
    assert.ok(m.rowH >= 30)
    assert.ok(m.headerH >= 32)
  })

  it('a mayor ancho de export, crece el texto de la tabla (con tope)', () => {
    const narrow = exportCoordTableMetrics(1100)
    const wide = exportCoordTableMetrics(2200)
    assert.ok(wide.bodyFontPx >= narrow.bodyFontPx)
    assert.ok(wide.scale <= 1.9)
  })

  it('bloque de tabla incluye todas las filas sin colapsar', () => {
    const h0 = exportCoordTableBlockHeight(0, 1400)
    const h5 = exportCoordTableBlockHeight(5, 1400)
    const m = exportCoordTableMetrics(1400 - EXPORT_MARGIN * 2)
    assert.equal(h0, EXPORT_MARGIN)
    assert.ok(h5 > h0)
    assert.ok(h5 >= m.headerH + 5 * m.rowH + m.tableGap)
  })

  it('PNG con nodos: resolución alta, tabla legible en contenedor de memoria', () => {
    const size = computeEsquemaExportSize({
      objects: [
        { type: 'linea', x1: 0, y1: 0, x2: 200, y2: 100 },
        { type: 'nodo', x: 0, y: 0, nodeNum: 1, norte: 1, este: 2, cota: 3 },
      ],
      nodes: [
        { nodeNum: 1, norte: 1045234.12, este: 987654.32, cota: 2560.5, desc: 'Punto A' },
        { nodeNum: 2, norte: 1045240.0, este: 987660.0, cota: 2561.0, desc: 'Punto B' },
      ],
    })
    assert.ok(size.w >= EXPORT_MIN_WIDTH_WITH_TABLE)
    assert.ok(size.tableMetrics.bodyFontPx >= 15)
    assert.ok(size.tableBlock > EXPORT_MARGIN)
    const below = size.drawH + size.tableBlock
    const frac = size.tableBlock / below
    assert.ok(
      frac + 1e-3 >= EXPORT_TABLE_MIN_HEIGHT_FRAC,
      `tabla frac=${frac} < mínimo ${EXPORT_TABLE_MIN_HEIGHT_FRAC}`,
    )
    // Contenedor memoria ~380×240 (object-fit:contain)
    const fit = Math.min(380 / size.w, 240 / size.h)
    const screenPx = size.tableMetrics.bodyFontPx * fit
    assert.ok(screenPx + 0.35 >= 8, `texto en contenedor ≈ ${screenPx}px < 8`)
  })

  it('con tabla NO aplasta la escala del dibujo (fidelidad hatch/trazos)', () => {
    const objects = [
      { type: 'rect', x1: -100, y1: -100, x2: 1900, y2: 1500 },
      { type: 'rect', x1: 200, y1: 200, x2: 1600, y2: 1200 },
      { type: 'hatchRegion', x: 200, y: 200, w: 1400, h: 1000, livePattern: true, hatch: 0 },
    ]
    const nodes = [1, 2, 3, 4].map((i) => ({
      nodeNum: i, norte: 1000 + i, este: 2000 + i, cota: 10, desc: `N${i}`,
    }))
    const bb = sceneExportBounds(objects)
    const natural = Math.min(EXPORT_SCALE_CAP, EXPORT_MAX_INNER / bb.w, EXPORT_MAX_INNER / bb.h)
    const size = computeEsquemaExportSize({ objects, nodes })
    assert.ok(
      Math.abs(size.scale - natural) < 1e-9,
      `scale aplastada: got ${size.scale}, natural ${natural}`,
    )
    // Trazo de 3 px-mundo debe mapear a ≥ 2 px de dispositivo
    assert.ok(size.scale * 3 >= 2, `escala ${size.scale} deja trazos ilegibles`)
    assert.ok(size.tableMetrics.bodyFontPx >= 15)
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
