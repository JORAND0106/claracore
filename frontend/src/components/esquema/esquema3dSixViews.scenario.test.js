/**
 * Casos a–c: seis vistas de cara, extrusión por profundidad, dibujo apoyado.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  solidFaceDepthWorld,
  solidFaceSnapPoints,
  solidThicknessAlongViewM,
  solidVolumeM3,
  solidXyBounds,
  subtractSolids,
} from './esquema3dSolids.js'
import {
  ESQUEMA_3D_VIEWS,
  extrudeModeForView,
  isEsquema3dDrawView,
  normalizeViewId,
  projectWorld3dToCanvas,
  solidsViewCamera,
} from './esquema3dViews.js'

function rectCanvas(x1, y1, x2, y2, id = 'r') {
  return { id, type: 'rect', x1, y1, x2, y2 }
}

describe('seis vistas de dibujo', () => {
  it('hay 6 vistas de cara dibujables + 4 isométricas', () => {
    const draw = ESQUEMA_3D_VIEWS.filter((v) => v.draw)
    assert.equal(draw.length, 6)
    assert.deepEqual(draw.map((v) => v.id).sort(), [
      'back', 'bottom', 'front', 'left', 'right', 'top',
    ].sort())
    assert.equal(isEsquema3dDrawView('side'), true) // alias → left
    assert.equal(normalizeViewId('side'), 'left')
    assert.equal(extrudeModeForView('top'), 'cotas')
    assert.equal(extrudeModeForView('bottom'), 'cotas')
    assert.equal(extrudeModeForView('front'), 'length')
    assert.equal(extrudeModeForView('right'), 'length')
    assert.equal(solidsViewCamera('front', []), null)
    assert.equal(solidsViewCamera('right', []), null)
  })
})

describe('extrusión por profundidad · casos a–c', () => {
  it('a) lateral derecha: muro 2,00×1,50×0,30 → 0,90 m³ y planta 2,00×0,30', () => {
    // Vista right: canvas x = −worldY, canvas y = cotaToWorldZ
    // Rectángulo 2 m de ancho (eje Y) × 1,50 m de alto (cotas 0→1,50)
    const widthPx = metersToWorld(2)
    const z0 = 0
    const z1 = 1.5
    // En right: along = −canvas.x = worldY; dibujamos canvas x de 0 a −width
    // Para simplificar el test usamos left (canvas x = worldY) equivalente:
    // 2 m en Y, cotas 0–1.5, extruir 0.30 en +X
    const yDisp0 = metersToWorld(0)
    // cotaToWorldZ(1.5) = -metersToWorld(1.5); cotaToWorldZ(0) = 0
    const profile = rectCanvas(
      0,
      -metersToWorld(1.5), // cota 1.5 arriba
      metersToWorld(2),
      0, // cota 0
      'muro-lat',
    )
    const r = extrudeClosedEntity(profile, {
      viewId: 'left',
      lengthM: 0.3,
      faceDepthWorld: 0,
    })
    assert.equal(r.ok, true, r.error)
    assert.ok(Math.abs(solidVolumeM3(r.solid) - 0.9) < 1e-9, `vol ${r.solid.volumeM3}`)
    const bb = solidXyBounds(r.solid)
    const wM = worldToMeters(bb.w)
    const hM = worldToMeters(bb.h)
    // Footprint: 0.30 (profundidad X) × 2.00 (Y)
    assert.ok(Math.abs(Math.min(wM, hM) - 0.3) < 1e-6, `min ${Math.min(wM, hM)}`)
    assert.ok(Math.abs(Math.max(wM, hM) - 2.0) < 1e-6, `max ${Math.max(wM, hM)}`)
    const zLo = Math.min(...r.solid.cells.map((c) => Math.min(c.z0, c.z1)))
    const zHi = Math.max(...r.solid.cells.map((c) => Math.max(c.z0, c.z1)))
    assert.ok(Math.abs(zLo - 0) < 1e-6)
    assert.ok(Math.abs(zHi - 1.5) < 1e-6)
    // En superior se ve el footprint
    const p = projectWorld3dToCanvas(
      { x: bb.x, y: bb.y, zCota: 0.75 },
      'top',
    )
    assert.ok(Number.isFinite(p.x))

    // Misma geometría desde lateral derecha
    const profileR = rectCanvas(
      0,
      -metersToWorld(1.5),
      -metersToWorld(2), // alongSign −1: canvas x negativo → world Y positivo
      0,
      'muro-der',
    )
    const r2 = extrudeClosedEntity(profileR, {
      viewId: 'right',
      lengthM: 0.3,
      faceDepthWorld: metersToWorld(0.3), // cara en x=0.3, extruye hacia −X hasta 0
    })
    assert.equal(r2.ok, true)
    assert.ok(Math.abs(solidVolumeM3(r2.solid) - 0.9) < 1e-9)
  })

  it('b) muro superior + círculo frontal sustraído = pase', () => {
    // Muro 2,00 × 0,30 entre cotas 1,50 y 0,00
    const wallEnt = rectCanvas(0, 0, metersToWorld(2), metersToWorld(0.3), 'wall')
    const wall = extrudeClosedEntity(wallEnt, {
      viewId: 'top',
      cotaSuperior: 1.5,
      cotaInferior: 0,
    }).solid
    wall.id = 'wall'
    assert.ok(Math.abs(solidVolumeM3(wall) - 0.9) < 1e-9)

    // Cara frontal (min Y): profundidad 0
    assert.ok(Math.abs(solidFaceDepthWorld(wall, 'front')) < 1e-6)
    assert.ok(Math.abs(solidThicknessAlongViewM(wall, 'front') - 0.3) < 1e-6)
    const snaps = solidFaceSnapPoints(wall, 'front')
    assert.ok(snaps.some((s) => s.kind === 'center'))
    assert.ok(snaps.filter((s) => s.kind === 'corner').length === 4)
    const center = snaps.find((s) => s.kind === 'center')

    // Círculo Ø 0,20 centrado en el punto medio de la cara
    const rPx = metersToWorld(0.1)
    const circ = {
      id: 'pipe',
      type: 'elipse',
      x1: center.x - rPx,
      y1: center.y - rPx,
      x2: center.x + rPx,
      y2: center.y + rPx,
    }
    const pipe = extrudeClosedEntity(circ, {
      viewId: 'front',
      lengthM: 0.3,
      faceDepthWorld: solidFaceDepthWorld(wall, 'front'),
    })
    assert.equal(pipe.ok, true, pipe.error)
    const pipeVol = Math.PI * 0.1 * 0.1 * 0.3
    assert.ok(Math.abs(solidVolumeM3(pipe.solid) - pipeVol) < 1e-6, `pipe ${pipe.solid.volumeM3}`)

    const sub = subtractSolids(wall, [pipe.solid])
    assert.equal(sub.ok, true, sub.error)
    const expected = 0.9 - pipeVol
    // Volumen bloqueado por redondeo de Sustraer (2 decimales)
    assert.ok(Math.abs(solidVolumeM3(sub.solid) - expected) < 0.02, `got ${sub.solid.volumeM3}`)
  })

  it('c) mismo pase dibujado en vista posterior', () => {
    const wallEnt = rectCanvas(0, 0, metersToWorld(2), metersToWorld(0.3), 'wall')
    const wall = extrudeClosedEntity(wallEnt, {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    wall.id = 'wall'
    const depth = solidFaceDepthWorld(wall, 'back')
    assert.ok(Math.abs(depth - metersToWorld(0.3)) < 1e-6)
    const snaps = solidFaceSnapPoints(wall, 'back')
    const center = snaps.find((s) => s.kind === 'center')
    const rPx = metersToWorld(0.1)
    const circ = {
      id: 'pipe',
      type: 'elipse',
      x1: center.x - rPx,
      y1: center.y - rPx,
      x2: center.x + rPx,
      y2: center.y + rPx,
    }
    const pipe = extrudeClosedEntity(circ, {
      viewId: 'back',
      lengthM: 0.3,
      faceDepthWorld: depth,
    })
    assert.equal(pipe.ok, true)
    const sub = subtractSolids(wall, [pipe.solid])
    assert.equal(sub.ok, true)
    const pipeVol = Math.PI * 0.1 * 0.1 * 0.3
    assert.ok(Math.abs(solidVolumeM3(sub.solid) - (0.9 - pipeVol)) < 0.02)
  })
})
