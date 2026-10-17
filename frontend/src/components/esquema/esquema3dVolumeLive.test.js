import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  refreshSolidFromSourceEntity,
  solidVolumeM3,
} from './esquema3dSolids.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
} from './esquema3dCalc.js'
import { orbitAnglesForView, projectWorld3dToCanvas } from './esquema3dViews.js'

describe('volumen vivo y vistas 3D', () => {
  it('3,50×3,50 → 24,50 m³; al pasar a 4,00 m de lado → 28,00 m³ de inmediato', () => {
    const ent = {
      id: 'r1',
      type: 'rect',
      x1: 0,
      y1: 0,
      x2: metersToWorld(3.5),
      y2: metersToWorld(3.5),
    }
    const extruded = extrudeClosedEntity(ent, {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    })
    assert.equal(extruded.ok, true)
    assert.ok(Math.abs(extruded.solid.volumeM3 - 24.5) < 1e-9)

    // Redimensionar el contorno fuente a 4,00 × 3,50
    const resized = {
      ...ent,
      x2: metersToWorld(4),
      y2: metersToWorld(3.5),
    }
    const refreshed = refreshSolidFromSourceEntity(extruded.solid, resized)
    assert.equal(refreshed.ok, true)
    assert.ok(Math.abs(refreshed.solid.volumeM3 - 28) < 1e-9)
    assert.ok(Math.abs(solidVolumeM3(refreshed.solid) - 28) < 1e-9)

    const calc = createVolumeCalc('Excavación')
    calc.lines = [createCalcLine({ solidId: refreshed.solid.id, nombre: 'Caja', op: 'sum' })]
    assert.ok(Math.abs(calcTotalM3(calc, [refreshed.solid]) - 28) < 1e-9)
  })

  it('vistas isométricas proyectan distinto que superior', () => {
    const pt = { x: 100, y: 50, zCota: 10 }
    const top = projectWorld3dToCanvas(pt, 'top')
    const ne = projectWorld3dToCanvas(pt, 'iso-ne')
    const front = projectWorld3dToCanvas(pt, 'front')
    assert.equal(top.x, 100)
    assert.equal(top.y, 50)
    assert.ok(Number.isFinite(top.depth))
    assert.ok(ne.x !== top.x || ne.y !== top.y)
    assert.equal(front.x, 100)
    assert.ok(front.y !== top.y)

    const angles = orbitAnglesForView('iso-ne')
    assert.ok(Number.isFinite(angles.yaw) && Number.isFinite(angles.pitch))
    const orb = projectWorld3dToCanvas(pt, 'top', 0, { ...angles, center: { x: 0, y: 0, zCota: 0 } })
    assert.ok(Number.isFinite(orb.x) && Number.isFinite(orb.y))
  })
})
