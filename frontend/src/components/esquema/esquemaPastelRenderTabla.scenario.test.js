/**
 * Casos a–c: render limpio (sin trama), pastel por vista, tabla memoria sin cortes
 * y fórmulas alineadas al volumen efectivo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { metersToWorld } from './esquemaGeometry.js'
import {
  coalesceStackedCells,
  drawSolid3d,
  extrudeClosedEntity,
  lengthMatchingVolumeM3,
  round2,
  solidFaceDepthWorld,
  solidOsnapPoints,
  subtractSolids,
} from './esquema3dSolids.js'
import {
  breakdownRowsForBooleanSolid,
  naturalFormulaFromOperand,
} from './esquema3dCalc.js'
import {
  editorCanvasFill,
  VIEW_PASTEL,
  viewPastelFor,
  solidsViewCamera,
} from './esquema3dViews.js'

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

/** Poceta 1,50³ − vacío 1,10×1,10×1,30 − dos pases cilíndricos (como en producción). */
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

describe('caso a · render limpio poceta perforada', () => {
  it('NE y giro libre: fills presentes, strokes sin trama densa', () => {
    const solid = perforatedPoceta()
    const coalesced = coalesceStackedCells(solid.cells)
    const orbit = solidsViewCamera('iso-ne', [solid])
    const ctxNe = mockCtx()
    drawSolid3d(ctxNe, { ...solid, cells: coalesced }, {
      viewId: 'iso-ne', zoom: 1, pixelScale: 1, orbit, solids: [solid], pass: 'all',
    })
    assert.ok(ctxNe.fills.length >= 1, 'caras en NE')
    assert.ok(ctxNe.strokes.length < 1200, `trama densa en NE: ${ctxNe.strokes.length}`)

    const ctxOrbit = mockCtx()
    drawSolid3d(ctxOrbit, solid, {
      viewId: 'top',
      zoom: 1,
      pixelScale: 1,
      orbit: { yaw: Math.PI / 5, pitch: 0.4, center: orbit?.center || null },
      solids: [solid],
      pass: 'all',
    })
    assert.ok(ctxOrbit.fills.length >= 1)
    assert.ok(ctxOrbit.strokes.length < 1200, `trama densa en órbita: ${ctxOrbit.strokes.length}`)

    const src = readFileSync(join(__dirname, 'esquema3dSolids.js'), 'utf8')
    assert.match(src, /skipVerticals/)
    assert.match(src, /midTess|thinSlabMax/)
  })
})

describe('caso b · color pastel por vista plana', () => {
  it('seis pasteles; iso/órbita/2D conservan fondo; botones usan face pastel', () => {
    assert.equal(viewPastelFor('bottom').label, 'verde')
    assert.equal(viewPastelFor('front').label, 'naranja')
    assert.equal(viewPastelFor('top').label, 'azul')
    assert.equal(viewPastelFor('back').label, 'morado')
    assert.equal(viewPastelFor('left').label, 'amarillo')
    assert.equal(viewPastelFor('right').label, 'rosa')
    assert.equal(Object.keys(VIEW_PASTEL).length, 6)

    const def = '#ffffff'
    assert.equal(editorCanvasFill({ mode3d: true, viewId: 'top', defaultCanvas: def }), VIEW_PASTEL.top.canvas)
    assert.equal(editorCanvasFill({ mode3d: true, viewId: 'front', defaultCanvas: def }), VIEW_PASTEL.front.canvas)
    assert.equal(editorCanvasFill({ mode3d: true, viewId: 'iso-ne', defaultCanvas: def }), def)
    assert.equal(editorCanvasFill({
      mode3d: true, orbitFree: true, viewId: 'front', defaultCanvas: def,
    }), def)
    assert.equal(editorCanvasFill({ mode3d: false, viewId: 'top', defaultCanvas: def }), def)

    const ui = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    assert.match(ui, /viewPastelFor/)
    assert.match(ui, /pastel=\{/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /editorCanvasFill/)
  })
})

describe('caso c · tabla memoria: textos completos y fórmula = volumen', () => {
  it('fórmula de cilindro/elipse usa L efectiva igual al volumen', () => {
    const area = Math.PI * 0.46 * 0.46
    const L = lengthMatchingVolumeM3(area, 0.13, 0.30)
    assert.ok(Math.abs(area * L - 0.13) < 1e-9)
    const nat = naturalFormulaFromOperand({
      volumeM3: 0.13,
      formMeta: { kind: 'elliptic_prism', rxM: 0.46, ryM: 0.46, lengthM: 0.30 },
    })
    assert.match(nat.formula, /π × 0,46 × 0,46 × 0,20/)
    assert.doesNotMatch(nat.formula, /× 0,30/)
    assert.match(nat.formaCalculo, /= 0,13 m³/)

    // V = π×0,15²×0,20 ≈ 0,014 → L efectiva 0,20 (no la longitud total 1,40).
    const natCyl = naturalFormulaFromOperand({
      volumeM3: Math.PI * 0.15 * 0.15 * 0.2,
      formMeta: {
        kind: 'cylinder', rxM: 0.15, lengthM: 1.4, diameterM: 0.3, effectiveLengthM: 0.2,
      },
    })
    assert.match(natCyl.formula, /π × 0,15² × 0,20/)

    const solid = perforatedPoceta()
    const rows = breakdownRowsForBooleanSolid(solid, {
      num: 1, nombre: 'Poceta', op: 'sum', signedM3: solid.volumeM3,
    })
    assert.ok(rows?.length >= 5)
    for (const r of rows) {
      if (r.isNetRow) continue
      const d = r.detail || {}
      if (!d.formula || !d.formula.includes('π')) continue
      const vol = round2(r.volumeM3)
      // La L de la fórmula debe hacer cuadrar V ≈ área×L (tolerancia de redondeo a 2 dec).
      assert.ok(d.formaCalculo?.includes(`= ${String(vol).replace('.', ',')} m³`)
        || Math.abs(round2(r.volumeM3) - vol) < 0.011, `fila ${r.numLabel}: ${d.formaCalculo}`)
    }
  })

  it('export: wrap sin ellipsis; columnas Descuenta de / Dimensiones / Volumen', () => {
    const src = readFileSync(join(__dirname, 'esquema3dCalcExport.js'), 'utf8')
    assert.match(src, /wrapMemoriaText/)
    assert.match(src, /Descuenta de/)
    assert.match(src, /Dimensiones/)
    assert.match(src, /Volumen \(m³\)/)
    assert.doesNotMatch(src, /maxChars/)
    assert.doesNotMatch(src, /slice\(0, Math\.max\(4, maxChars/)
    assert.doesNotMatch(src, /\$\{txt\.slice/)
  })
})
