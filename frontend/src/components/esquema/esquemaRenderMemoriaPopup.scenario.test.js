/**
 * Casos a–f: render limpio perforados, panel ampliable, popup cálculo,
 * fórmulas naturales, desglose memoria, tabla compacta.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { metersToWorld, ESQUEMA_CONTEXT_SIDEBAR_W, squareModalOuterSize } from './esquemaGeometry.js'
import {
  coalesceStackedCells,
  drawSolid3d,
  extrudeClosedEntity,
  round2,
  solidFaceDepthWorld,
  solidOsnapPoints,
  solidVolumeM3,
  subtractSolids,
} from './esquema3dSolids.js'
import {
  breakdownRowsForBooleanSolid,
  describeSolidForMemoria,
  freezeCalcSnapshot,
  naturalFormulaFromOperand,
  createCalcLine,
  createVolumeCalc,
} from './esquema3dCalc.js'
import { solidsViewCamera } from './esquema3dViews.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

function makeBox(id = 'box') {
  const s = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, id), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
  }).solid
  s.id = id
  s.color = '#2563eb'
  s.nombre = 'Poceta'
  return s
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
    fill(rule) { fills.push({ style: this._fill, rule }) },
    stroke() { strokes.push({ style: this._stroke, width: this.lineWidth }) },
    setLineDash() {},
    set fillStyle(v) { this._fill = v },
    get fillStyle() { return this._fill },
    set strokeStyle(v) { this._stroke = v },
    get strokeStyle() { return this._stroke },
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
  }
}

function perforatedPoceta() {
  const box = makeBox()
  const inner = extrudeClosedEntity(rectAt(0.2, 0.2, 1.1, 1.1, 'in'), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
  }).solid
  inner.id = 'in'
  inner.nombre = 'Vacío interior'
  const poc = subtractSolids(box, [inner])
  assert.equal(poc.ok, true, poc.error)
  poc.solid.id = 'poceta'
  poc.solid.nombre = 'Poceta'
  poc.solid.color = '#2563eb'

  const rPx = metersToWorld(0.15)
  function pipeThrough(solid, viewId, lengthM, id, nombre) {
    const depth = solidFaceDepthWorld(solid, viewId)
    const center = solidOsnapPoints(solid, viewId).find((s) => s.kind === 'center')
    assert.ok(center, `center in ${viewId}`)
    const circ = {
      id,
      type: 'elipse',
      x1: center.x - rPx,
      y1: center.y - rPx,
      x2: center.x + rPx,
      y2: center.y + rPx,
    }
    const pipe = extrudeClosedEntity(circ, {
      viewId,
      lengthM,
      faceDepthWorld: depth,
    })
    assert.equal(pipe.ok, true, pipe.error)
    pipe.solid.id = id
    pipe.solid.nombre = nombre
    return pipe.solid
  }
  const pipe1 = pipeThrough(poc.solid, 'front', 1.5, 'cyl1', 'Salida')
  const pipe2 = pipeThrough(poc.solid, 'left', 1.5, 'cyl2', 'Llegada')
  const both = subtractSolids(poc.solid, [pipe1, pipe2])
  assert.equal(both.ok, true, both.error)
  both.solid.id = 'poceta'
  both.solid.nombre = 'Poceta'
  return both.solid
}

describe('render limpio perforados · caso a', () => {
  it('poceta perforada: menos aristas densas; coalesce reduce losas; tonos en fills', () => {
    const solid = perforatedPoceta()
    assert.ok(solid.booleanMeta?.subtracted?.length >= 3)
    assert.ok(round2(solid.volumeM3) <= 1.81)
    assert.ok(solid.volumeM3 > 1.4)

    const before = solid.cells.length
    const coalesced = coalesceStackedCells(solid.cells)
    assert.ok(coalesced.length <= before, 'coalesce no aumenta celdas')

    const orbit = solidsViewCamera('iso-ne', [solid])
    const ctx = mockCtx()
    drawSolid3d(ctx, { ...solid, cells: coalesced }, {
      viewId: 'iso-ne', zoom: 1, pixelScale: 1, orbit, solids: [solid], pass: 'all',
    })
    // Sin AABB opaco: hay fills; aristas no deben explotar a miles.
    assert.ok(ctx.fills.length >= 1)
    assert.ok(ctx.strokes.length < 1200, `strokes ${ctx.strokes.length} aún densos`)

    const ctxF = mockCtx()
    drawSolid3d(ctxF, solid, {
      viewId: 'front', zoom: 1, pixelScale: 1, solids: [solid], pass: 'fills',
    })
    assert.ok(ctxF.fills.length >= 1, 'frontal con caras')
  })
})

describe('panel lateral ampliable · caso b', () => {
  it('resizer visible y ancho arrastrable ≥ contrato', () => {
    const src = readFileSync(join(__dirname, 'esquemaContextSidebar.jsx'), 'utf8')
    assert.match(src, /esquema-context-sidebar-resizer/)
    assert.match(src, /col-resize/)
    assert.match(src, /Arrastre para ampliar/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /setPointerCapture/)
    assert.match(modal, /setContextSidebarUserW/)
    const wide = squareModalOuterSize(1400, 900, 480)
    assert.equal(wide.sidebar, 480)
    assert.ok(wide.sidebar >= ESQUEMA_CONTEXT_SIDEBAR_W)
  })
})

describe('popup datos cálculo · caso c', () => {
  it('popup Excel al agregar; lista solo nombres; tip y edición', () => {
    const panel = readFileSync(join(__dirname, 'esquema3dCalcPanel.jsx'), 'utf8')
    assert.match(panel, /esquema-calc-data-popup/)
    assert.match(panel, /esquema-calc-add-selected/)
    assert.match(panel, /esquema-calc-names-list/)
    assert.match(panel, /esquema-calc-name-row/)
    assert.match(panel, /openAddPopup|openEditPopup|CalcDataPopup/)
    assert.match(panel, /Escriba el nombre de cada sólido/)
    assert.match(panel, /data-cc-tooltip/)
  })
})

describe('fórmulas naturales y desglose · casos d–e', () => {
  it('poceta perforada: filas 1…1.4 con π×r²×L y neto', () => {
    const solid = perforatedPoceta()
    const rows = breakdownRowsForBooleanSolid(solid, {
      num: 1,
      nombre: 'Poceta',
      op: 'sum',
      signedM3: solid.volumeM3,
    })
    assert.ok(rows?.length >= 5, `rows ${rows?.length}`)
    assert.equal(rows[0].numLabel, '1')
    assert.match(rows[0].nombre, /exterior/i)
    assert.equal(rows[1].numLabel, '1.1')
    assert.equal(rows[2].numLabel, '1.2')
    assert.equal(rows[3].numLabel, '1.3')
    assert.equal(rows[4].numLabel, '1.4')
    assert.match(rows[4].nombre, /neto/i)
    assert.ok(rows[4].isNetRow)
    assert.ok(rows[4].netOpLabel.includes('1 − 1.1'))
    // Algún descuento cilíndrico con fórmula π
    const cylRow = rows.find((r) => r.detail?.formula?.includes('π') || r.detail?.formaCalculo?.includes('π'))
    assert.ok(cylRow, 'debe haber fórmula de cilindro')
    assert.equal(round2(rows[4].volumeM3), round2(solid.volumeM3))

    const calc = createVolumeCalc('Poceta')
    calc.lines = [createCalcLine({ solidId: solid.id, nombre: 'Poceta', op: 'sum' })]
    const snap = freezeCalcSnapshot(calc, [solid])
    assert.ok(snap.memoriaRows.length >= 5)
    assert.equal(round2(snap.totalM3), round2(solid.volumeM3))
  })

  it('prisma, cilindro y base irregular con fórmula natural', () => {
    const prism = extrudeClosedEntity(rectAt(0, 0, 2, 1, 'p'), {
      viewId: 'top', cotaSuperior: 1.2, cotaInferior: 0,
    }).solid
    prism.id = 'p'
    const dPrism = describeSolidForMemoria(prism)
    assert.match(dPrism.formaCalculo, /×/)
    assert.ok(dPrism.dimensiones)
    assert.ok(dPrism.formula)

    const r = metersToWorld(0.25)
    const cyl = extrudeClosedEntity({
      id: 'c', type: 'elipse',
      x1: metersToWorld(3) - r, y1: metersToWorld(0) - r,
      x2: metersToWorld(3) + r, y2: metersToWorld(0) + r,
    }, { viewId: 'top', cotaSuperior: 0.8, cotaInferior: 0 }).solid
    cyl.id = 'c'
    const dCyl = describeSolidForMemoria(cyl)
    assert.equal(dCyl.forma, 'Cilindro')
    assert.match(dCyl.formula || dCyl.formaCalculo, /π/)
    assert.match(dCyl.dimensiones, /Ø|L/)

    const poly = extrudeClosedEntity({
      id: 'ir',
      type: 'polilinea',
      closed: true,
      points: [
        { x: metersToWorld(5), y: metersToWorld(0) },
        { x: metersToWorld(6.2), y: metersToWorld(0) },
        { x: metersToWorld(5.8), y: metersToWorld(1.1) },
        { x: metersToWorld(5.1), y: metersToWorld(0.9) },
      ],
    }, { viewId: 'top', cotaSuperior: 0.5, cotaInferior: 0 }).solid
    poly.id = 'ir'
    const dPoly = describeSolidForMemoria(poly)
    assert.ok(dPoly.formaCalculo.includes('×') || dPoly.forma.includes('irregular') || dPoly.forma.includes('poligonal') || dPoly.forma.includes('Prisma'))

    // Volumen parcial = área × L efectiva (no la longitud total del tubo).
    const nat = naturalFormulaFromOperand({
      volumeM3: Math.PI * 0.15 * 0.15 * 0.2,
      formMeta: { kind: 'cylinder', rxM: 0.15, lengthM: 1.4, diameterM: 0.3, effectiveLengthM: 0.2 },
    })
    assert.match(nat.formula, /π × 0,15² × 0,20/)
    assert.match(nat.dimensiones, /Ø 0,30/)
    assert.doesNotMatch(nat.formula, /× 1,40/)
  })
})

describe('tabla compacta memoria · caso f', () => {
  it('compose usa ~½ ancho para la tabla; columnas Dimensiones y Fórmula', () => {
    const src = readFileSync(join(__dirname, 'esquema3dCalcExport.js'), 'utf8')
    assert.match(src, /tableTargetW|contentW \* 0\.52/)
    assert.match(src, /Dimensiones/)
    assert.match(src, /Fórmula/)
    assert.doesNotMatch(src, /label: 'Long'/)
    assert.doesNotMatch(src, /label: 'Anch'/)
    assert.doesNotMatch(src, /label: 'Espesor'/)
  })
})
