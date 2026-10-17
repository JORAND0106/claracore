import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  dropSolidsForEntities,
  extrudeClosedEntity,
  linkedSourceEntityIds,
  refreshSolidFromSourceEntity,
  solidForSourceEntity,
  solidVolumeM3,
  sourceEntityIdsOfSolids,
  subtractSolids,
  syncSolidsWithEntities,
  translateSolidXy,
} from './esquema3dSolids.js'
import {
  orbitAnglesForView,
  projectWorld3dToCanvas,
  solidsOrbitCenter,
  solidsViewCamera,
} from './esquema3dViews.js'

function rectAt(xM, yM, wM, hM, id = 'box') {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(xM),
    y1: metersToWorld(yM),
    x2: metersToWorld(xM + wM),
    y2: metersToWorld(yM + hM),
  }
}

function circleAt(cxM, cyM, rM, id = 'cyl') {
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

describe('entidad única contorno+sólido y cotas Z', () => {
  it('al mover el contorno, sync mueve el sólido completo (mismo ring)', () => {
    const box = rectAt(0, 0, 3.5, 3.5, 'r1')
    const extruded = extrudeClosedEntity(box, {
      viewId: 'top',
      cotaSuperior: 100,
      cotaInferior: 98,
    })
    assert.equal(extruded.ok, true)
    assert.equal(extruded.solid.sourceEntityId, 'r1')

    const moved = {
      ...box,
      x1: metersToWorld(2),
      y1: metersToWorld(1),
      x2: metersToWorld(5.5),
      y2: metersToWorld(4.5),
    }
    const { solids, changed } = syncSolidsWithEntities([extruded.solid], [moved])
    assert.equal(changed, true)
    const ring0 = solids[0].cells[0].ring[0]
    assert.ok(Math.abs(ring0.x - metersToWorld(2)) < 1e-6)
    assert.ok(Math.abs(ring0.y - metersToWorld(1)) < 1e-6)
    assert.ok(Math.abs(solids[0].volumeM3 - 24.5) < 1e-9)
  })

  it('cotas ubican en Z absoluto: cilindro 100→99 dentro de prisma 100→98', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 3.5, 3.5, 'box'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const cyl = extrudeClosedEntity(circleAt(1.75, 1.75, 0.5, 'cyl'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 99,
    }).solid
    assert.equal(box.cells[0].z1, 100)
    assert.equal(box.cells[0].z0, 98)
    assert.equal(cyl.cells[0].z1, 100)
    assert.equal(cyl.cells[0].z0, 99)
    // Misma cara superior (cota 100) en proyección frontal
    const topBox = projectWorld3dToCanvas({ x: 0, y: 0, zCota: 100 }, 'front')
    const topCyl = projectWorld3dToCanvas({ x: 10, y: 0, zCota: 100 }, 'front')
    assert.equal(topBox.y, topCyl.y)
    const botCyl = projectWorld3dToCanvas({ x: 10, y: 0, zCota: 99 }, 'front')
    const botBox = projectWorld3dToCanvas({ x: 0, y: 0, zCota: 98 }, 'front')
    assert.ok(botCyl.y > topCyl.y) // cota menor → más abajo en pantalla (y mayor)
    assert.ok(botBox.y > botCyl.y)
  })

  it('sustraer cilindro del prisma: volumen = 24.50 − π r² · 1', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 3.5, 3.5, 'box'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const cyl = extrudeClosedEntity(circleAt(1.75, 1.75, 0.5, 'cyl'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 99,
    }).solid
    const r = subtractSolids(box, [cyl])
    assert.equal(r.ok, true)
    const expected = 24.5 - (Math.PI * 0.5 * 0.5 * 1)
    // Tras booleano el anillo se muestreá; tolerancia por tessellation del círculo
    assert.ok(
      Math.abs(r.solid.volumeM3 - expected) < 0.05,
      `got ${r.solid.volumeM3}, expected ~${expected}`,
    )
    assert.equal(r.solid.sourceEntityId, undefined)
  })

  it('linkedSourceEntityIds y dropSolidsForEntities mantienen entidad única', () => {
    const a = extrudeClosedEntity(rectAt(0, 0, 1, 1, 'a'), {
      viewId: 'top', cotaSuperior: 10, cotaInferior: 8,
    }).solid
    const b = extrudeClosedEntity(rectAt(2, 2, 1, 1, 'b'), {
      viewId: 'top', cotaSuperior: 10, cotaInferior: 9,
    }).solid
    const ids = linkedSourceEntityIds([a, b])
    assert.equal(ids.has('a'), true)
    assert.equal(ids.has('b'), true)
    assert.equal(solidForSourceEntity([a, b], 'b')?.id, b.id)
    const left = dropSolidsForEntities([a, b], ['a'])
    assert.equal(left.length, 1)
    assert.equal(left[0].id, b.id)
    assert.deepEqual(sourceEntityIdsOfSolids([a, b]).sort(), ['a', 'b'])
  })

  it('translateSolidXy no altera cotas', () => {
    const s = extrudeClosedEntity(rectAt(0, 0, 2, 2, 't'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const moved = translateSolidXy(s, metersToWorld(1), metersToWorld(0.5))
    assert.equal(moved.cells[0].z0, 98)
    assert.equal(moved.cells[0].z1, 100)
    assert.ok(Math.abs(moved.cells[0].ring[0].x - metersToWorld(1)) < 1e-6)
  })
})

describe('vistas isométricas NE/NO/SE/SO efectivas', () => {
  it('cada iso proyecta distinto y solidsViewCamera centra la escena', () => {
    const pt = { x: 100, y: 40, zCota: 100 }
    const ne = projectWorld3dToCanvas(pt, 'iso-ne')
    const nw = projectWorld3dToCanvas(pt, 'iso-nw')
    const se = projectWorld3dToCanvas(pt, 'iso-se')
    const sw = projectWorld3dToCanvas(pt, 'iso-sw')
    const top = projectWorld3dToCanvas(pt, 'top')
    assert.notDeepEqual(ne, top)
    assert.notDeepEqual(ne, nw)
    assert.notDeepEqual(se, sw)
    assert.ok(Number.isFinite(ne.x) && Number.isFinite(ne.y))

    const solid = extrudeClosedEntity(rectAt(0, 0, 3.5, 3.5, 'v'), {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const camNe = solidsViewCamera('iso-ne', [solid])
    assert.ok(camNe)
    assert.ok(Number.isFinite(camNe.yaw) && Number.isFinite(camNe.pitch))
    assert.ok(camNe.center)
    const center = solidsOrbitCenter([solid])
    assert.ok(Math.abs(camNe.center.zCota - center.zCota) < 1e-9)

    const angles = orbitAnglesForView('iso-ne')
    const projected = projectWorld3dToCanvas(pt, 'iso-ne', 0, { ...angles, center })
    assert.ok(Number.isFinite(projected.x))

    // Superior sin giro libre: sin órbita (planta 1:1)
    assert.equal(solidsViewCamera('top', [solid], { orbitFree: false }), null)
    // Giro libre en superior: sí usa cámara
    assert.ok(solidsViewCamera('top', [solid], { orbitFree: true }))
  })

  it('refreshSolidFromSourceEntity mantiene volumen al reposicionar', () => {
    const ent = rectAt(0, 0, 3.5, 3.5, 'r')
    const solid = extrudeClosedEntity(ent, {
      viewId: 'top', cotaSuperior: 100, cotaInferior: 98,
    }).solid
    const moved = rectAt(5, 5, 3.5, 3.5, 'r')
    const r = refreshSolidFromSourceEntity(solid, moved)
    assert.equal(r.ok, true)
    assert.ok(Math.abs(solidVolumeM3(r.solid) - 24.5) < 1e-9)
    assert.equal(r.solid.sourceEntityId, 'r')
  })
})
