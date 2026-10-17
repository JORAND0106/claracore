/**
 * Regresiones bloqueantes tras retirar el cambio SketchUp (#939).
 * Garantiza los tres comportamientos que se rompieron en producción (Bitácora / iPad):
 * 1) Círculo visible como círculo en las seis vistas planas (no como línea).
 * 2) OSNAP al dibujar y al mover.
 * 3) Extruir: popup de cotas en superior; por longitud en las demás vistas de cara.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'
import {
  extrudeModeForView,
  isEsquema3dDrawView,
  projectEntityToView,
  projectWorld3dToCanvas,
} from './esquema3dViews.js'
import {
  extrudeClosedEntity,
  solidFaceDepthWorld,
  solidOsnapPoints,
  snapSolidMoveDelta,
  solidVolumeM3,
} from './esquema3dSolids.js'
import { alturaFromCotasText } from './esquema3dCalc.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PLANAR_VIEWS = ['top', 'bottom', 'front', 'back', 'left', 'right']

function circleInView(viewId, cx, cy, rM, id = 'c') {
  const r = metersToWorld(rM)
  return {
    id,
    type: 'elipse',
    x1: cx - r,
    y1: cy - r,
    x2: cx + r,
    y2: cy + r,
    viewPlane: viewId,
  }
}

function extent(ent) {
  return {
    w: Math.abs(ent.x2 - ent.x1),
    h: Math.abs(ent.y2 - ent.y1),
  }
}

describe('regresión · círculo como círculo en las 6 vistas planas', () => {
  it('en cada vista de cara, un círculo nativo tiene ambos ejes (no colapsa a línea)', () => {
    for (const vid of PLANAR_VIEWS) {
      const circ = circleInView(vid, metersToWorld(1), metersToWorld(-0.5), 0.3, `c-${vid}`)
      // Misma vista: sin remap; ambos ejes ~ Ø
      const shown = projectEntityToView(circ, vid)
      const { w, h } = extent(shown)
      const diam = metersToWorld(0.6)
      assert.ok(w > diam * 0.85, `${vid}: ancho colapsado w=${w}`)
      assert.ok(h > diam * 0.85, `${vid}: alto colapsado h=${h} (se vería como línea)`)
      assert.ok(Math.abs(w - h) / diam < 0.15, `${vid}: no es circular w=${w} h=${h}`)
    }
  })

  it('lateral izquierda: círculo Ø0,40 se extruye por longitud y conserva área de perfil', () => {
    const box = extrudeClosedEntity({
      id: 'box', type: 'rect',
      x1: 0, y1: 0, x2: metersToWorld(1.5), y2: metersToWorld(1.5),
    }, { viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0 }).solid
    box.id = 'box'
    const depth = solidFaceDepthWorld(box, 'left')
    const snaps = solidOsnapPoints(box, 'left')
    const center = snaps.find((s) => s.kind === 'center')
    assert.ok(center, 'OSNAP centro en lateral')
    const circ = circleInView('left', center.x, center.y, 0.2, 'pipe')
    circ.viewDepthWorld = depth
    const { w, h } = extent(circ)
    assert.ok(Math.abs(w - h) < 1e-6, 'círculo en lateral: ejes iguales')
    assert.equal(extrudeModeForView('left'), 'length')
    const r = extrudeClosedEntity(circ, {
      viewId: 'left',
      lengthM: 0.3,
      faceDepthWorld: depth,
    })
    assert.equal(r.ok, true, r.error)
    const expected = Math.PI * 0.2 * 0.2 * 0.3
    assert.ok(Math.abs(solidVolumeM3(r.solid) - expected) < 0.02)
  })
})

describe('regresión · OSNAP al dibujar y al mover', () => {
  it('solidOsnapPoints en vistas de cara incluye esquinas, medios y centro', () => {
    const box = extrudeClosedEntity({
      id: 'b', type: 'rect',
      x1: 0, y1: 0, x2: metersToWorld(1.5), y2: metersToWorld(1.5),
    }, { viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0 }).solid
    for (const vid of ['top', 'front', 'left']) {
      const pts = solidOsnapPoints(box, vid)
      assert.ok(pts.some((p) => p.kind === 'corner' || p.kind === 'end'), `${vid} corners`)
      assert.ok(pts.some((p) => p.kind === 'mid'), `${vid} mids`)
      assert.ok(pts.some((p) => p.kind === 'center'), `${vid} center`)
      assert.ok(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `${vid} coords`)
    }
  })

  it('snapSolidMoveDelta engancha vértice a vértice en planta', () => {
    const a = extrudeClosedEntity({
      id: 'a', type: 'rect',
      x1: 0, y1: 0, x2: metersToWorld(1), y2: metersToWorld(1),
    }, { viewId: 'top', cotaSuperior: 1, cotaInferior: 0 }).solid
    a.id = 'a'
    const b = extrudeClosedEntity({
      id: 'b', type: 'rect',
      x1: metersToWorld(3), y1: 0, x2: metersToWorld(4), y2: metersToWorld(1),
    }, { viewId: 'top', cotaSuperior: 1, cotaInferior: 0 }).solid
    b.id = 'b'
    const cornerA = solidOsnapPoints(a, 'top').find((s) => s.kind === 'corner' || s.kind === 'end')
    const cornerB = solidOsnapPoints(b, 'top').find((s) => s.kind === 'corner' || s.kind === 'end')
    assert.ok(cornerA && cornerB)
    const snapped = snapSolidMoveDelta({
      originSolid: b,
      solids: [a, b],
      viewId: 'top',
      grabCanvas: { x: cornerB.x, y: cornerB.y },
      cursorCanvas: { x: cornerA.x + 2, y: cornerA.y + 2 },
      threshold: 20,
    })
    assert.ok(snapped.snap, 'debe enganchar')
    assert.ok(Math.hypot(snapped.snap.x - cornerA.x, snapped.snap.y - cornerA.y) < 1e-6)
  })
})

describe('regresión · Extruir popup cotas (superior) y longitud (perfiles)', () => {
  it('extrudeModeForView: top/bottom = cotas; front/left/… = length', () => {
    assert.equal(extrudeModeForView('top'), 'cotas')
    assert.equal(extrudeModeForView('bottom'), 'cotas')
    assert.equal(extrudeModeForView('front'), 'length')
    assert.equal(extrudeModeForView('left'), 'length')
    assert.equal(extrudeModeForView('right'), 'length')
    assert.equal(extrudeModeForView('back'), 'length')
    assert.equal(isEsquema3dDrawView('top'), true)
    assert.equal(isEsquema3dDrawView('iso-ne'), false)
  })

  it('popup de cotas: altura calculada = cotaSup − cotaInf; extrusión superior OK', () => {
    assert.equal(alturaFromCotasText('100', '98'), 2)
    assert.equal(alturaFromCotasText('2.60', '0'), 2.6)
    const rect = {
      id: 'r', type: 'rect',
      x1: 0, y1: 0, x2: metersToWorld(1.9), y2: metersToWorld(2.3),
      viewPlane: 'top',
    }
    const r = extrudeClosedEntity(rect, {
      viewId: 'top',
      cotaSuperior: 2.6,
      cotaInferior: 0,
    })
    assert.equal(r.ok, true, r.error)
    assert.ok(Math.abs(solidVolumeM3(r.solid) - 11.362) < 0.02)
  })

  it('beginExtrude3d (modal) abre popup con mode = extrudeModeForView (cotas en superior)', () => {
    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    // No debe existir el flujo SketchUp que saltaba el popup de cotas.
    assert.doesNotMatch(src, /esquema3dFace/)
    assert.doesNotMatch(src, /extruir-drag/)
    assert.doesNotMatch(src, /isEsquema3dSketchView/)
    // beginExtrude3d usa extrudeModeForView y setExtrudePrompt({ mode, ... })
    assert.match(src, /const beginExtrude3d = useCallback/)
    assert.match(src, /const mode = extrudeModeForView\(viewId\)/)
    assert.match(src, /setExtrudePrompt\(\{\s*mode,/)
    // Popup UI distingue cotas vs longitud
    const ui = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    assert.match(ui, /Extruir por cotas/)
    assert.match(ui, /esquema-extruir-cota-sup/)
    assert.match(ui, /esquema-extruir-longitud/)
    assert.match(ui, /Altura calculada/)
  })
})

describe('regresión · no hay restos SketchUp que alteren el contrato', () => {
  it('CONTRATO no exige dibujo en isométricas ni C-3D-13 de cara tocada', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.doesNotMatch(md, /C-3D-13/)
    assert.doesNotMatch(md, /cara tocada/i)
    assert.doesNotMatch(md, /dibuje sobre la cara resaltada/i)
    assert.match(md, /C-3D-05/)
    assert.match(md, /C-3D-06/)
    assert.match(md, /esquema3dRegresionPreSketchup/)
  })

  it('proyección entre vistas no aplasta un círculo de perfil a línea en su vista nativa', () => {
    const circ = circleInView('front', metersToWorld(0.75), -metersToWorld(0.75), 0.3)
    circ.viewDepthWorld = 0
    const inFront = projectEntityToView(circ, 'front')
    const { w, h } = extent(inFront)
    assert.ok(w > metersToWorld(0.5) && h > metersToWorld(0.5))
    // En iso debe proyectarse (no quedarse plano idéntico sin profundidad de cara).
    const inIso = projectEntityToView(circ, 'iso-ne')
    const face = projectWorld3dToCanvas(
      { x: metersToWorld(0.75), y: 0, zCota: 0.75 },
      'iso-ne',
    )
    const cx = (inIso.x1 + inIso.x2) / 2
    const cy = (inIso.y1 + inIso.y2) / 2
    assert.ok(Math.hypot(cx - face.x, cy - face.y) < metersToWorld(0.35))
    void worldToMeters
  })
})
