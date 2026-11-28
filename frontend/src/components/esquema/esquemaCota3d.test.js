/**
 * C-2D-06 · Acotado en todas las vistas con medida real 3D y cotas amarradas.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, PX_PER_METER } from './esquemaGeometry.js'
import { projectWorld3dToCanvas, solidsViewCamera } from './esquema3dViews.js'
import {
  extrudeClosedEntity,
  solidOsnapPoints,
  translateSolid3d,
  updateExtrudedSolid,
} from './esquema3dSolids.js'
import {
  createCota3d,
  distance3dMeters,
  formatRealMeters,
  isCota3d,
  projectCota3dForView,
  syncBoundCotas3d,
} from './esquemaCota3d.js'
import { cotaText, createCota } from './esquemaCota.js'
import { projectObjectsCotas3dForExport } from './esquemaExport.js'

function excavacion16x230x150() {
  const ent = {
    id: 'exc-ent',
    type: 'rect',
    x1: 0,
    y1: 0,
    x2: metersToWorld(16),
    y2: metersToWorld(2.3),
  }
  const r = extrudeClosedEntity(ent, {
    viewId: 'top',
    cotaSuperior: 1.5,
    cotaInferior: 0,
  })
  assert.equal(r.ok, true)
  r.solid.id = 'exc'
  return { ent, solid: r.solid }
}

function pickCorner(solid, viewId, pred) {
  const snaps = solidOsnapPoints(solid, viewId)
  const ends = snaps.filter((s) => s.kind === 'end' || s.kind === 'corner')
  const hit = ends.find(pred) || ends[0]
  assert.ok(hit?.world, 'OSNAP con world')
  return hit
}

describe('esquemaCota3d · medida real', () => {
  it('distance3dMeters: largo 16, ancho 2.30, altura 1.50 y diagonal', () => {
    const a = { x: 0, y: 0, zCota: 0 }
    const bL = { x: metersToWorld(16), y: 0, zCota: 0 }
    const bW = { x: 0, y: metersToWorld(2.3), zCota: 0 }
    const bH = { x: 0, y: 0, zCota: 1.5 }
    assert.ok(Math.abs(distance3dMeters(a, bL) - 16) < 1e-9)
    assert.ok(Math.abs(distance3dMeters(a, bW) - 2.3) < 1e-9)
    assert.ok(Math.abs(distance3dMeters(a, bH) - 1.5) < 1e-9)
    const diag = distance3dMeters(
      { x: 0, y: 0, zCota: 1.5 },
      { x: metersToWorld(16), y: metersToWorld(2.3), zCota: 1.5 },
    )
    assert.ok(Math.abs(diag - Math.hypot(16, 2.3)) < 1e-9)
    assert.equal(formatRealMeters(16), '16.0 m')
    assert.equal(formatRealMeters(2.3), '2.30 m')
    assert.equal(formatRealMeters(1.5), '1.50 m')
  })

  it('NE: acota largo, ancho y altura enganchando vértices (medida real)', () => {
    const { solid } = excavacion16x230x150()
    const snaps = solidOsnapPoints(solid, 'iso-ne')
    const bottom = snaps.filter((s) => (s.kind === 'end' || s.kind === 'corner') && Math.abs(s.world.zCota) < 1e-6)
    const top = snaps.filter((s) => (s.kind === 'end' || s.kind === 'corner') && Math.abs(s.world.zCota - 1.5) < 1e-6)
    assert.ok(bottom.length >= 4 && top.length >= 4)

    const o = bottom.find((s) => Math.abs(s.world.x) < 1 && Math.abs(s.world.y) < 1)
      || bottom[0]
    const alongX = bottom.find((s) => Math.abs(s.world.x - metersToWorld(16)) < 1 && Math.abs(s.world.y - o.world.y) < 1)
      || bottom.find((s) => Math.abs(worldDistXy(s.world, o.world) - 16) < 0.05)
    const alongY = bottom.find((s) => Math.abs(s.world.y - metersToWorld(2.3)) < 1 && Math.abs(s.world.x - o.world.x) < 1)
      || bottom.find((s) => Math.abs(worldDistXy(s.world, o.world) - 2.3) < 0.05)
    const up = top.find((s) => Math.abs(s.world.x - o.world.x) < 1 && Math.abs(s.world.y - o.world.y) < 1)
      || top[0]

    const cotaL = createCota3d(o, alongX)
    const cotaW = createCota3d(o, alongY)
    const cotaH = createCota3d(o, up)
    assert.equal(cotaL.kind, 'linear3d')
    assert.ok(Math.abs(cotaL.meters - 16) < 0.05, `largo=${cotaL.meters}`)
    assert.ok(Math.abs(cotaW.meters - 2.3) < 0.05, `ancho=${cotaW.meters}`)
    assert.ok(Math.abs(cotaH.meters - 1.5) < 0.05, `altura=${cotaH.meters}`)
    assert.equal(cotaText(cotaL), formatRealMeters(cotaL.meters))
    assert.equal(cotaText(cotaH), formatRealMeters(cotaH.meters))
  })

  it('frontal y lateral: altura y ancho con OSNAP', () => {
    const { solid } = excavacion16x230x150()
    const frontBase = pickCorner(solid, 'front', (s) => Math.abs(s.world.zCota) < 1e-6)
    const frontTop = pickCorner(solid, 'front', (s) => (
      Math.abs(s.world.zCota - 1.5) < 1e-6
      && Math.abs(s.world.x - frontBase.world.x) < 1
    ))
    const cotaH = createCota3d(frontBase, frontTop)
    assert.ok(Math.abs(cotaH.meters - 1.5) < 0.05)

    const leftBase = pickCorner(solid, 'left', (s) => Math.abs(s.world.zCota) < 1e-6)
    const leftWide = pickCorner(solid, 'left', (s) => (
      Math.abs(s.world.zCota) < 1e-6
      && Math.abs(worldDistXy(s.world, leftBase.world) - 2.3) < 0.1
    ))
    const cotaW = createCota3d(leftBase, leftWide)
    assert.ok(Math.abs(cotaW.meters - 2.3) < 0.15, `lateral ancho=${cotaW.meters}`)
  })

  it('giro libre: diagonal cara superior = distancia real', () => {
    const { solid } = excavacion16x230x150()
    const orbit = solidsViewCamera('iso-ne', [solid], { orbitFree: true })
    const snaps = solidOsnapPoints(solid, 'iso-ne', 0, orbit)
    const top = snaps.filter((s) => (s.kind === 'end' || s.kind === 'corner') && Math.abs(s.world.zCota - 1.5) < 1e-6)
    const a = top.find((s) => Math.abs(s.world.x) < 2 && Math.abs(s.world.y) < 2) || top[0]
    const b = top.find((s) => (
      Math.abs(s.world.x - metersToWorld(16)) < 2
      && Math.abs(s.world.y - metersToWorld(2.3)) < 2
    )) || top[top.length - 1]
    const cota = createCota3d(a, b)
    const expect = Math.hypot(16, 2.3)
    assert.ok(Math.abs(cota.meters - expect) < 0.05, `diag=${cota.meters} expect=${expect}`)
  })

  it('cambiar altura a 2.00 m actualiza cota amarrada', () => {
    const { ent, solid } = excavacion16x230x150()
    const base = { x: 0, y: 0, zCota: 0, world: { x: 0, y: 0, zCota: 0 }, solidId: solid.id, snapKind: 'end' }
    const top = {
      x: 0, y: 0, zCota: 1.5,
      world: { x: 0, y: 0, zCota: 1.5 },
      solidId: solid.id,
      snapKind: 'end',
    }
    const cota = { ...createCota3d(base, top), id: 'c-h' }
    assert.ok(Math.abs(cota.meters - 1.5) < 1e-6)

    const upd = updateExtrudedSolid(solid, ent, {
      cotaSuperior: 2,
      cotaInferior: 0,
    })
    assert.equal(upd.ok, true)
    const { objects, changed } = syncBoundCotas3d([cota], [upd.solid], { viewId: 'iso-ne' })
    assert.equal(changed, true)
    assert.ok(Math.abs(objects[0].meters - 2) < 0.05, `altura sync=${objects[0].meters}`)
    assert.equal(objects[0].text, formatRealMeters(objects[0].meters))
  })

  it('mover sólido: cotas amarradas acompañan', () => {
    const { solid } = excavacion16x230x150()
    const a = {
      world: { x: 0, y: 0, zCota: 0 },
      x: 0, y: 0, solidId: solid.id, snapKind: 'end',
    }
    const b = {
      world: { x: metersToWorld(16), y: 0, zCota: 0 },
      x: metersToWorld(16), y: 0, solidId: solid.id, snapKind: 'end',
    }
    const cota = { ...createCota3d(a, b), id: 'c-l' }
    const dx = metersToWorld(3)
    const moved = translateSolid3d(solid, { dx, dy: 0, dzCota: 0 })
    moved.id = solid.id
    const { objects, changed } = syncBoundCotas3d([cota], [moved], { viewId: 'top' })
    assert.equal(changed, true)
    assert.ok(Math.abs(objects[0].worldA.x - dx) < 1)
    assert.ok(Math.abs(objects[0].worldB.x - (dx + metersToWorld(16))) < 1)
    assert.ok(Math.abs(objects[0].meters - 16) < 0.05)
  })

  it('proyección iso-ne para PNG/PDF conserva medida y alinea extremos', () => {
    const { solid } = excavacion16x230x150()
    const a = { world: { x: 0, y: 0, zCota: 0 }, x: 0, y: 0, solidId: solid.id, snapKind: 'end' }
    const b = {
      world: { x: 0, y: 0, zCota: 1.5 },
      x: 0, y: -metersToWorld(1.5),
      solidId: solid.id,
      snapKind: 'end',
    }
    const cota = createCota3d(a, b)
    const cam = solidsViewCamera('iso-ne', [solid], { orbitFree: false })
    const projected = projectCota3dForView(cota, 'iso-ne', cam)
    assert.ok(isCota3d(projected))
    assert.ok(Math.abs(projected.meters - 1.5) < 1e-6)
    const pa = projectWorld3dToCanvas(cota.worldA, 'iso-ne', 0, cam)
    const pb = projectWorld3dToCanvas(cota.worldB, 'iso-ne', 0, cam)
    assert.ok(Math.abs(projected.x1 - pa.x) < 1e-6)
    assert.ok(Math.abs(projected.y2 - pb.y) < 1e-6)
    const forExport = projectObjectsCotas3dForExport([cota], 'iso-ne', cam)
    assert.equal(forExport[0].text, projected.text)
  })

  it('conserva acotado 2D lineal de vista superior (sin world)', () => {
    const c2d = createCota({ x: 0, y: 0 }, { x: PX_PER_METER * 4, y: 0 })
    assert.equal(c2d.kind, 'linear')
    assert.equal(cotaText(c2d), '4.00 m')
    assert.equal(isCota3d(c2d), false)
  })
})

function worldDistXy(a, b) {
  const dx = ((a?.x || 0) - (b?.x || 0)) / PX_PER_METER
  const dy = ((a?.y || 0) - (b?.y || 0)) / PX_PER_METER
  return Math.hypot(dx, dy)
}
