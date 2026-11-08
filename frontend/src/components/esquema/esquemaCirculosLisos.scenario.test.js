/**
 * C-3D-12 / curvas: cilindros y elipses lisos, huecos redondos, volumen exacto, DXF CIRCLE.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { metersToWorld } from './esquemaGeometry.js'
import {
  CIRCLE_SEGMENTS,
  extrudeClosedEntity,
  solidVolumeM3,
  subtractSolids,
} from './esquema3dSolids.js'
import { loftBetweenContours } from './esquema3dLoft.js'
import { composeEsquemaDxf } from './esquemaExportDxf.js'
import {
  ellipseTubeMesh,
  ellipseTubeWorldRings,
  profileDrawAsDxfCircle,
} from './esquema3dCurves.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function circleFront(rM, id = 'cyl') {
  return {
    type: 'elipse',
    id,
    x1: metersToWorld(-rM),
    y1: metersToWorld(-rM),
    x2: metersToWorld(rM),
    y2: metersToWorld(rM),
  }
}

describe('C-3D-12 · círculos/elipses lisos + volumen exacto', () => {
  it('a) círculo r=0,55 frontal L=0,25 → volumen π r² L y profileDraw circular', () => {
    const r = 0.55
    const L = 0.25
    const exact = Math.PI * r * r * L
    const cyl = extrudeClosedEntity(circleFront(r), {
      viewId: 'front',
      lengthM: L,
      faceDepthWorld: 0,
    })
    assert.equal(cyl.ok, true)
    assert.ok(Math.abs(cyl.solid.volumeM3 - exact) < 1e-12)
    assert.equal(Math.round(cyl.solid.volumeM3 * 100) / 100, 0.24)
    assert.equal(cyl.solid.formMeta?.kind, 'cylinder')
    assert.ok(cyl.solid.profileDraw?.kind === 'ellipse_tube')
    assert.equal(cyl.solid.profileDraw.circular, true)
    assert.ok(cyl.solid.profileDraw.segments >= 64)
    // Malla de dibujo: anillos densos (no 8 losas visibles).
    const { ringA } = ellipseTubeWorldRings(cyl.solid.profileDraw)
    assert.ok(ringA.length >= 64)
    const mesh = ellipseTubeMesh(cyl.solid.profileDraw, { viewId: 'front' })
    assert.ok(mesh.faces.length >= 3)
    // Boolean sigue con bandas densas, pero el dibujo no usa esas losas.
    assert.equal(cyl.solid.cells.length, CIRCLE_SEGMENTS)
  })

  it('b) sustraer ese cilindro de un muro: ΔV = 0,24 y curveHoles', () => {
    const r = 0.55
    const L = 0.25
    const exact = Math.round(Math.PI * r * r * L * 100) / 100
    const cyl = extrudeClosedEntity(circleFront(r, 'pipe'), {
      viewId: 'front',
      lengthM: L,
      faceDepthWorld: 0,
    }).solid
    const wall = extrudeClosedEntity({
      type: 'rect',
      id: 'muro',
      x1: metersToWorld(-2),
      y1: metersToWorld(-0.05),
      x2: metersToWorld(2),
      y2: metersToWorld(0.30),
    }, {
      viewId: 'top',
      cotaSuperior: 1,
      cotaInferior: -1,
    }).solid
    const before = solidVolumeM3(wall)
    const sub = subtractSolids(wall, [cyl])
    assert.equal(sub.ok, true)
    assert.ok(sub.solid.curveHoles?.length >= 1)
    assert.equal(sub.solid.curveHoles[0].kind, 'ellipse_tube')
    assert.equal(sub.solid.curveHoles[0].circular, true)
    const delta = Math.round((before - solidVolumeM3(sub.solid)) * 100) / 100
    assert.equal(delta, exact)
  })

  it('c) elipse extruida + tronco de cono Solevar con anillos densos', () => {
    const ell = extrudeClosedEntity({
      type: 'elipse',
      id: 'ell',
      x1: metersToWorld(-0.8),
      y1: metersToWorld(-0.4),
      x2: metersToWorld(0.8),
      y2: metersToWorld(0.4),
    }, { viewId: 'front', lengthM: 0.5, faceDepthWorld: 0 })
    assert.equal(ell.ok, true)
    assert.equal(ell.solid.formMeta?.kind, 'elliptic_prism')
    assert.ok(ell.solid.profileDraw?.kind === 'ellipse_tube')
    assert.equal(ell.solid.profileDraw.circular, false)

    const base = {
      type: 'elipse',
      id: 'b',
      x1: metersToWorld(-1.5),
      y1: metersToWorld(-1.5),
      x2: metersToWorld(1.5),
      y2: metersToWorld(1.5),
    }
    const top = {
      type: 'elipse',
      id: 't',
      x1: metersToWorld(-0.75),
      y1: metersToWorld(-0.75),
      x2: metersToWorld(0.75),
      y2: metersToWorld(0.75),
    }
    const loft = loftBetweenContours(base, top, { cotaBase: 0, cotaTapa: 2 })
    assert.equal(loft.ok, true)
    assert.equal(loft.kind, 'cone_frustum')
    assert.ok(loft.solid.loftDraw?.curved)
    assert.ok((loft.solid.loftDraw.ringBase || []).length >= 64)
  })

  it('d) DXF del cilindro frontal incluye CIRCLE real', () => {
    const cyl = extrudeClosedEntity(circleFront(0.55), {
      viewId: 'front',
      lengthM: 0.25,
      faceDepthWorld: 0,
    }).solid
    assert.ok(profileDrawAsDxfCircle(cyl.profileDraw))
    const { dxf, validation } = composeEsquemaDxf({ solids3d: [cyl], objects: [] })
    assert.equal(validation.ok, true)
    assert.match(dxf, /\n0\nCIRCLE\n/)
  })

  it('contrato + wiring: profileDraw / curveHoles / CIRCLE_SEGMENTS', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /círculos? lisos|contorno completamente liso|profileDraw|curveHoles/i)
    assert.match(md, /C-3D-12/)
    const solids = readFileSync(join(__dirname, 'esquema3dSolids.js'), 'utf8')
    assert.match(solids, /profileDraw/)
    assert.match(solids, /curveHoles/)
    assert.match(solids, /drawEllipseTubeSolid|ellipseTubeMesh/)
    const pkg = readFileSync(join(__dirname, '../../../package.json'), 'utf8')
    assert.match(pkg, /esquemaCirculosLisos\.scenario\.test\.js/)
  })
})
