/**
 * Escenario C-2D-06 / caso 58: acotado en todas las vistas con medida real 3D.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import { solidsViewCamera } from './esquema3dViews.js'
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
  projectCota3dForView,
  syncBoundCotas3d,
} from './esquemaCota3d.js'
import { projectObjectsCotas3dForExport } from './esquemaExport.js'
import { cotaText } from './esquemaCota.js'

function solidExcavacion() {
  const ent = {
    id: 'e16',
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
  r.solid.id = 'exc-16'
  return { ent, solid: r.solid }
}

function endsAt(solid, viewId, { z, x, y, tol = 2 } = {}) {
  const snaps = solidOsnapPoints(solid, viewId)
  return snaps.filter((s) => {
    if (!(s.kind === 'end' || s.kind === 'corner') || !s.world) return false
    if (z != null && Math.abs(s.world.zCota - z) > 1e-6) return false
    if (x != null && Math.abs(s.world.x - x) > tol) return false
    if (y != null && Math.abs(s.world.y - y) > tol) return false
    return true
  })
}

describe('escenario · acotado todas las vistas (C-2D-06)', () => {
  it('flujo excavación 16×2,30×1,50: NE, frontal, lateral, órbita, editar, mover, export', () => {
    const { ent, solid } = solidExcavacion()

    // a) NE: largo, ancho, altura
    const o = endsAt(solid, 'iso-ne', { z: 0, x: 0, y: 0 })[0]
    const pL = endsAt(solid, 'iso-ne', { z: 0, x: metersToWorld(16), y: 0 })[0]
    const pW = endsAt(solid, 'iso-ne', { z: 0, x: 0, y: metersToWorld(2.3) })[0]
    const pH = endsAt(solid, 'iso-ne', { z: 1.5, x: 0, y: 0 })[0]
    assert.ok(o && pL && pW && pH)
    const cL = { ...createCota3d(o, pL), id: 'cl' }
    const cW = { ...createCota3d(o, pW), id: 'cw' }
    const cH = { ...createCota3d(o, pH), id: 'ch' }
    assert.ok(Math.abs(cL.meters - 16) < 0.05)
    assert.ok(Math.abs(cW.meters - 2.3) < 0.05)
    assert.ok(Math.abs(cH.meters - 1.5) < 0.05)

    // b) frontal altura + lateral ancho
    const f0 = endsAt(solid, 'front', { z: 0 })[0]
    const f1 = endsAt(solid, 'front', { z: 1.5, x: f0.world.x })[0]
    const cFrontH = createCota3d(f0, f1)
    assert.ok(Math.abs(cFrontH.meters - 1.5) < 0.05)
    const l0 = endsAt(solid, 'left', { z: 0 })[0]
    const lW = endsAt(solid, 'left', { z: 0 }).find((s) => (
      Math.abs(distance3dMeters(s.world, l0.world) - 2.3) < 0.15
    ))
    assert.ok(lW)
    assert.ok(Math.abs(createCota3d(l0, lW).meters - 2.3) < 0.15)

    // c) giro libre: diagonal cara superior
    const orbit = solidsViewCamera('iso-ne', [solid], {
      orbitFree: true,
      orbitAngles: { yaw: 0.8, pitch: 0.55 },
    })
    const topA = endsAt(solid, 'iso-ne', { z: 1.5, x: 0, y: 0 })[0]
    const topB = endsAt(solid, 'iso-ne', {
      z: 1.5,
      x: metersToWorld(16),
      y: metersToWorld(2.3),
    })[0]
    const cDiag = createCota3d(topA, topB)
    assert.ok(Math.abs(cDiag.meters - Math.hypot(16, 2.3)) < 0.05)
    const drawnOrbit = projectCota3dForView(cDiag, 'iso-ne', orbit)
    assert.equal(cotaText(drawnOrbit), formatRealMeters(cDiag.meters))

    // d) altura → 2.00 m
    const upd = updateExtrudedSolid(solid, ent, { cotaSuperior: 2, cotaInferior: 0 })
    assert.equal(upd.ok, true)
    let scene = [cL, cW, cH]
    let sync = syncBoundCotas3d(scene, [upd.solid], { viewId: 'iso-ne' })
    assert.equal(sync.changed, true)
    const hAfter = sync.objects.find((o) => o.id === 'ch')
    assert.ok(Math.abs(hAfter.meters - 2) < 0.05)
    assert.equal(hAfter.text, formatRealMeters(hAfter.meters))

    // e) mover sólido
    const moved = translateSolid3d(upd.solid, { dx: metersToWorld(5), dy: metersToWorld(1) })
    moved.id = upd.solid.id
    sync = syncBoundCotas3d(sync.objects, [moved], { viewId: 'top' })
    assert.equal(sync.changed, true)
    assert.ok(Math.abs(sync.objects.find((o) => o.id === 'cl').worldA.x - metersToWorld(5)) < 2)
    assert.ok(Math.abs(sync.objects.find((o) => o.id === 'cl').meters - 16) < 0.05)

    // f) export iso-NE: cotas proyectadas con misma medida
    const cam = solidsViewCamera('iso-ne', [moved], { orbitFree: false })
    const exported = projectObjectsCotas3dForExport(sync.objects, 'iso-ne', cam)
    assert.equal(exported.length, 3)
    for (const c of exported) {
      assert.ok(Number.isFinite(c.x1) && Number.isFinite(c.y1))
      assert.ok(Number.isFinite(c.x2) && Number.isFinite(c.y2))
      assert.ok(c.text && c.text.includes('m'))
    }
    const expH = exported.find((o) => o.id === 'ch')
    assert.ok(Math.abs(expH.meters - 2) < 0.05)
  })
})
