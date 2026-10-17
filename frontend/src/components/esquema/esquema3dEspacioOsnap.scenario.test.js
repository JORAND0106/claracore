/**
 * Espacio 3D único, adhesión a caras, OSNAP 3D y movimiento libre.
 * Casos a–d del requisito de Bitácora / iPad.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'
import {
  canvasDeltaToWorldMove,
  canvasToWorldOnViewPlane,
  depthAxisValueFromWorld,
  projectWorld3dToCanvas,
} from './esquema3dViews.js'
import {
  extrudeClosedEntity,
  inferFaceDepthForExtrude,
  solidFaceDepthWorld,
  solidOsnapPoints,
  solidVolumeM3,
  snapSolidMoveDelta,
  subtractSolids,
  translateSolidInView,
  translateSolid3d,
} from './esquema3dSolids.js'

function rectCanvas(x1, y1, x2, y2, id = 'r') {
  return { id, type: 'rect', x1, y1, x2, y2 }
}

function box150() {
  const ent = rectCanvas(0, 0, metersToWorld(1.5), metersToWorld(1.5), 'box')
  const r = extrudeClosedEntity(ent, {
    viewId: 'top',
    cotaSuperior: 1.5,
    cotaInferior: 0,
  })
  assert.equal(r.ok, true)
  r.solid.id = 'box'
  r.solid.color = '#2563eb'
  return r.solid
}

describe('espacio 3D · proyección / unproject', () => {
  it('canvasToWorldOnViewPlane front ancla Y = faceDepth', () => {
    const depth = metersToWorld(2)
    const w = canvasToWorldOnViewPlane(
      { x: metersToWorld(0.75), y: -metersToWorld(0.9) },
      'front',
      { faceDepthWorld: depth },
    )
    assert.ok(Math.abs(w.x - metersToWorld(0.75)) < 1e-9)
    assert.ok(Math.abs(w.y - depth) < 1e-9)
    assert.ok(Math.abs(w.zCota - 0.9) < 1e-9)
    const back = projectWorld3dToCanvas(w, 'front')
    assert.ok(Math.abs(back.x - metersToWorld(0.75)) < 1e-6)
  })

  it('canvasDeltaToWorldMove: frontal mueve X+cota, no Y', () => {
    const d = canvasDeltaToWorldMove(metersToWorld(0.5), -metersToWorld(0.2), 'front')
    assert.ok(Math.abs(d.dx - metersToWorld(0.5)) < 1e-9)
    assert.equal(d.dy, 0)
    assert.ok(Math.abs(d.dzCota - 0.2) < 1e-9)
  })

  it('depthAxisValueFromWorld coincide con cara', () => {
    assert.equal(depthAxisValueFromWorld({ x: 1, y: 7, zCota: 0 }, 'front'), 7)
    assert.equal(depthAxisValueFromWorld({ x: 3, y: 7, zCota: 0 }, 'left'), 3)
  })
})

describe('casos a–d · cara / OSNAP / mover', () => {
  it('a) caja 1,50³ + círculo frontal Ø0,90 extruido 0,20 queda pegado a la cara', () => {
    const box = box150()
    const frontY = solidFaceDepthWorld(box, 'front')
    assert.ok(Math.abs(frontY) < 1e-6) // minY = 0

    const snaps = solidOsnapPoints(box, 'front')
    const center = snaps.find((s) => s.kind === 'center')
    assert.ok(center)
    assert.ok(Number.isFinite(center.faceDepthWorld))
    assert.ok(Math.abs(center.faceDepthWorld - frontY) < 1e-6)

    const rPx = metersToWorld(0.45)
    const circ = {
      id: 'cyl',
      type: 'elipse',
      x1: center.x - rPx,
      y1: center.y - rPx,
      x2: center.x + rPx,
      y2: center.y + rPx,
      viewDepthWorld: center.faceDepthWorld,
      viewPlane: 'front',
    }
    const inferred = inferFaceDepthForExtrude(circ, [box], 'front')
    assert.ok(Math.abs(inferred.faceDepthWorld - frontY) < 1e-6)

    const cyl = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.2,
      faceDepthWorld: inferred.faceDepthWorld,
    })
    assert.equal(cyl.ok, true, cyl.error)
    // Pegado: la cara de arranque del cilindro en Y = cara frontal de la caja
    let minY = Infinity
    let maxY = -Infinity
    for (const c of cyl.solid.cells) {
      for (const p of c.ring || []) {
        minY = Math.min(minY, p.x, p.y) // also check x for left views; here depth is Y
        maxY = Math.max(maxY, p.y)
        minY = Math.min(minY, p.y)
      }
    }
    // Rebuild min/max Y properly
    minY = Infinity
    maxY = -Infinity
    for (const c of cyl.solid.cells) {
      for (const p of c.ring || []) {
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }
    assert.ok(Math.abs(minY - frontY) < 1e-6, `cyl minY ${minY} vs face ${frontY}`)
    assert.ok(Math.abs(maxY - (frontY + metersToWorld(0.2))) < 1e-6)

    // En NE el centro del cilindro proyecta cerca del centro de la cara
    const cylMid = {
      x: (circ.x1 + circ.x2) / 2,
      // world: along was canvas x; depth mid
      y: frontY + metersToWorld(0.1),
      zCota: 0.75,
    }
    // along for front = canvas x of center = box mid X = 0.75 m
    cylMid.x = metersToWorld(0.75)
    const pBox = projectWorld3dToCanvas(
      { x: metersToWorld(0.75), y: frontY, zCota: 0.75 },
      'iso-ne',
    )
    const pCyl = projectWorld3dToCanvas(cylMid, 'iso-ne')
    assert.ok(Math.hypot(pBox.x - pCyl.x, pBox.y - pCyl.y) < metersToWorld(0.15))
  })

  it('b) lateral izquierda: rect enganchado a vértice queda adherido', () => {
    const box = box150()
    const snaps = solidOsnapPoints(box, 'left')
    const corner = snaps.find((s) => s.kind === 'corner')
    assert.ok(corner)
    const depth = corner.faceDepthWorld
    assert.ok(Math.abs(depth - solidFaceDepthWorld(box, 'left')) < 1e-6)

    const profile = rectCanvas(
      corner.x,
      corner.y,
      corner.x + metersToWorld(0.4),
      corner.y - metersToWorld(0.3),
      'lat',
    )
    profile.viewDepthWorld = depth
    const inferred = inferFaceDepthForExtrude(profile, [box], 'left')
    assert.ok(Math.abs(inferred.faceDepthWorld - depth) < 1e-6)

    const r = extrudeClosedEntity(profile, {
      viewId: 'left',
      lengthM: 0.25,
      faceDepthWorld: inferred.faceDepthWorld,
    })
    assert.equal(r.ok, true)
    let minX = Infinity
    for (const c of r.solid.cells) {
      for (const p of c.ring || []) minX = Math.min(minX, p.x)
    }
    assert.ok(Math.abs(minX - depth) < 1e-6)
  })

  it('c) muro + círculo frontal sustraído = pase en el sitio', () => {
    const wallEnt = rectCanvas(0, 0, metersToWorld(2), metersToWorld(0.3), 'wall')
    const wall = extrudeClosedEntity(wallEnt, {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    wall.id = 'wall'
    const snaps = solidOsnapPoints(wall, 'front')
    const center = snaps.find((s) => s.kind === 'center')
    const rPx = metersToWorld(0.1)
    const circ = {
      id: 'pipe',
      type: 'elipse',
      x1: center.x - rPx,
      y1: center.y - rPx,
      x2: center.x + rPx,
      y2: center.y + rPx,
      viewDepthWorld: center.faceDepthWorld,
    }
    const pipe = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.3,
      faceDepthWorld: inferFaceDepthForExtrude(circ, [wall], 'front').faceDepthWorld,
    })
    assert.equal(pipe.ok, true)
    const sub = subtractSolids(wall, [pipe.solid])
    assert.equal(sub.ok, true)
    const pipeVol = Math.PI * 0.1 * 0.1 * 0.3
    assert.ok(Math.abs(solidVolumeM3(sub.solid) - (0.9 - pipeVol)) < 0.02)
  })

  it('d) mover libre en frontal (cambia cota) y OSNAP vértice a vértice', () => {
    const a = box150()
    a.id = 'a'
    const bEnt = rectCanvas(metersToWorld(3), 0, metersToWorld(4), metersToWorld(1), 'b')
    const b = extrudeClosedEntity(bEnt, {
      viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
    }).solid
    b.id = 'b'

    // Mover en frontal: ΔcanvasY negativo → sube cota
    const up = translateSolidInView(a, 0, -metersToWorld(0.5), 'front')
    const z0 = Math.min(...up.cells.map((c) => Math.min(c.z0, c.z1)))
    assert.ok(Math.abs(z0 - 0.5) < 1e-9, `z0=${z0}`)
    // Planta no cambió
    assert.ok(Math.abs(up.cells[0].ring[0].y - a.cells[0].ring[0].y) < 1e-9)

    // Mover en superior: solo XY
    const side = translateSolidInView(a, metersToWorld(1), 0, 'top')
    assert.ok(Math.abs(worldToMeters(side.cells[0].ring[0].x - a.cells[0].ring[0].x) - 1) < 1e-9)
    assert.equal(side.cells[0].z0, a.cells[0].z0)

    // OSNAP: acercar B al vértice de A
    const aSnaps = solidOsnapPoints(a, 'top')
    const cornerA = aSnaps.find((s) => s.kind === 'corner' || s.kind === 'end')
    assert.ok(cornerA)
    const bSnaps0 = solidOsnapPoints(b, 'top')
    const cornerB = bSnaps0.find((s) => s.kind === 'corner' || s.kind === 'end')
    // Simular drag: cursor lleva cornerB hacia cornerA
    const grab = { x: cornerB.x, y: cornerB.y }
    const cursor = { x: cornerA.x + 3, y: cornerA.y + 3 } // cerca
    const snapped = snapSolidMoveDelta({
      originSolid: b,
      solids: [a, b],
      viewId: 'top',
      grabCanvas: grab,
      cursorCanvas: cursor,
      threshold: metersToWorld(0.5),
    })
    assert.ok(snapped.snap, 'debe enganchar')
    const moved = translateSolidInView(b, snapped.dx, snapped.dy, 'top')
    const after = solidOsnapPoints(moved, 'top')
    const near = after.some((s) => Math.hypot(s.x - cornerA.x, s.y - cornerA.y) < 1e-6)
    assert.ok(near, 'vértice de B coincide con A')

    // translateSolid3d no cambia volumen
    const vol0 = solidVolumeM3(a)
    const shifted = translateSolid3d(a, { dx: 10, dy: -5, dzCota: 0.25 })
    assert.equal(solidVolumeM3(shifted), vol0)
  })
})
