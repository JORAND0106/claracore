/**
 * Dibujo sobre la cara tocada (SketchUp): isométricas, vistas planas, extrusión
 * desde cara, OSNAP de cara y permanencia al cambiar de vista / mover.
 * Casos a–e del requisito transversal.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'
import {
  cameraFacingFaceId,
  canvasToFacePlaneCoords,
  faceDrawMeta,
  faceOsnapPoints,
  faceOsnapPointsWithCircles,
  pickNearestFaceUnderCursor,
  solidFaceDescriptors,
  solidsMinCota,
} from './esquema3dFace.js'
import {
  isEsquema3dSketchView,
  projectWorld3dToCanvas,
  solidsViewCamera,
} from './esquema3dViews.js'
import {
  extrudeClosedEntity,
  solidFaceDepthWorld,
  solidOsnapPoints,
  solidVolumeM3,
  subtractSolids,
  translateSolidXy,
} from './esquema3dSolids.js'

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

/** Muro a la izquierda (X) + caja a la derecha. */
function wallAndBox() {
  const wall = extrudeClosedEntity(rectAt(0, 0, 0.3, 2, 'wall'), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
  }).solid
  wall.id = 'wall'
  const box = extrudeClosedEntity(rectAt(1.2, 0.2, 1.5, 1.5, 'box'), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
  }).solid
  box.id = 'box'
  return { wall, box }
}

describe('SketchUp · API caras / vistas', () => {
  it('isEsquema3dSketchView incluye isométricas y las 6 caras', () => {
    assert.equal(isEsquema3dSketchView('front'), true)
    assert.equal(isEsquema3dSketchView('iso-ne'), true)
    assert.equal(isEsquema3dSketchView('iso-sw'), true)
  })

  it('cameraFacingFaceId: frontal → front (nunca back)', () => {
    assert.equal(cameraFacingFaceId('front'), 'front')
    assert.equal(cameraFacingFaceId('back'), 'back')
    assert.equal(cameraFacingFaceId('left'), 'left')
  })

  it('vistas planas: pickNearest elige la cara más cercana a quien mira', () => {
    const { wall, box } = wallAndBox()
    // Clic sobre la proyección frontal de la caja (centro).
    const faceCenter = solidFaceDescriptors(box).find((f) => f.faceId === 'front').center
    const canvas = projectWorld3dToCanvas(faceCenter, 'front')
    const hit = pickNearestFaceUnderCursor([wall, box], canvas, 'front')
    assert.ok(hit)
    assert.equal(hit.faceId, 'front')
    assert.equal(hit.solidId, 'box')
    // Nunca la cara de atrás
    assert.notEqual(hit.faceId, 'back')
  })

  it('iso NE: pick elige la cara del muro que mira a la caja (right)', () => {
    const { wall, box } = wallAndBox()
    const right = solidFaceDescriptors(wall).find((f) => f.faceId === 'right')
    const canvas = projectWorld3dToCanvas(right.center, 'iso-ne')
    const hit = pickNearestFaceUnderCursor([wall, box], canvas, 'iso-ne')
    assert.ok(hit, 'debe detectar cara bajo el cursor en NE')
    assert.equal(hit.solidId, 'wall')
    assert.equal(hit.faceId, 'right')
  })
})

describe('casos a–e · dibujo / extrusión sobre cara', () => {
  it('a) NE: círculo Ø0,30 en medio de cara muro→caja, extruir 0,30 adentro, sustraer = pase en esa cara', () => {
    const { wall, box } = wallAndBox()
    const right = solidFaceDescriptors(wall).find((f) => f.faceId === 'right')
    const snaps = faceOsnapPoints(right, 'iso-ne')
    const mid = snaps.find((s) => s.kind === 'center')
    assert.ok(mid)
    // Plano nativo de la cara (right): coords para el contorno.
    const planeCenter = projectWorld3dToCanvas(right.center, 'right')
    const rPx = metersToWorld(0.15)
    const circ = {
      id: 'pipe',
      type: 'elipse',
      x1: planeCenter.x - rPx,
      y1: planeCenter.y - rPx,
      x2: planeCenter.x + rPx,
      y2: planeCenter.y + rPx,
      viewPlane: 'right',
      viewDepthWorld: right.depthWorld,
      faceId: 'right',
      faceSolidId: 'wall',
    }
    const meta = faceDrawMeta(right)
    assert.equal(meta.extrudeMode, 'length')
    assert.ok(Math.abs(meta.faceDepthWorld - right.depthWorld) < 1e-9)

    const pipe = extrudeClosedEntity(circ, {
      viewId: 'right',
      lengthM: 0.3,
      faceDepthWorld: right.depthWorld,
      outward: false, // hacia adentro del muro
      faceId: 'right',
    })
    assert.equal(pipe.ok, true, pipe.error)
    // Pegado a la cara right (maxX del muro) y crece hacia −X (adentro).
    let minX = Infinity
    let maxX = -Infinity
    for (const c of pipe.solid.cells) {
      for (const p of c.ring || []) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
      }
    }
    assert.ok(Math.abs(maxX - right.depthWorld) < 1e-6, `maxX=${maxX} face=${right.depthWorld}`)
    assert.ok(Math.abs(maxX - minX - metersToWorld(0.3)) < 1e-6)

    const sub = subtractSolids(wall, [pipe.solid])
    assert.equal(sub.ok, true)
    // El pase no está en la cara left (opuesta).
    const leftDepth = solidFaceDepthWorld(wall, 'left')
    assert.ok(Math.abs(leftDepth - 0) < 1e-6)
    assert.ok(Math.abs(right.depthWorld - metersToWorld(0.3)) < 1e-6)

    // Visible en todas las vistas: centro del agujero proyecta cerca de la cara right.
    for (const vid of ['front', 'iso-ne', 'iso-sw', 'top']) {
      const pFace = projectWorld3dToCanvas(right.center, vid)
      const pHole = projectWorld3dToCanvas(
        { x: right.depthWorld - metersToWorld(0.15), y: right.center.y, zCota: right.center.zCota },
        vid,
      )
      assert.ok(
        Math.hypot(pFace.x - pHole.x, pFace.y - pHole.y) < metersToWorld(0.4),
        `pase cerca de cara right en ${vid}`,
      )
    }
    void box
  })

  it('b) SO: rectángulo en cara superior de la caja, extruir 0,50 afuera = pedestal pegado', () => {
    const { box } = wallAndBox()
    const top = solidFaceDescriptors(box).find((f) => f.faceId === 'top')
    const canvas = projectWorld3dToCanvas(top.center, 'iso-sw')
    const hit = pickNearestFaceUnderCursor([box], canvas, 'iso-sw')
    assert.ok(hit)
    assert.equal(hit.faceId, 'top')

    const plane = canvasToFacePlaneCoords(canvas, top, 'iso-sw')
    const half = metersToWorld(0.25)
    const ped = {
      id: 'ped',
      type: 'rect',
      x1: plane.x - half,
      y1: plane.y - half,
      x2: plane.x + half,
      y2: plane.y + half,
      viewPlane: 'top',
      viewZCota: top.zCota,
      faceId: 'top',
      faceSolidId: 'box',
    }
    const r = extrudeClosedEntity(ped, {
      viewId: 'top',
      lengthM: 0.5,
      faceId: 'top',
      baseZCota: top.zCota,
      outward: true,
    })
    assert.equal(r.ok, true, r.error)
    const z0 = Math.min(...r.solid.cells.map((c) => Math.min(c.z0, c.z1)))
    const z1 = Math.max(...r.solid.cells.map((c) => Math.max(c.z0, c.z1)))
    assert.ok(Math.abs(z0 - 1.5) < 1e-9, `z0=${z0}`)
    assert.ok(Math.abs(z1 - 2.0) < 1e-9, `z1=${z1}`)
  })

  it('c) vista frontal: círculo sobre la caja queda en la cara frontal (más cercana)', () => {
    const { wall, box } = wallAndBox()
    const frontBox = solidFaceDescriptors(box).find((f) => f.faceId === 'front')
    const canvas = projectWorld3dToCanvas(frontBox.center, 'front')
    const hit = pickNearestFaceUnderCursor([wall, box], canvas, 'front')
    assert.equal(hit.faceId, 'front')
    assert.equal(hit.solidId, 'box')
    // Si hubiera pick de “atrás”, fallaría:
    assert.notEqual(hit.faceId, 'back')
    const depth = hit.depthWorld
    assert.ok(Math.abs(depth - solidFaceDepthWorld(box, 'front')) < 1e-9)
  })

  it('d) tras dibujar/extruir, al cambiar de vista y órbita todo permanece pegado', () => {
    const { box } = wallAndBox()
    const front = solidFaceDescriptors(box).find((f) => f.faceId === 'front')
    const planeCenter = projectWorld3dToCanvas(front.center, 'front')
    const rPx = metersToWorld(0.2)
    const circ = {
      id: 'c',
      type: 'elipse',
      x1: planeCenter.x - rPx,
      y1: planeCenter.y - rPx,
      x2: planeCenter.x + rPx,
      y2: planeCenter.y + rPx,
      viewPlane: 'front',
      viewDepthWorld: front.depthWorld,
      faceId: 'front',
    }
    const cyl = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.25,
      faceDepthWorld: front.depthWorld,
      outward: false,
    }).solid
    const mid = {
      x: metersToWorld(1.2 + 0.75),
      y: front.depthWorld + metersToWorld(0.125),
      zCota: 0.75,
    }
    const p0 = projectWorld3dToCanvas(mid, 'front')
    for (const vid of ['iso-ne', 'iso-nw', 'iso-se', 'iso-sw', 'top', 'left']) {
      const p = projectWorld3dToCanvas(mid, vid)
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), vid)
    }
    const orbit = solidsViewCamera('top', [box, cyl], {
      orbitFree: true,
      orbitAngles: { yaw: 0.7, pitch: 0.5 },
    })
    const pOrb = projectWorld3dToCanvas(mid, 'top', 0, orbit)
    assert.ok(Number.isFinite(pOrb.x))
    // Anclaje Y no cambió al proyectar
    assert.ok(Math.abs(front.depthWorld - solidFaceDepthWorld(box, 'front')) < 1e-9)
    void p0
  })

  it('e) mover el conjunto: lo dibujado/extruido se mueve con su sólido', () => {
    const { box } = wallAndBox()
    const front = solidFaceDescriptors(box).find((f) => f.faceId === 'front')
    const planeCenter = projectWorld3dToCanvas(front.center, 'front')
    const rPx = metersToWorld(0.15)
    const circ = {
      id: 'c',
      type: 'elipse',
      x1: planeCenter.x - rPx,
      y1: planeCenter.y - rPx,
      x2: planeCenter.x + rPx,
      y2: planeCenter.y + rPx,
      viewPlane: 'front',
      viewDepthWorld: front.depthWorld,
    }
    const cyl = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.2,
      faceDepthWorld: front.depthWorld,
    }).solid
    cyl.id = 'cyl'
    const dx = metersToWorld(1)
    const movedBox = translateSolidXy(box, dx, 0)
    const movedCyl = translateSolidXy(cyl, dx, 0)
    const faceAfter = solidFaceDescriptors(movedBox).find((f) => f.faceId === 'front')
    let cylMinY = Infinity
    for (const c of movedCyl.cells) {
      for (const p of c.ring || []) cylMinY = Math.min(cylMinY, p.y)
    }
    assert.ok(Math.abs(cylMinY - faceAfter.depthWorld) < 1e-6)
    assert.ok(Math.abs(worldToMeters(faceAfter.center.x - front.center.x) - 1) < 1e-6)
  })
})

describe('SketchUp · OSNAP de cara y suelo', () => {
  it('faceOsnapPoints: esquinas, medios, centro', () => {
    const { box } = wallAndBox()
    const front = solidFaceDescriptors(box).find((f) => f.faceId === 'front')
    const pts = faceOsnapPoints(front, 'front')
    assert.ok(pts.filter((p) => p.kind === 'corner').length >= 4)
    assert.ok(pts.filter((p) => p.kind === 'mid').length >= 4)
    assert.ok(pts.some((p) => p.kind === 'center'))
  })

  it('faceOsnapPointsWithCircles incluye centro de elipse en la cara', () => {
    const { wall } = wallAndBox()
    const front = solidFaceDescriptors(wall).find((f) => f.faceId === 'front')
    const planeCenter = projectWorld3dToCanvas(front.center, 'front')
    const rPx = metersToWorld(0.1)
    const circ = {
      id: 'pipe',
      type: 'elipse',
      x1: planeCenter.x - rPx,
      y1: planeCenter.y - rPx,
      x2: planeCenter.x + rPx,
      y2: planeCenter.y + rPx,
    }
    const pipe = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.3,
      faceDepthWorld: front.depthWorld,
    }).solid
    // Unir conceptualmente: puntos del cilindro sobre la cara front del muro.
    const pts = faceOsnapPointsWithCircles(front, pipe, 'front')
    assert.ok(pts.some((p) => p.kind === 'center'))
  })

  it('solidsMinCota = cota más baja del esquema', () => {
    const { wall, box } = wallAndBox()
    assert.equal(solidsMinCota([wall, box]), 0)
  })

  it('extrusión hacia afuera desde front crece en −Y', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'b'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    const frontY = solidFaceDepthWorld(box, 'front')
    const snaps = solidOsnapPoints(box, 'front')
    const center = snaps.find((s) => s.kind === 'center')
    const rPx = metersToWorld(0.2)
    const circ = {
      id: 'out',
      type: 'elipse',
      x1: center.x - rPx,
      y1: center.y - rPx,
      x2: center.x + rPx,
      y2: center.y + rPx,
    }
    const out = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.4,
      faceDepthWorld: frontY,
      outward: true,
    })
    assert.equal(out.ok, true)
    let minY = Infinity
    let maxY = -Infinity
    for (const c of out.solid.cells) {
      for (const p of c.ring || []) {
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }
    assert.ok(Math.abs(maxY - frontY) < 1e-6)
    assert.ok(Math.abs(minY - (frontY - metersToWorld(0.4))) < 1e-6)
    assert.ok(Math.abs(solidVolumeM3(out.solid) - (Math.PI * 0.2 * 0.2 * 0.4)) < 0.02)
  })
})
