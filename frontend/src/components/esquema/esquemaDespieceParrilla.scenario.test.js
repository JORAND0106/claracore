/**
 * Casos a–h · Dibujar parrilla sin contorno ni recubrimiento.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankSegmentsForShape, getBuiltinShape } from './esquemaDespieceShapes.js'
import {
  PARRILLA_MSG,
  barLengthsUniformM,
  buildBarsFromStart,
  buildParrillaViewsFromBars,
  canContinueFromLast,
  classifyParrillaPosition,
  estimateParrillaPngHeight,
  prepareParrillaQueue,
  recordLastByUbic,
  resolveContinueStart,
} from './esquemaDespieceParrilla.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function posBar({
  id = 'a',
  name = 'A',
  pieces = 5,
  spacingM = '0.20',
  ubicacion = 'Longitudinal',
  anguloDeg = '',
  parrilla = 'Sencilla',
  parrillaCara = '',
  mainM = '1.00',
  hookM = '0.05',
  variable = null,
} = {}) {
  const shape = getBuiltinShape('doble_gancho_180')
  const segs = blankSegmentsForShape(shape)
  segs[0].lengthM = hookM
  if (variable) {
    segs[1].mode = 'variable'
    segs[1].minM = String(variable.min)
    segs[1].maxM = String(variable.max)
    segs[1].lengthM = ''
  } else {
    segs[1].lengthM = mainM
  }
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

describe('caso a · 5 #4 c/0,20 longitudinal desde inicio', () => {
  it('5 horizontales de arriba hacia abajo', () => {
    const pos = posBar({ id: 'a', name: 'As1', pieces: 5, mainM: '1.00' })
    const bar = buildBarsFromStart(pos, { x: 0, y: 0 }, { colorIndex: 0 })
    assert.ok(bar.drawable)
    assert.equal(bar.segments.length, 5)
    assert.equal(bar.segments[0].y1, 0)
    assert.equal(bar.segments[1].y1, 0.2)
    assert.equal(bar.segments[4].y1, 0.8)
    assert.equal(bar.segments[0].x1, 0)
    assert.equal(bar.segments[0].x2, 1)
    assert.ok(bar.segments.every((s) => s.y1 === s.y2), 'horizontales')
    assert.match(bar.labelText, /As1 · 5 #4 c\/ 0,20 L=1,00/)
  })
})

describe('caso b · continuar Sí desde última varilla', () => {
  it('B y C quedan 0,20 m debajo en cadena', () => {
    const a = posBar({ id: 'a', name: 'A', pieces: 5, mainM: '1.00' })
    const b = posBar({ id: 'b', name: 'B', pieces: 1, spacingM: '', mainM: '0.80' })
    const c = posBar({ id: 'c', name: 'C', pieces: 1, spacingM: '', mainM: '0.60' })

    assert.equal(classifyParrillaPosition(b).kind, 'single')
    assert.equal(classifyParrillaPosition(c).kind, 'single')

    const barA = buildBarsFromStart(a, { x: 0, y: 0 })
    let last = recordLastByUbic({}, barA)
    assert.equal(barA.lastStart.y, 0.8)

    const startB = resolveContinueStart(last, 'Longitudinal')
    assert.deepEqual(startB, { x: 0, y: 1 })
    const barB = buildBarsFromStart(b, startB)
    assert.ok(barB.drawable)
    assert.equal(barB.segments.length, 1)
    assert.equal(barB.segments[0].y1, 1)
    assert.equal(barB.segments[0].x2 - barB.segments[0].x1, 0.8)
    last = recordLastByUbic(last, barB)

    const startC = resolveContinueStart(last, 'Longitudinal')
    assert.deepEqual(startC, { x: 0, y: 1.2 })
    const barC = buildBarsFromStart(c, startC)
    assert.equal(barC.segments[0].y1, 1.2)
    assert.equal(barC.segments[0].x2 - barC.segments[0].x1, 0.6)
  })
})

describe('caso c · Sí sin varillas previas de esa ubicación → pide inicio', () => {
  it('Sí sin previas transversales: resolveContinue null → toque; luego verticales', () => {
    const a = posBar({ id: 'a', ubicacion: 'Longitudinal', pieces: 5 })
    const d = posBar({ id: 'd', name: 'D', ubicacion: 'Transversal', pieces: 6, mainM: '1.00' })
    const barA = buildBarsFromStart(a, { x: 0, y: 0 })
    const last = recordLastByUbic({}, barA)
    // Tras responder Sí sin varillas de esa ubicación, no hay inicio automático.
    assert.equal(canContinueFromLast(last, 'Transversal'), false)
    assert.equal(resolveContinueStart(last, 'Transversal'), null)
    assert.equal(PARRILLA_MSG.askContinue, '¿Continuar desde la última varilla?')
    assert.equal(PARRILLA_MSG.touchStart, 'Toque el punto de inicio')

    const barD = buildBarsFromStart(d, { x: 2, y: 0 })
    assert.ok(barD.drawable)
    assert.equal(barD.segments.length, 6)
    assert.equal(barD.segments[0].x1, 2)
    assert.equal(barD.segments[1].x1, 2.2)
    assert.equal(barD.segments[5].x1, 3)
    assert.ok(barD.segments.every((s) => s.x1 === s.x2), 'verticales')
    assert.equal(barD.segments[0].y2 - barD.segments[0].y1, 1)
  })
})

describe('caso d · No → arranca donde se toca', () => {
  it('punto tocado es el inicio', () => {
    const e = posBar({ id: 'e', name: 'E', pieces: 3, mainM: '0.50' })
    const bar = buildBarsFromStart(e, { x: 4.5, y: 3.2 })
    assert.equal(bar.segments[0].x1, 4.5)
    assert.equal(bar.segments[0].y1, 3.2)
    assert.equal(bar.segments[1].y1, 3.4)
  })
})

describe('caso e · segmento variable 0,40–1,18 con 8 piezas', () => {
  it('longitudes uniformes de menor a mayor', () => {
    const pos = posBar({
      id: 'v',
      name: 'Var',
      pieces: 8,
      spacingM: '0.15',
      variable: { min: 0.4, max: 1.18 },
    })
    const lengths = barLengthsUniformM(pos, 8)
    assert.equal(lengths.length, 8)
    assert.equal(lengths[0], 0.4)
    assert.equal(lengths[7], 1.18)
    assert.equal(lengths[1], 0.51)
    const bar = buildBarsFromStart(pos, { x: 0, y: 0 })
    assert.ok(bar.drawable)
    assert.equal(bar.segments[0].x2 - bar.segments[0].x1, 0.4)
    assert.equal(bar.segments[7].x2 - bar.segments[7].x1, 1.18)
    assert.match(bar.labelText, /L=0,40–1,18/)
  })
})

describe('caso f · parrilla doble → dos vistas con título', () => {
  it('Superior/Externa e Inferior/Interna', () => {
    const schedule = {
      positions: [
        posBar({ id: 's1', name: 'Sup', ubicacion: 'Longitudinal', parrilla: 'Doble', parrillaCara: 'Superior / Externa' }),
        posBar({ id: 'i1', name: 'Inf', ubicacion: 'Longitudinal', parrilla: 'Doble', parrillaCara: 'Inferior / Interna' }),
      ],
    }
    const bars = [
      buildBarsFromStart(schedule.positions[0], { x: 0, y: 0 }, { colorIndex: 0 }),
      buildBarsFromStart(schedule.positions[1], { x: 0, y: 0 }, { colorIndex: 1 }),
    ]
    const draw = buildParrillaViewsFromBars(schedule, bars, [])
    assert.equal(draw.views.length, 2)
    assert.equal(draw.views[0].title, 'Parrilla Superior / Externa')
    assert.equal(draw.views[1].title, 'Parrilla Inferior / Interna')
    assert.equal(draw.views[0].bars.length, 1)
    assert.equal(draw.views[1].bars.length, 1)
  })
})

describe('caso g · textos de una sola línea corta', () => {
  it('PARRILLA_MSG y cableado modal sin popup de recubrimiento', () => {
    for (const v of Object.values(PARRILLA_MSG)) {
      assert.ok(!v.includes('\n'), v)
      assert.ok(v.length <= 48, `"${v}" demasiado largo`)
    }
    assert.equal(PARRILLA_MSG.touchStart, 'Toque el punto de inicio')
    assert.equal(PARRILLA_MSG.askContinue, '¿Continuar desde la última varilla?')

    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /parrillaSession|PARRILLA_MSG|ask-continue|touch-start/)
    assert.doesNotMatch(modal, /despiece-parrilla-cover|Indique el recubrimiento/)
    assert.doesNotMatch(modal, /Seleccione en el lienzo un contorno cerrado/)
    assert.match(modal, /despiece-parrilla-continue-yes|despiece-parrilla-continue-no/)
  })
})

describe('caso h · PNG con vistas debajo; omitidas sin espaciamiento', () => {
  it('altura PNG > 0; multi sin espaciamiento → Sin espaciamiento', () => {
    const schedule = {
      positions: [
        posBar({ id: 'a', ubicacion: 'Longitudinal' }),
        posBar({ id: 'skip', name: 'Skip', pieces: 4, spacingM: '' }),
      ],
    }
    const { queue, skipped } = prepareParrillaQueue(schedule)
    assert.equal(queue.length, 1)
    assert.equal(skipped.length, 1)
    assert.equal(skipped[0].reason, 'Sin espaciamiento')

    const bars = [buildBarsFromStart(queue[0].pos, { x: 0, y: 0 })]
    const draw = buildParrillaViewsFromBars(schedule, bars, skipped)
    assert.ok(estimateParrillaPngHeight(draw, 2200) > 100)
    assert.equal(draw.views[0].skipped[0].reason, 'Sin espaciamiento')

    const exp = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(exp, /paintParrillaViews|parrillaDraw|estimateParrillaPngHeight/)
    const panel = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(panel, /Dibujar parrilla|despiece-dibujar-parrilla/)
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-DES-07|Dibujar parrilla/)
    assert.match(md, /Continuar desde la última varilla|sin contorno|sin recubrimiento/i)
  })
})
