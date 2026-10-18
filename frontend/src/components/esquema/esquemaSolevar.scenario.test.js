/**
 * Casos a–g: solevado (tronco pirámide/cono, pirámide, cono, transición),
 * sustracción en cadena y fórmulas naturales en memoria.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { metersToWorld } from './esquemaGeometry.js'
import {
  drawSolid3d,
  extrudeClosedEntity,
  round2,
  solidVolumeM3,
  subtractSolids,
} from './esquema3dSolids.js'
import {
  breakdownRowsForBooleanSolid,
  describeSolidForMemoria,
  naturalFormulaFromOperand,
} from './esquema3dCalc.js'
import {
  coneVolumeM3,
  frustumConeVolumeM3,
  frustumPyramidVolumeM3,
  loftBetweenContours,
  loftPyramidOrCone,
  pyramidVolumeM3,
  transitionVolumeM3,
} from './esquema3dLoft.js'
import { solidsViewCamera } from './esquema3dViews.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function rectEnt(id, x0, y0, wM, hM) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(x0),
    y1: metersToWorld(y0),
    x2: metersToWorld(x0 + wM),
    y2: metersToWorld(y0 + hM),
  }
}

function circleEnt(id, cxM, cyM, rM) {
  const r = metersToWorld(rM)
  const cx = metersToWorld(cxM)
  const cy = metersToWorld(cyM)
  return {
    id,
    type: 'elipse',
    x1: cx - r,
    y1: cy - r,
    x2: cx + r,
    y2: cy + r,
  }
}

function mockCtx() {
  const strokes = []
  const fills = []
  return {
    strokes,
    fills,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() { fills.push(1) },
    stroke() { strokes.push(1) },
    setLineDash() {},
    set fillStyle(v) {},
    get fillStyle() { return '' },
    set strokeStyle(v) {},
    get strokeStyle() { return '' },
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
  }
}

describe('caso a · tronco pirámide centrado 6,17 m³', () => {
  it('2×2 @98 y 1,5×1,5 @100 centrados', () => {
    const base = rectEnt('b', 0, 0, 2, 2)
    const top = rectEnt('t', 0.25, 0.25, 1.5, 1.5)
    const r = loftBetweenContours(base, top, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(r.ok, true, r.error)
    assert.equal(r.kind, 'pyramid_frustum')
    assert.equal(round2(r.solid.volumeM3), 6.17)
    const expect = round2(frustumPyramidVolumeM3(4, 2.25, 2))
    assert.equal(expect, 6.17)
    const d = describeSolidForMemoria(r.solid)
    assert.equal(d.forma, 'Tronco de pirámide')
    assert.match(d.formula, /\/3/)
    assert.ok(r.solid.loftDraw?.ringBase?.length)
  })
})

describe('caso b · tronco pirámide tapa desplazada 6,17 m³', () => {
  it('mismo volumen con tapa en esquina', () => {
    const base = rectEnt('b', 0, 0, 2, 2)
    const top = rectEnt('t', 0, 0, 1.5, 1.5) // esquina
    const r = loftBetweenContours(base, top, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(r.ok, true, r.error)
    assert.equal(round2(r.solid.volumeM3), 6.17)
  })
})

describe('caso c · tronco de cono 3,67 m³', () => {
  it('R=1 y r=0,5 h=2', () => {
    const base = circleEnt('b', 0, 0, 1)
    const top = circleEnt('t', 0, 0, 0.5)
    const r = loftBetweenContours(base, top, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(r.ok, true, r.error)
    assert.equal(r.kind, 'cone_frustum')
    assert.equal(round2(r.solid.volumeM3), 3.67)
    assert.equal(round2(frustumConeVolumeM3(1, 0.5, 2)), 3.67)
    const nat = naturalFormulaFromOperand({ volumeM3: r.solid.volumeM3, formMeta: r.solid.formMeta })
    assert.equal(nat.forma, 'Tronco de cono')
    assert.match(nat.formula, /π/)
  })
})

describe('caso d · pirámide 2,67 y cono 2,09', () => {
  it('pirámide cuadrada y cono', () => {
    const base = rectEnt('b', 0, 0, 2, 2)
    const apex = { x: metersToWorld(1), y: metersToWorld(1) }
    const pyr = loftPyramidOrCone(base, apex, { cotaBase: 98, cotaVertice: 100 })
    assert.equal(pyr.ok, true, pyr.error)
    assert.equal(pyr.kind, 'pyramid')
    assert.equal(round2(pyr.solid.volumeM3), 2.67)
    assert.equal(round2(pyramidVolumeM3(4, 2)), 2.67)

    const circ = circleEnt('c', 0, 0, 1)
    const cone = loftPyramidOrCone(circ, { x: 0, y: 0 }, { cotaBase: 98, cotaVertice: 100 })
    assert.equal(cone.ok, true, cone.error)
    assert.equal(cone.kind, 'cone')
    assert.equal(round2(cone.solid.volumeM3), 2.09)
    assert.equal(round2(coneVolumeM3(1, 2)), 2.09)
  })
})

describe('caso e · transición cuadrado–círculo', () => {
  it('fórmula con A1, A2 y Am; volumen exacto', () => {
    const base = rectEnt('b', 0, 0, 2, 2)
    const top = circleEnt('t', 1, 1, 0.75)
    const r = loftBetweenContours(base, top, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(r.ok, true, r.error)
    assert.equal(r.kind, 'transition')
    const fm = r.solid.formMeta
    assert.ok(fm.areaMidM2 > 0)
    const expect = transitionVolumeM3(fm.areaBaseM2, fm.areaMidM2, fm.areaTopM2, fm.heightM)
    assert.ok(Math.abs(r.solid.volumeM3 - expect) < 1e-9)
    const d = describeSolidForMemoria(r.solid)
    assert.equal(d.forma, 'Sólido de transición')
    assert.match(d.formula, /4×/)
    assert.match(d.dimensiones || '', /h/)
  })
})

describe('caso f · sustraer cilindro del tronco', () => {
  it('memoria con fórmula del tronco y del cilindro', () => {
    const base = rectEnt('b', 0, 0, 2, 2)
    const top = rectEnt('t', 0.25, 0.25, 1.5, 1.5)
    const loft = loftBetweenContours(base, top, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(loft.ok, true)
    loft.solid.id = 'tronco'
    loft.solid.nombre = 'Tronco'
    loft.solid.color = '#0f766e'

    const cyl = extrudeClosedEntity(circleEnt('cyl', 1, 1, 0.2), {
      viewId: 'top', cotaSuperior: 99.5, cotaInferior: 98.5,
    }).solid
    cyl.id = 'cyl'
    cyl.nombre = 'Cilindro'
    const sub = subtractSolids(loft.solid, [cyl])
    assert.equal(sub.ok, true, sub.error)
    const rows = breakdownRowsForBooleanSolid(sub.solid, {
      num: 1, nombre: 'Tronco', op: 'sum', signedM3: solidVolumeM3(sub.solid),
    })
    assert.ok(rows.length >= 3)
    const exterior = rows[0]
    assert.match(exterior.detail?.forma || '', /Tronco|pirámide|Pirámide/i)
    assert.ok(
      exterior.detail?.formula?.includes('/3')
      || exterior.detail?.formaCalculo?.includes('/3'),
    )
    const cylRow = rows.find((r) => r.detail?.formula?.includes('π') || r.nombre?.match(/cilindro/i))
    assert.ok(cylRow, 'debe figurar el cilindro descontado')
  })
})

describe('caso g · vistas y UI Solevar', () => {
  it('se dibuja en superior, frontal, NE y órbita; botón y popup en código', () => {
    const base = rectEnt('b', 0, 0, 2, 2)
    const top = rectEnt('t', 0.25, 0.25, 1.5, 1.5)
    const r = loftBetweenContours(base, top, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(r.ok, true)
    for (const viewId of ['top', 'front', 'left', 'iso-ne', 'iso-sw']) {
      const orbit = String(viewId).startsWith('iso-')
        ? solidsViewCamera(viewId, [r.solid])
        : null
      const ctx = mockCtx()
      drawSolid3d(ctx, r.solid, {
        viewId, zoom: 1, pixelScale: 1, orbit, solids: [r.solid], pass: 'all',
      })
      assert.ok(ctx.fills.length >= 1, `fills en ${viewId}`)
      assert.ok(ctx.strokes.length >= 1, `strokes en ${viewId}`)
    }
    const orbitFree = solidsViewCamera('top', [r.solid], {
      orbitFree: true,
      orbitAngles: { yaw: 0.4, pitch: 0.5 },
    })
    const ctxO = mockCtx()
    drawSolid3d(ctxO, r.solid, {
      viewId: 'top', zoom: 1, pixelScale: 1, orbit: orbitFree, solids: [r.solid], pass: 'all',
    })
    assert.ok(ctxO.fills.length >= 1)

    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /esquema-3d-solevar/)
    assert.match(modal, /Solevar/)
    assert.match(modal, /beginSolevar3d|confirmSolevar3d/)
    const ui = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    assert.match(ui, /esquema-solevar-popup/)
    assert.match(ui, /Esquema3dSolevarPopup/)
    const contrato = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(contrato, /C-3D-16|Solevar/)
  })
})
