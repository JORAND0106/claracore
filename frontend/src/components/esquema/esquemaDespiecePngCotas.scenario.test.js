/**
 * PNG legible, cotas sobre segmentos, campos espaciamiento/ubicación/parrilla.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  computePositionMetrics,
  computeScheduleTotalKg,
  formatEspaciamiento,
  formatParrilla,
  formatUbicacion,
  round2,
} from './esquemaDespiece.js'
import { blankSegmentsForShape, getBuiltinShape } from './esquemaDespieceShapes.js'
import { cotaLinesForSegment, segmentLabelAnchor, shapeCotaOverlays } from './esquemaDespieceDraw.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function pos180(overrides = {}) {
  const shape = getBuiltinShape('doble_gancho_180')
  const segs = blankSegmentsForShape(shape)
  segs[0].lengthM = '0.20'
  segs[1].lengthM = '0.76'
  segs[2].lengthM = '0.20'
  return {
    id: 'ps',
    name: 'Parrilla superior longitudinal',
    diameter: '1/2',
    pieces: 2,
    shapeId: 'doble_gancho_180',
    segments: segs,
    units: 'm',
    ...overrides,
  }
}

describe('caso a · PNG textos legibles', () => {
  it('export usa tipografía proporcional mayor y tabla a ancho completo', () => {
    const exp = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(exp, /width = 2200/)
    assert.match(exp, /34 \* textScale/)
    assert.match(exp, /cellFont/)
    assert.match(exp, /tableWidthRatio/)
    assert.match(exp, /drawShapeWithCotasOnSegments/)
    assert.match(exp, /Espaciamiento/)
    assert.match(exp, /Ubicación/)
    assert.match(exp, /Parrilla/)
  })
})

describe('caso b · cotas sobre cada segmento', () => {
  it('doble gancho 180°: anclas y cotas 20 / 76 / 20 por segmento', () => {
    const shape = getBuiltinShape('doble_gancho_180')
    assert.ok(shape.segments.every((s) => s.labelAt))
    const pos = pos180()
    const overlays = shapeCotaOverlays(shape, pos)
    assert.equal(overlays.length, 3)
    assert.deepEqual(overlays.map((o) => o.lines[0]), ['20', '76', '20'])
    // Anclas distintas (no apiladas en el mismo punto)
    const xs = overlays.map((o) => o.x)
    assert.ok(new Set(xs).size === 3)
    const left = segmentLabelAnchor(shape.segments[0])
    const center = segmentLabelAnchor(shape.segments[1])
    const right = segmentLabelAnchor(shape.segments[2])
    assert.ok(left.x < center.x && center.x < right.x)
  })
})

describe('caso c · variable sobre su segmento', () => {
  it('Var. 40 a 118 / Prom. 79 en overlay del tramo central', () => {
    const shape = getBuiltinShape('doble_gancho')
    const segs = blankSegmentsForShape(shape)
    segs[0].lengthM = '0.20'
    segs[1].mode = 'variable'
    segs[1].minM = '0.40'
    segs[1].maxM = '1.18'
    segs[2].lengthM = '0.20'
    const lines = cotaLinesForSegment(segs[1])
    assert.deepEqual(lines, ['Var. 40 a 118', 'Prom. 79'])
    const overlays = shapeCotaOverlays(shape, { segments: segs })
    const mid = overlays.find((o) => o.id === 'center')
    assert.ok(mid)
    assert.deepEqual(mid.lines, ['Var. 40 a 118', 'Prom. 79'])
  })
})

describe('caso d · espaciamiento, diagonal y parrilla doble', () => {
  it('formatos y cálculo intacto', () => {
    const pos = pos180({
      spacingM: '0.20',
      ubicacion: 'Diagonal',
      anguloDeg: '45',
      parrilla: 'Doble',
      parrillaCara: 'Inferior / Interna',
    })
    assert.equal(formatEspaciamiento(pos.spacingM), 'c/ 0,20')
    assert.equal(formatUbicacion(pos), 'Diagonal 45°')
    assert.equal(formatParrilla(pos), 'Doble · Inferior / Interna')
    const m = computePositionMetrics(pos)
    assert.equal(m.partialM, 1.16)
    assert.equal(m.totalM, 2.32)
    assert.equal(m.pesoKg, 2.31)
  })
})

describe('caso e · posiciones existentes conservan pesos', () => {
  it('2,31 + 2,43 = 4,74; campos nuevos vacíos muestran —', () => {
    const a = pos180({ name: 'A', pieces: 2 })
    // Segunda posición: ajustar para ~2,43 kg con #4
    // 2,43 / 0,994 ≈ 2,4447 m total → con 2 piezas parcial ≈ 1,222 → use 0.20+0.82+0.20=1.22 → 2.44*0.994=2.425≈2.43
    const shape = getBuiltinShape('doble_gancho_180')
    const segs = blankSegmentsForShape(shape)
    segs[0].lengthM = '0.20'
    segs[1].lengthM = '0.82'
    segs[2].lengthM = '0.20'
    const b = {
      id: 'b',
      name: 'B',
      diameter: '1/2',
      pieces: 2,
      shapeId: 'doble_gancho_180',
      segments: segs,
    }
    const ma = computePositionMetrics(a)
    const mb = computePositionMetrics(b)
    assert.equal(ma.pesoKg, 2.31)
    assert.equal(mb.pesoKg, round2(2.44 * 0.994))
    assert.equal(mb.pesoKg, 2.43)
    assert.equal(computeScheduleTotalKg([a, b]), 4.74)
    assert.equal(formatEspaciamiento(a.spacingM), '—')
    assert.equal(formatUbicacion(a), '—')
    assert.equal(formatParrilla(a), '—')
  })
})

describe('contrato · png cotas campos', () => {
  it('documento y package.json', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /cotas sobre/i)
    assert.match(md, /Espaciamiento/)
    assert.match(md, /esquemaDespiecePngCotas/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaDespiecePngCotas\.scenario\.test\.js/)
    const panel = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(panel, /despiece-pos-espaciamiento/)
    assert.match(panel, /despiece-pos-ubicacion/)
    assert.match(panel, /despiece-pos-parrilla/)
    assert.match(panel, /showCotas/)
  })
})
