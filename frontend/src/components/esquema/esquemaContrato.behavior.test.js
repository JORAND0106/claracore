/**
 * Contrato de comportamiento del esquema (CONTRATO_ESQUEMA.md).
 * Cada ID C-* tiene al menos una aserción. Bloquea regresiones / despliegue.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  linkedSourceEntityIds,
  solidFaceDepthWorld,
  solidOsnapPoints,
  solidVolumeM3,
  SOLID3D_STYLE,
  subtractSolids,
  translateSolidInView,
  translateSolidXy,
} from './esquema3dSolids.js'
import {
  canvasDeltaToWorldMove,
  ESQUEMA_3D_VIEWS,
  isEsquema3dDrawView,
  projectEntityToView,
  projectWorld3dToCanvas,
  solidsViewCamera,
} from './esquema3dViews.js'
import {
  filterObjectsFor3dDraw,
  linkedContoursHiddenInOrbit,
  shouldDrawLinkedContour2d,
} from './esquema3dEntityUnity.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  freezeCalcSnapshot,
  round2,
} from './esquema3dCalc.js'
import { memoriaDisplayRows } from './esquema3dCalcExport.js'
import {
  buildEsquemaDraftSnapshot,
  esquemaDraftIsDirty,
  esquemaDraftKey,
} from './esquemaDraft.js'

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

describe('contrato · documento', () => {
  it('CONTRATO_ESQUEMA.md existe y declara C-3D-04 entidad única', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-3D-04/)
    assert.match(md, /una sola entidad/i)
    assert.match(md, /C-OUT-02/)
    assert.match(md, /C-CALC-02/)
    assert.match(md, /C-2D-11/)
    assert.match(md, /C-2D-12/)
    assert.match(md, /C-CALC-05/)
    assert.match(md, /C-3D-14/)
    assert.match(md, /C-OUT-06/)
    assert.match(md, /C-3D-12/)
    assert.match(md, /Render limpio/i)
    assert.match(md, /C-3D-15/)
    assert.match(md, /pastel/i)
    assert.match(md, /C-3D-16/)
    assert.match(md, /Solevar/)
    assert.match(md, /esquemaCorreccionesZoomExcel/)
    assert.match(md, /esquemaRenderMemoriaPopup/)
    assert.match(md, /esquemaPastelRenderTabla/)
    assert.match(md, /esquemaSolevar/)
    // Regresiones pre-SketchUp (casos 5–7) deben figurar en el contrato.
    assert.match(md, /esquema3dRegresionPreSketchup/)
    assert.match(md, /círculo se ve como círculo/i)
    assert.match(md, /C-TX-03/)
    assert.match(md, /esquemaMobileLayout/)
    assert.match(md, /C-DES-07/)
    assert.match(md, /esquemaDespieceParrilla/)
    assert.match(md, /solo rol desarrollador/i)
    assert.match(md, /esquemaParrillaSoloDev/)
  })
})

describe('contrato · C-3D-02 / C-3D-03 vistas y espacio único', () => {
  it('seis caras dibujables + 4 isométricas', () => {
    const draw = ESQUEMA_3D_VIEWS.filter((v) => v.draw)
    assert.equal(draw.length, 6)
    assert.equal(ESQUEMA_3D_VIEWS.filter((v) => String(v.id).startsWith('iso-')).length, 4)
    assert.equal(isEsquema3dDrawView('front'), true)
  })

  it('proyección frontal y superior usan el mismo world X', () => {
    const pt = { x: metersToWorld(1.2), y: metersToWorld(0.4), zCota: 1.5 }
    const top = projectWorld3dToCanvas(pt, 'top')
    const front = projectWorld3dToCanvas(pt, 'front')
    assert.ok(Math.abs(top.x - front.x) < 1e-9)
  })
})

describe('contrato · C-3D-04 entidad única (regresión giro libre)', () => {
  it('contorno extruido no se dibuja en giro libre aunque esté seleccionado', () => {
    const ent = rectAt(0, 0, 1.5, 1.5, 'outer')
    const solid = extrudeClosedEntity(ent, {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    solid.id = 's-outer'
    const inner = rectAt(0.2, 0.2, 1.1, 1.1, 'inner')
    const objects = [ent, inner]
    const solids = [solid]

    assert.equal(linkedSourceEntityIds(solids).has('outer'), true)
    assert.equal(
      shouldDrawLinkedContour2d({
        mode3d: true, orbitFree: true, viewId: 'top', selected: true,
      }),
      false,
    )
    assert.equal(linkedContoursHiddenInOrbit(objects, solids), true)

    const visible = filterObjectsFor3dDraw(objects, solids, {
      mode3d: true,
      orbitFree: true,
      viewId: 'top',
      selectedIds: ['outer', 'inner'],
    })
    assert.ok(!visible.some((o) => o.id === 'outer'), 'contorno fuente oculto')
    assert.ok(visible.some((o) => o.id === 'inner'), 'contorno no extruido sigue (se proyecta)')

    // En superior ortográfica + seleccionado: sí manijas
    assert.equal(
      shouldDrawLinkedContour2d({
        mode3d: true, orbitFree: false, viewId: 'top', selected: true,
      }),
      true,
    )
    // Iso: nunca
    assert.equal(
      shouldDrawLinkedContour2d({
        mode3d: true, orbitFree: false, viewId: 'iso-ne', selected: true,
      }),
      false,
    )
  })

  it('2D no ligado se proyecta en órbita (no queda plano en pantalla)', () => {
    const inner = {
      ...rectAt(0.2, 0.2, 1.1, 1.1, 'inner'),
      viewPlane: 'top',
    }
    const solid = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    const orbit = solidsViewCamera('top', [solid], { orbitFree: true })
    assert.ok(orbit)
    const projected = projectEntityToView(inner, 'top', { orbit })
    // Tras proyectar con pitch≠90, el AABB no coincide 1:1 con planta cruda.
    assert.ok(
      projected.x1 !== inner.x1
      || projected.y1 !== inner.y1
      || projected.x2 !== inner.x2
      || projected.y2 !== inner.y2
      || (projected.points && projected.points.length),
      'debe remapease bajo órbita',
    )
  })

  it('volumen 1,50³ = 3,38 m³', () => {
    const s = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'b'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    assert.equal(round2(solidVolumeM3(s)), 3.38)
  })
})

describe('contrato · C-3D-05 / C-3D-06 / C-3D-09 extruir, cara, sustraer', () => {
  it('excavación 1,90×2,30×2,60 = 11,36 m³', () => {
    const s = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'exc'), {
      viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
    }).solid
    assert.equal(round2(solidVolumeM3(s)), 11.36)
  })

  it('poceta 1,50³ − vacío 1,10×1,10×1,30 = 1,81 m³', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    box.id = 'box'
    const inner = extrudeClosedEntity(rectAt(0.2, 0.2, 1.1, 1.1, 'in'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'in'
    assert.equal(round2(solidVolumeM3(box)), 3.38)
    assert.equal(round2(solidVolumeM3(inner)), 1.57)
    const r = subtractSolids(box, [inner])
    assert.equal(r.ok, true)
    assert.equal(round2(r.solid.volumeM3), 1.81)
  })

  it('muro + círculo frontal adherido a la cara (pase)', () => {
    const wall = extrudeClosedEntity(rectAt(0, 0, 2, 0.3, 'wall'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    wall.id = 'wall'
    const depth = solidFaceDepthWorld(wall, 'front')
    const center = solidOsnapPoints(wall, 'front').find((s) => s.kind === 'center')
    assert.ok(center)
    const rPx = metersToWorld(0.1)
    const circ = {
      id: 'pipe', type: 'elipse',
      x1: center.x - rPx, y1: center.y - rPx,
      x2: center.x + rPx, y2: center.y + rPx,
    }
    const pipe = extrudeClosedEntity(circ, {
      viewId: 'front', lengthM: 0.3, faceDepthWorld: depth,
    })
    assert.equal(pipe.ok, true)
    let minY = Infinity
    for (const c of pipe.solid.cells) {
      for (const p of c.ring || []) minY = Math.min(minY, p.y)
    }
    assert.ok(Math.abs(minY - depth) < 1e-6)
  })
})

describe('contrato · C-3D-07 mover sin cambiar dimensiones', () => {
  it('translateSolidXy conserva volumen y cotas; frontal mueve cota', () => {
    const s = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'm'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    const v0 = solidVolumeM3(s)
    const moved = translateSolidXy(s, metersToWorld(2), metersToWorld(-1))
    assert.equal(solidVolumeM3(moved), v0)
    assert.equal(moved.cells[0].z0, 0)
    assert.equal(moved.cells[0].z1, 1.5)
    const up = translateSolidInView(s, 0, -metersToWorld(0.5), 'front')
    assert.ok(Math.abs(Math.min(...up.cells.map((c) => c.z0)) - 0.5) < 1e-9)
    const d = canvasDeltaToWorldMove(10, 0, 'front')
    assert.equal(d.dy, 0)
  })
})

describe('contrato · C-3D-12 representación', () => {
  it('estilos: ocultas punteadas, fill semitransparente', () => {
    assert.ok(SOLID3D_STYLE.hiddenPx > 0)
    assert.ok(SOLID3D_STYLE.dashOnPx > 0)
    assert.ok(SOLID3D_STYLE.fillAlpha > 0 && SOLID3D_STYLE.fillAlpha < 0.5)
  })
})

describe('contrato · C-CALC / C-OUT memoria', () => {
  it('total = suma mostrada; fila neto sin medidas', () => {
    const exc = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'exc'), {
      viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
    }).solid
    exc.id = 'exc'
    const placa = extrudeClosedEntity(rectAt(0.2, 0.2, 1.0, 1.48, 'placa'), {
      viewId: 'top', cotaSuperior: 1.0, cotaInferior: 0,
    }).solid
    placa.id = 'placa'
    const box = extrudeClosedEntity(rectAt(0.4, 0.8, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    box.id = 'box'
    const inner = extrudeClosedEntity(rectAt(0.6, 1.0, 1.1, 1.1, 'in'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    const poc = subtractSolids(box, [inner])
    poc.solid.id = 'poceta'
    const calc = createVolumeCalc('POCETA')
    calc.lines = [
      createCalcLine({ solidId: 'exc', nombre: 'Excavación', op: 'sum' }),
      createCalcLine({
        solidId: 'placa', nombre: 'Placa', op: 'subtract', discountFromSolidId: 'exc',
      }),
      createCalcLine({
        solidId: 'poceta', nombre: 'Poceta', op: 'subtract', discountFromSolidId: 'exc',
      }),
    ]
    const solids = [exc, placa, poc.solid]
    assert.equal(round2(calcTotalM3(calc, solids)), 8.07)
    const snap = freezeCalcSnapshot(calc, solids)
    assert.equal(round2(snap.totalM3), 8.07)
    const neto = memoriaDisplayRows(snap).find((r) => r.isNetRow)
    assert.ok(neto)
    assert.equal(neto.detail.longM, null)
    assert.equal(neto.netOpLabel, '3 − 3.1')
  })
})

describe('contrato · C-OUT-05 borrador', () => {
  it('esquemaDraftKey e isDirty', () => {
    const key = esquemaDraftKey({
      module: 'bitacora', entityId: 'e1', userId: 'u1', contratoId: 1,
    })
    assert.match(key, /u1/)
    assert.equal(esquemaDraftIsDirty(buildEsquemaDraftSnapshot()), false)
    assert.equal(esquemaDraftIsDirty(buildEsquemaDraftSnapshot({
      objects: [{ id: 'a', type: 'rect', x1: 0, y1: 0, x2: 1, y2: 1 }],
    })), true)
  })
})
