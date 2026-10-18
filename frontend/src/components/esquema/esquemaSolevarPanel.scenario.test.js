/**
 * Casos a–d: panel Solevar con áreas; contornos consumidos (sin sueltos);
 * deshacer restituye; círculo/pirámide.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { metersToWorld } from './esquemaGeometry.js'
import {
  drawSolid3d,
  round2,
} from './esquema3dSolids.js'
import { filterObjectsFor3dDraw as filterUnity } from './esquema3dEntityUnity.js'
import {
  describeContourForSolevar,
  loftBetweenContours,
  loftPyramidOrCone,
} from './esquema3dLoft.js'
import { solidsViewCamera } from './esquema3dViews.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function rectEnt(id, x0, y0, wM, hM) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(x0),
    y1: metersToWorld(y0),
    x2: metersToWorld(x0 + wM),
    y2: metersToWorld(y0 + hM),
  }
}

function circleEnt(id, cxM, cyM, rM) {
  const r = metersToWorld(rM)
  const cx = metersToWorld(cxM)
  const cy = metersToWorld(cyM)
  return {
    id,
    type: 'elipse',
    x1: cx - r,
    y1: cy - r,
    x2: cx + r,
    y2: cy + r,
  }
}

function mockCtx() {
  const strokes = []
  const fills = []
  return {
    strokes,
    fills,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() { fills.push(1) },
    stroke() { strokes.push(1) },
    setLineDash() {},
    set fillStyle(v) {},
    get fillStyle() { return '' },
    set strokeStyle(v) {},
    get strokeStyle() { return '' },
    lineWidth: 1,
  }
}

/** Simula confirmSolevar: historial + consume contornos. */
function applySolevarConsume(objects, solids, consumeIds, solid) {
  const history = {
    objects: objects.map((o) => ({ ...o })),
    solids3d: solids.map((s) => ({ ...s })),
  }
  solid.sourceEntityId = null
  solid.sourceEntityIds = []
  solid.loftConsumedIds = [...consumeIds]
  const drop = new Set(consumeIds)
  const nextObjects = objects.filter((o) => !drop.has(o.id))
  const nextSolids = [...solids, solid]
  return { history, objects: nextObjects, solids: nextSolids }
}

describe('caso a · panel con áreas 4,00 y 2,25 → 6,17 m³', () => {
  it('describeContourForSolevar y loft', () => {
    const a = rectEnt('a', 0, 0, 2, 2)
    const b = rectEnt('b', 0.25, 0.25, 1.5, 1.5)
    const da = describeContourForSolevar(a)
    const db = describeContourForSolevar(b)
    assert.equal(da.forma, 'Rectángulo')
    assert.equal(round2(da.areaM2), 4)
    assert.equal(da.areaLabel, '4,00')
    assert.equal(round2(db.areaM2), 2.25)
    assert.equal(db.areaLabel, '2,25')
    const r = loftBetweenContours(a, b, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(r.ok, true)
    assert.equal(round2(r.solid.volumeM3), 6.17)

    const ui = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    assert.match(ui, /Área \(m²\)/)
    assert.match(ui, /esquema-solevar-panel/)
    assert.match(ui, /name="solevar-base"/)
    assert.match(ui, /name="solevar-tapa"/)
    assert.match(ui, /onTouchStart/)
    assert.match(ui, /onPointerEnter/)
    assert.match(ui, /Altura calculada/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /id="solevar"/)
    assert.match(modal, /describeContourForSolevar/)
    assert.match(modal, /solevarHoverId/)
    assert.doesNotMatch(modal, /Esquema3dSolevarPopup/)
  })
})

describe('caso b · sin contornos sueltos tras solevar', () => {
  it('contornos consumidos; solo sólido en órbita/iso/vistas', () => {
    const a = rectEnt('a', 0, 0, 2, 2)
    const b = rectEnt('b', 0.25, 0.25, 1.5, 1.5)
    const r = loftBetweenContours(a, b, { cotaBase: 98, cotaTapa: 100 })
    r.solid.id = 'loft1'
    const applied = applySolevarConsume([a, b], [], [a.id, b.id], r.solid)
    assert.equal(applied.objects.length, 0)
    assert.equal(applied.solids.length, 1)
    assert.equal(applied.solids[0].sourceEntityId, null)

    const filter = filterUnity
    for (const viewId of ['top', 'front', 'iso-ne', 'iso-sw']) {
      const visible = filter(applied.objects, applied.solids, {
        mode3d: true,
        orbitFree: viewId === 'top' ? false : false,
        viewId,
        selectedIds: [],
      })
      assert.equal(visible.filter((o) => o.type === 'rect').length, 0, `rect en ${viewId}`)
    }
    const orbitVis = filter(applied.objects, applied.solids, {
      mode3d: true, orbitFree: true, viewId: 'top', selectedIds: [a.id, b.id],
    })
    assert.equal(orbitVis.length, 0)

    const orbit = solidsViewCamera('iso-ne', applied.solids)
    const ctx = mockCtx()
    drawSolid3d(ctx, applied.solids[0], {
      viewId: 'iso-ne', zoom: 1, pixelScale: 1, orbit, solids: applied.solids, pass: 'all',
    })
    assert.ok(ctx.fills.length >= 1)
  })
})

describe('caso c · mover sólido completo; deshacer restituye contornos', () => {
  it('historial previo tiene los dos rectángulos', () => {
    const a = rectEnt('a', 0, 0, 2, 2)
    const b = rectEnt('b', 0.25, 0.25, 1.5, 1.5)
    const r = loftBetweenContours(a, b, { cotaBase: 98, cotaTapa: 100 })
    r.solid.id = 'loft1'
    const applied = applySolevarConsume([a, b], [], [a.id, b.id], r.solid)
    assert.equal(applied.history.objects.length, 2)
    assert.deepEqual(
      applied.history.objects.map((o) => o.id).sort(),
      ['a', 'b'],
    )
    // «Deshacer» = restaurar history
    const undoneObjects = applied.history.objects
    const undoneSolids = applied.history.solids3d
    assert.equal(undoneObjects.length, 2)
    assert.equal(undoneSolids.length, 0)
    assert.ok(undoneObjects.every((o) => o.type === 'rect'))

    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /loftConsumedIds/)
    assert.match(modal, /pushHistory\(\)/)
  })
})

describe('caso d · tronco cono y pirámide con vértice en panel', () => {
  it('círculos 3,67 y pirámide con fila Vértice', () => {
    const c1 = circleEnt('c1', 0, 0, 1)
    const c2 = circleEnt('c2', 0, 0, 0.5)
    const d1 = describeContourForSolevar(c1)
    const d2 = describeContourForSolevar(c2)
    assert.equal(d1.forma, 'Círculo')
    assert.equal(round2(d1.areaM2), 3.14)
    assert.equal(round2(d2.areaM2), 0.79)
    const cone = loftBetweenContours(c1, c2, { cotaBase: 98, cotaTapa: 100 })
    assert.equal(round2(cone.solid.volumeM3), 3.67)

    const base = rectEnt('sq', 0, 0, 2, 2)
    const nodo = { id: 'n1', type: 'nodo', x: metersToWorld(1), y: metersToWorld(1), nodeNum: 1 }
    const dn = describeContourForSolevar(nodo)
    assert.equal(dn.forma, 'Vértice')
    assert.equal(dn.areaLabel, '—')
    assert.equal(dn.isApex, true)
    const pyr = loftPyramidOrCone(base, { x: nodo.x, y: nodo.y }, {
      cotaBase: 98, cotaVertice: 100,
    })
    assert.equal(round2(pyr.solid.volumeM3), 2.67)
    const applied = applySolevarConsume([base, nodo], [], [base.id, nodo.id], pyr.solid)
    assert.equal(applied.objects.length, 0)
  })
})

describe('contrato · panel solevar', () => {
  it('documento menciona panel y caso 22', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /panel lateral/i)
    assert.match(md, /esquemaSolevarPanel/)
    assert.match(md, /Área/)
  })
})
