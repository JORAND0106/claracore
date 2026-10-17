/**
 * Casos de presentación legible (Poceta, prisma+cilindro, 6 sólidos).
 * Verifica volumen, etiquetas # y grosores independientes de la escala.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  isSolidNestedIn,
  solidLineWidthWorld,
  solidVolumeM3,
  SOLID3D_STYLE,
  translateSolidXy,
} from './esquema3dSolids.js'
import {
  createCalcLine,
  createVolumeCalc,
  freezeCalcSnapshot,
  round2,
} from './esquema3dCalc.js'
import { labelsFromSnapshot } from './esquema3dCalcExport.js'

function rectAt(x0, y0, wM, hM, id) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(x0),
    y1: metersToWorld(y0),
    x2: metersToWorld(x0 + wM),
    y2: metersToWorld(y0 + hM),
  }
}

function circleAt(cxM, cyM, rM, id) {
  const cx = metersToWorld(cxM)
  const cy = metersToWorld(cyM)
  const r = metersToWorld(rM)
  return {
    id,
    type: 'elipse',
    x1: cx - r,
    y1: cy - r,
    x2: cx + r,
    y2: cy + r,
  }
}

describe('presentación · tres casos', () => {
  it('a) Poceta: excavación 1,90×2,30×2,60 con placa y box internos', () => {
    const exc = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'exc'), {
      viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
    }).solid
    exc.id = 'exc'
    exc.color = '#7c3aed'
    assert.ok(Math.abs(solidVolumeM3(exc) - 1.9 * 2.3 * 2.6) < 1e-9)

    const placa = extrudeClosedEntity(rectAt(0.3, 0.3, 1.2, 0.8, 'placa'), {
      viewId: 'top', cotaSuperior: 0.3, cotaInferior: 0,
    }).solid
    placa.id = 'placa'
    placa.color = '#0f766e'

    const box = extrudeClosedEntity(rectAt(0.5, 1.2, 0.6, 0.6, 'box'), {
      viewId: 'top', cotaSuperior: 1.0, cotaInferior: 0,
    }).solid
    box.id = 'box'
    box.color = '#b45309'

    assert.equal(isSolidNestedIn(placa, exc), true)
    assert.equal(isSolidNestedIn(box, exc), true)

    const calc = createVolumeCalc('Poceta')
    calc.lines = [
      createCalcLine({ solidId: 'exc', nombre: 'Excavación', op: 'sum' }),
      createCalcLine({ solidId: 'placa', nombre: 'Placa concreto', op: 'subtract' }),
      createCalcLine({ solidId: 'box', nombre: 'Box', op: 'subtract' }),
    ]
    const snap = freezeCalcSnapshot(calc, [exc, placa, box])
    const labels = labelsFromSnapshot(snap)
    assert.deepEqual(labels.map((l) => l.num), [1, 2, 3])
    assert.equal(labels[0].solidId, 'exc')
    assert.ok(snap.totalM3 < solidVolumeM3(exc))
    // Grosores: a mayor escala de export, menor ancho en unidades world
    const w1 = solidLineWidthWorld(SOLID3D_STYLE.visiblePx, 1)
    const w4 = solidLineWidthWorld(SOLID3D_STYLE.visiblePx, 4)
    assert.ok(w4 < w1)
  })

  it('b) Prisma con cilindro interno que descuenta', () => {
    const prisma = extrudeClosedEntity(rectAt(0, 0, 3, 3, 'p'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    prisma.id = 'p'
    prisma.color = '#1d4ed8'
    const cyl = extrudeClosedEntity(circleAt(1.5, 1.5, 0.6, 'c'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    cyl.id = 'c'
    cyl.color = '#dc2626'
    assert.equal(isSolidNestedIn(cyl, prisma), true)
    const calc = createVolumeCalc('Pozo')
    calc.lines = [
      createCalcLine({ solidId: 'p', nombre: 'Prisma', op: 'sum' }),
      createCalcLine({ solidId: 'c', nombre: 'Cilindro', op: 'subtract' }),
    ]
    const snap = freezeCalcSnapshot(calc, [prisma, cyl])
    assert.equal(labelsFromSnapshot(snap).length, 2)
    // Total = suma de valores a 2 decimales (no float crudo de π).
    const expected = round2(round2(solidVolumeM3(prisma)) - round2(solidVolumeM3(cyl)))
    assert.equal(snap.totalM3, expected)
  })

  it('c) Seis sólidos distintos (internos y separados) con etiquetas 1..6', () => {
    const solids = []
    const colors = ['#7c3aed', '#0f766e', '#b45309', '#2563eb', '#dc2626', '#0891b2']
    // Contenedor grande
    const big = extrudeClosedEntity(rectAt(0, 0, 5, 5, 'big'), {
      viewId: 'top', cotaSuperior: 3, cotaInferior: 0,
    }).solid
    big.id = 's1'
    big.color = colors[0]
    solids.push(big)
    // Dos internos
    for (let i = 0; i < 2; i += 1) {
      const s = extrudeClosedEntity(rectAt(0.5 + i * 1.5, 0.5, 0.8, 0.8, `in${i}`), {
        viewId: 'top', cotaSuperior: 1.2, cotaInferior: 0,
      }).solid
      s.id = `s${i + 2}`
      s.color = colors[i + 1]
      solids.push(s)
      assert.equal(isSolidNestedIn(s, big), true)
    }
    // Tres separados
    for (let i = 0; i < 3; i += 1) {
      let s = extrudeClosedEntity(rectAt(0, 0, 0.7 + i * 0.1, 0.5, `out${i}`), {
        viewId: 'top', cotaSuperior: 0.8, cotaInferior: 0,
      }).solid
      s = translateSolidXy(s, metersToWorld(7 + i * 1.2), metersToWorld(i * 0.8))
      s.id = `s${i + 4}`
      s.color = colors[i + 3]
      solids.push(s)
      assert.equal(isSolidNestedIn(s, big), false)
    }
    assert.equal(solids.length, 6)
    const calc = createVolumeCalc('Varios')
    calc.lines = solids.map((s, i) => createCalcLine({
      solidId: s.id,
      nombre: `Capa ${i + 1}`,
      op: i === 0 ? 'sum' : (i < 3 ? 'subtract' : 'sum'),
    }))
    const snap = freezeCalcSnapshot(calc, solids)
    const labels = labelsFromSnapshot(snap)
    assert.equal(labels.length, 6)
    assert.deepEqual(labels.map((l) => l.num), [1, 2, 3, 4, 5, 6])
  })
})
