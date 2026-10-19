/**
 * Casos a–g · Dibujar parrilla desde el cuadro de despiece.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankSegmentsForShape, getBuiltinShape } from './esquemaDespieceShapes.js'
import { metersToWorld } from './esquemaGeometry.js'
import {
  buildBarsForPosition,
  buildParrillaViews,
  contourBoundsMetersFromRing,
  distributeOffsetsM,
  estimateParrillaPngHeight,
  mainStraightLengthM,
  parseSpacingM,
  verifyGridCaseA,
  worldPointToLocalM,
} from './esquemaDespieceParrilla.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function posBar({
  id = 'a',
  name = 'A',
  pieces = 8,
  spacingM = '0.20',
  ubicacion = 'Longitudinal',
  anguloDeg = '',
  parrilla = 'Sencilla',
  parrillaCara = '',
  mainM = '1.40',
  hookM = '0.05',
} = {}) {
  const shape = getBuiltinShape('doble_gancho_180')
  const segs = blankSegmentsForShape(shape)
  segs[0].lengthM = hookM
  segs[1].lengthM = mainM
  segs[2].lengthM = hookM
  return {
    id,
    name,
    diameter: '1/2',
    pieces,
    shapeId: 'doble_gancho_180',
    segments: segs,
    units: 'm',
    spacingM,
    ubicacion,
    anguloDeg,
    parrilla,
    parrillaCara,
  }
}

function squareBounds15() {
  // Contorno 1,50 × 1,50 m en world
  const side = metersToWorld(1.5)
  const ring = [
    { x: 0, y: 0 },
    { x: side, y: 0 },
    { x: side, y: side },
    { x: 0, y: side },
  ]
  return contourBoundsMetersFromRing(ring)
}

describe('caso a · grilla 8×8 en 1,50 m c/0,20 recubrimiento 0,05', () => {
  it('offsets 0,05…1,45 y tramos 1,40', () => {
    assert.deepEqual(
      distributeOffsetsM(0.05, 0.20, 8),
      [0.05, 0.25, 0.45, 0.65, 0.85, 1.05, 1.25, 1.45],
    )
    const bounds = squareBounds15()
    assert.equal(bounds.widthM, 1.5)
    assert.equal(bounds.heightM, 1.5)
    const schedule = {
      id: 'c1',
      nombre: 'Poceta',
      positions: [
        posBar({ id: 'a', name: 'A', ubicacion: 'Longitudinal' }),
        posBar({ id: 'b', name: 'B', ubicacion: 'Transversal' }),
      ],
    }
    const draw = buildParrillaViews(schedule, bounds, 0.05)
    assert.equal(draw.views.length, 1)
    assert.equal(draw.views[0].title, 'Parrilla')
    assert.ok(verifyGridCaseA(draw.views))
    const long = draw.views[0].bars.find((b) => b.ubicacion === 'Longitudinal')
    assert.equal(long.segments[0].x1, 0.05)
    assert.equal(long.segments[0].x2, 1.45)
    assert.match(long.labelText, /A · 8 #4 c\/ 0,20 L=1,40/)
  })
})

describe('caso b · parrilla doble → dos vistas', () => {
  it('superior e inferior con su grilla', () => {
    const bounds = squareBounds15()
    const schedule = {
      positions: [
        posBar({ id: 's1', name: 'Sup L', ubicacion: 'Longitudinal', parrilla: 'Doble', parrillaCara: 'Superior / Externa' }),
        posBar({ id: 's2', name: 'Sup T', ubicacion: 'Transversal', parrilla: 'Doble', parrillaCara: 'Superior / Externa' }),
        posBar({ id: 'i1', name: 'Inf L', ubicacion: 'Longitudinal', parrilla: 'Doble', parrillaCara: 'Inferior / Interna' }),
        posBar({ id: 'i2', name: 'Inf T', ubicacion: 'Transversal', parrilla: 'Doble', parrillaCara: 'Inferior / Interna' }),
      ],
    }
    const draw = buildParrillaViews(schedule, bounds, 0.05)
    assert.equal(draw.views.length, 2)
    assert.equal(draw.views[0].title, 'Parrilla Superior / Externa')
    assert.equal(draw.views[1].title, 'Parrilla Inferior / Interna')
    assert.equal(draw.views[0].bars.length, 2)
    assert.equal(draw.views[1].bars.length, 2)
    assert.ok(verifyGridCaseA(draw.views))
  })
})

describe('caso c · ancla de usuario para varillas cortas', () => {
  it('arranca desde el punto tocado', () => {
    const bounds = squareBounds15()
    const pos = posBar({
      id: 'c',
      name: 'Cortas',
      pieces: 4,
      spacingM: '0.10',
      ubicacion: 'Longitudinal',
      mainM: '0.40',
    })
    const bar = buildBarsForPosition(pos, bounds, 0.05, {
      anchorLocalM: { x: 0.30, y: 0.50 },
    })
    assert.ok(bar.drawable)
    assert.equal(bar.segments.length, 4)
    assert.equal(bar.segments[0].x1, 0.30)
    assert.equal(bar.segments[0].y1, 0.50)
    assert.equal(bar.segments[1].y1, 0.60)
    assert.equal(bar.segments[3].y1, 0.80)
  })
})

describe('caso d · diagonal 45°', () => {
  it('ángulo desde esquina superior izquierda', () => {
    const bounds = squareBounds15()
    const pos = posBar({
      id: 'd',
      name: 'Diag',
      pieces: 3,
      ubicacion: 'Diagonal',
      anguloDeg: '45',
      mainM: '1.00',
    })
    const bar = buildBarsForPosition(pos, bounds, 0.05)
    assert.ok(bar.drawable)
    assert.equal(bar.ubicacion, 'Diagonal')
    assert.equal(bar.segments.length, 3)
    // Primera varilla: dirección ~45°
    const s0 = bar.segments[0]
    const ang = Math.atan2(s0.y2 - s0.y1, s0.x2 - s0.x1) * 180 / Math.PI
    assert.ok(Math.abs(ang - 45) < 0.01)
  })
})

describe('caso e · sin espaciamiento', () => {
  it('aparece como sin distribución', () => {
    assert.equal(parseSpacingM(''), null)
    assert.equal(parseSpacingM(null), null)
    const bounds = squareBounds15()
    const pos = posBar({ id: 'e', name: 'SinEsp', spacingM: '' })
    const draw = buildParrillaViews({ positions: [pos] }, bounds, 0.05)
    assert.equal(draw.views[0].bars.length, 0)
    assert.equal(draw.views[0].skipped[0].reason, 'sin distribución')
  })
})

describe('caso f · regenerar al cambiar piezas', () => {
  it('nuevo N° piezas cambia el número de barras', () => {
    const bounds = squareBounds15()
    const a = posBar({ pieces: 8 })
    const b = posBar({ pieces: 5 })
    const d1 = buildParrillaViews({ positions: [a] }, bounds, 0.05)
    const d2 = buildParrillaViews({ positions: [b] }, bounds, 0.05)
    assert.equal(d1.views[0].bars[0].segments.length, 8)
    assert.equal(d2.views[0].bars[0].segments.length, 5)
  })
})

describe('caso g · PNG reserva altura para vistas', () => {
  it('estimateParrillaPngHeight > 0 y export/panel cableados', () => {
    const bounds = squareBounds15()
    const draw = buildParrillaViews({
      positions: [
        posBar({ id: 'a', ubicacion: 'Longitudinal' }),
        posBar({ id: 'b', ubicacion: 'Transversal' }),
      ],
    }, bounds, 0.05)
    assert.ok(estimateParrillaPngHeight(draw, 2200) > 100)
    assert.ok(mainStraightLengthM(posBar()) === 1.4)

    const exp = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(exp, /paintParrillaViews|parrillaDraw|estimateParrillaPngHeight/)
    const panel = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(panel, /Dibujar parrilla|despiece-dibujar-parrilla/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /despieceParrilla|parrillaPrompt|buildParrillaViews/)
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-DES-07|Dibujar parrilla/)
  })
})

describe('helpers · world ↔ local', () => {
  it('convierte ancla de world a local', () => {
    const bounds = squareBounds15()
    const local = worldPointToLocalM({ x: metersToWorld(0.3), y: metersToWorld(0.5) }, bounds)
    assert.ok(Math.abs(local.x - 0.3) < 1e-9)
    assert.ok(Math.abs(local.y - 0.5) < 1e-9)
  })
})
