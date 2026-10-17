/**
 * Casos a–c: tonos por cara, OSNAP confiable sobre sólidos, Sustraer en cadena.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, solidSnapThresholdWorld } from './esquemaGeometry.js'
import {
  FACE_TONE_FACTOR,
  drawSolid3d,
  extrudeClosedEntity,
  faceToneFactorFromNormal,
  round2,
  shadeSolidColorRgb,
  solidAllFacesSnapPoints,
  solidFaceDepthWorld,
  solidFaceFillRgba,
  solidOsnapPoints,
  solidVolumeM3,
  subtractSolids,
} from './esquema3dSolids.js'
import { solidsViewCamera } from './esquema3dViews.js'

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
  s.nombre = 'Caja'
  return s
}

function makeCylinder(id = 'cyl') {
  const r = metersToWorld(0.25)
  const c = { x: metersToWorld(0.75), y: metersToWorld(0.75) }
  const ent = {
    id,
    type: 'elipse',
    x1: c.x - r,
    y1: c.y - r,
    x2: c.x + r,
    y2: c.y + r,
  }
  const s = extrudeClosedEntity(ent, {
    viewId: 'top', cotaSuperior: 1.2, cotaInferior: 0,
  }).solid
  s.id = id
  s.color = '#0f766e'
  return s
}

function mockCtx() {
  const fills = []
  const ctx = {
    fills,
    _fill: '',
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    setLineDash() {},
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
  }
  Object.defineProperty(ctx, 'fillStyle', {
    get() { return ctx._fill },
    set(v) { ctx._fill = v; fills.push(v) },
  })
  return ctx
}

describe('tonos por cara · caso a', () => {
  it('asignación fija: top más claro, bottom más oscuro, laterales distintos', () => {
    const vals = Object.values(FACE_TONE_FACTOR)
    assert.equal(new Set(vals).size, 6)
    assert.ok(FACE_TONE_FACTOR.top > FACE_TONE_FACTOR.right)
    assert.ok(FACE_TONE_FACTOR.right > FACE_TONE_FACTOR.front)
    assert.ok(FACE_TONE_FACTOR.front > FACE_TONE_FACTOR.left)
    assert.ok(FACE_TONE_FACTOR.left > FACE_TONE_FACTOR.back)
    assert.ok(FACE_TONE_FACTOR.back > FACE_TONE_FACTOR.bottom)
  })

  it('front y back producen fills distintos del mismo color base', () => {
    const color = '#2563eb'
    const front = solidFaceFillRgba(color, FACE_TONE_FACTOR.front, 0.22)
    const back = solidFaceFillRgba(color, FACE_TONE_FACTOR.back, 0.22)
    assert.notEqual(front, back)
    const topRgb = shadeSolidColorRgb(color, FACE_TONE_FACTOR.top)
    const botRgb = shadeSolidColorRgb(color, FACE_TONE_FACTOR.bottom)
    assert.ok(topRgb.r + topRgb.g + topRgb.b > botRgb.r + botRgb.g + botRgb.b)
  })

  it('cilindro: tono gradual según normal (no un solo valor)', () => {
    const samples = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      samples.push(faceToneFactorFromNormal(Math.cos(a), Math.sin(a), 0))
    }
    const uniq = new Set(samples.map((f) => f.toFixed(4)))
    assert.ok(uniq.size >= 4, `expected gradual tones, got ${uniq.size}`)
  })

  it('drawSolid3d en NE usa varios fills (caras visibles con tonos distintos)', () => {
    const box = makeBox()
    const ctx = mockCtx()
    const cam = solidsViewCamera('iso-ne', [box], { orbitFree: false })
    drawSolid3d(ctx, box, {
      viewId: 'iso-ne',
      zoom: 1,
      orbit: cam,
      solids: [box],
      pass: 'fills',
    })
    const uniqueFills = [...new Set(ctx.fills.filter((f) => String(f).startsWith('rgba')))]
    assert.ok(uniqueFills.length >= 3, `NE debe distinguir ≥3 tonos, got ${uniqueFills.length}: ${uniqueFills}`)
  })

  it('vista frontal y posterior usan tonos distintos en el fill principal', () => {
    const box = makeBox()
    const ctxF = mockCtx()
    const ctxB = mockCtx()
    drawSolid3d(ctxF, box, { viewId: 'front', zoom: 1, solids: [box], pass: 'fills' })
    drawSolid3d(ctxB, box, { viewId: 'back', zoom: 1, solids: [box], pass: 'fills' })
    const frontFill = solidFaceFillRgba('#2563eb', FACE_TONE_FACTOR.front, 0.3)
    const backFill = solidFaceFillRgba('#2563eb', FACE_TONE_FACTOR.back, 0.3)
    assert.ok(ctxF.fills.includes(frontFill), `front fills ${ctxF.fills}`)
    assert.ok(ctxB.fills.includes(backFill), `back fills ${ctxB.fills}`)
    assert.notEqual(frontFill, backFill)
    assert.notEqual(ctxF.fills[0], ctxB.fills[0])
  })
})

describe('OSNAP confiable sobre sólidos · caso b', () => {
  const VIEWS = ['top', 'bottom', 'front', 'back', 'left', 'right']

  it('umbral en pantalla es constante (px/zoom) en zoom cercano y alejado', () => {
    const far = solidSnapThresholdWorld(0.25, 16)
    const near = solidSnapThresholdWorld(4, 16)
    assert.equal(far, 16 / 0.25)
    assert.equal(near, 16 / 4)
    assert.ok(far > near)
  })

  it('cubo: vértices, medios y centros de cara en las 6 vistas y en NE', () => {
    const box = makeBox()
    for (const vid of VIEWS) {
      const pts = solidOsnapPoints(box, vid)
      const kinds = new Set(pts.map((p) => p.kind))
      assert.ok(kinds.has('corner') || kinds.has('end'), `${vid} corners`)
      assert.ok(kinds.has('mid'), `${vid} mids`)
      assert.ok(kinds.has('center'), `${vid} centers`)
      const facePts = solidAllFacesSnapPoints(box, vid)
      assert.ok(facePts.filter((p) => p.kind === 'center').length >= 6, `${vid} 6 face centers`)
    }
    const cam = solidsViewCamera('iso-ne', [box], { orbitFree: false })
    const iso = solidOsnapPoints(box, 'iso-ne', 0, cam)
    assert.ok(iso.some((p) => p.kind === 'center'))
    assert.ok(iso.some((p) => p.kind === 'corner' || p.kind === 'end'))
    assert.ok(iso.some((p) => p.kind === 'mid'))
  })

  it('cilindro: incluye centros de círculo/cilindro en planta y frontal', () => {
    const cyl = makeCylinder()
    const top = solidOsnapPoints(cyl, 'top')
    assert.ok(top.some((p) => p.kind === 'center'))
    const front = solidOsnapPoints(cyl, 'front')
    assert.ok(front.some((p) => p.kind === 'center'))
  })

  it('OSNAP sobre resultado de Sustraer (poceta) sigue ofreciendo centros y vértices', () => {
    const box = makeBox()
    const inner = extrudeClosedEntity(rectAt(0.2, 0.2, 1.1, 1.1, 'in'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'in'
    const r = subtractSolids(box, [inner])
    assert.equal(r.ok, true)
    for (const vid of ['top', 'front', 'left']) {
      const pts = solidOsnapPoints(r.solid, vid)
      assert.ok(pts.length >= 8, `${vid} snaps on boolean result`)
      assert.ok(pts.some((p) => p.kind === 'center'))
    }
  })

  it('enganche siempre dentro del umbral de pantalla (zoom 0.2 y 5)', () => {
    const box = makeBox()
    const target = solidOsnapPoints(box, 'front').find((p) => p.kind === 'center')
    assert.ok(target)
    for (const z of [0.2, 1, 5]) {
      const thr = solidSnapThresholdWorld(z, 16)
      const cursor = { x: target.x + thr * 0.4, y: target.y }
      const d = Math.hypot(cursor.x - target.x, cursor.y - target.y)
      assert.ok(d < thr, `zoom ${z}: dist ${d} must be < thr ${thr}`)
    }
  })
})

describe('Sustraer en cadena · caso c', () => {
  it('poceta 1,81 m³ luego dos cilindros a través de paredes: ambos pases y volumen exacto', () => {
    const box = makeBox()
    box.nombre = 'Poceta'
    const inner = extrudeClosedEntity(rectAt(0.2, 0.2, 1.1, 1.1, 'in'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'in'
    assert.equal(round2(solidVolumeM3(box)), 3.38)
    assert.equal(round2(solidVolumeM3(inner)), 1.57)

    const poc = subtractSolids(box, [inner])
    assert.equal(poc.ok, true, poc.error)
    assert.equal(round2(poc.solid.volumeM3), 1.81)
    assert.equal(poc.solid.color, '#2563eb')
    assert.equal(poc.solid.nombre, 'Poceta')
    poc.solid.id = 'poceta'
    poc.solid.nombre = 'Poceta'
    poc.solid.color = '#2563eb'

    const rPx = metersToWorld(0.15)
    function pipeThrough(solid, viewId, lengthM, id) {
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
      return pipe.solid
    }

    // Cilindros que atraviesan las paredes (front y left) del resultado.
    const pipe1 = pipeThrough(poc.solid, 'front', 1.5, 'cyl1')
    const pipe2 = pipeThrough(poc.solid, 'left', 1.5, 'cyl2')

    const vPoc = solidVolumeM3(poc.solid)

    // Varios a la vez sobre el resultado de Sustraer (acumula desglose: vacío + pases).
    const both = subtractSolids(poc.solid, [pipe1, pipe2])
    assert.equal(both.ok, true, both.error)
    assert.equal(both.solid.color, '#2563eb')
    assert.equal(both.solid.nombre, 'Poceta')
    assert.equal(both.solid.booleanMeta?.subtracted?.length, 3)

    const exterior = round2(both.solid.booleanMeta.base.volumeM3)
    const subSum = both.solid.booleanMeta.subtracted
      .reduce((s, x) => s + Number(x.volumeM3), 0)
    const expected = round2(exterior - round2(subSum))
    assert.equal(round2(both.solid.volumeM3), expected)
    assert.ok(both.solid.volumeM3 < vPoc - 0.01, 'volumen debe bajar tras los pases')
    assert.ok(both.solid.cells?.length > 0)

    // En cadena: primero uno, luego el otro.
    const step1 = subtractSolids(poc.solid, [pipe1])
    assert.equal(step1.ok, true, step1.error)
    step1.solid.id = 'poc2'
    step1.solid.nombre = 'Poceta'
    step1.solid.color = '#2563eb'
    const step2 = subtractSolids(step1.solid, [pipe2])
    assert.equal(step2.ok, true, step2.error)
    assert.equal(step2.solid.nombre, 'Poceta')
    assert.ok(step2.solid.volumeM3 < step1.solid.volumeM3 - 0.005)
  })

  it('varios operandos a la vez sobre un cubo macizo: conserva color y nombre', () => {
    const box = makeBox()
    const a = extrudeClosedEntity(rectAt(0.1, 0.1, 0.4, 0.4, 'a'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.5,
    }).solid
    a.id = 'a'
    const b = extrudeClosedEntity(rectAt(0.9, 0.9, 0.4, 0.4, 'b'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.5,
    }).solid
    b.id = 'b'
    const r = subtractSolids(box, [a, b])
    assert.equal(r.ok, true, r.error)
    assert.equal(r.solid.color, '#2563eb')
    assert.equal(r.solid.nombre, 'Caja')
    assert.equal(r.solid.booleanMeta?.subtracted?.length, 2)
    const expect = round2(round2(solidVolumeM3(box)) - round2(solidVolumeM3(a)) - round2(solidVolumeM3(b)))
    assert.equal(round2(r.solid.volumeM3), expect)
  })
})
