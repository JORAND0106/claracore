import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyResizeHandle,
  applySoftOrtho,
  ellipseFromCenter,
  findSnap,
  formatMeters,
  getResizeHandles,
  getTransformHandles,
  hitResizeHandle,
  resizeHandleWorldSize,
  gridStepWorld,
  lastLineReferenceAngle,
  metersToWorld,
  parseDynMeasure,
  parsePositive,
  pointAtDistance,
  PX_PER_METER,
  scaleObjectUniform,
  SNAP_KIND_LABEL,
  SNAP_KINDS_FASE1,
  SOFT_ORTHO_TOLERANCE_DEG,
  clampZoom,
  landscapeExportSize,
  nodeMarkerWorldRadius,
  selectIdsInDrag,
  selectionRectFromDrag,
  MAX_ZOOM,
  MIN_ZOOM,
  worldToMeters,
} from './esquemaGeometry.js'
import { parseCoordCsv, parseCoordMatrix, topoToWorld } from './esquemaCoords.js'
import { hatchRasterScale } from './esquemaHatch.js'
import { instantiateLibraryItem, objectsBounds, packLibraryBlock } from './esquemaLibrary.js'

describe('esquemaGeometry', () => {
  it('parsePositive accepts comma decimals', () => {
    assert.equal(parsePositive('1,20'), 1.2)
    assert.equal(parsePositive(''), null)
    assert.equal(parsePositive('-3'), null)
  })

  it('resize se handle keeps opposite corner', () => {
    const origin = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 50 }
    const next = applyResizeHandle(origin, 'se', { x: 120, y: 80 })
    assert.equal(next.x1, 0)
    assert.equal(next.y1, 0)
    assert.equal(next.x2, 120)
    assert.equal(next.y2, 80)
  })

  it('0.20 m square: center is move, not resize; old world threshold was the bug', () => {
    // 0.20 m × 0.20 m = 10×10 world units (PX_PER_METER = 50)
    const square = { type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 }
    const zoom = 8
    const size = resizeHandleWorldSize(square, zoom)
    assert.ok(size <= 7 / zoom + 1e-9, 'handles stay ~7 px on screen')
    assert.ok(size < 3, 'handles stay smaller than the 0.20 m body')
    const grab = size * 0.5
    assert.equal(hitResizeHandle({ x: 5, y: 5 }, square, grab), null)
    assert.equal(hitResizeHandle({ x: 10, y: 10 }, square, grab)?.id, 'se')
    // Causa raíz previa: umbral 10/zoom (o 6.5 wu a 100 %) cubría el centro (a 5 wu del borde).
    const oldCenterHit = hitResizeHandle({ x: 5, y: 5 }, square, 10 * 0.65)
    assert.ok(oldCenterHit, 'the previous 10 wu threshold treated the body as a handle')
  })

  it('line handles are endpoints', () => {
    const handles = getResizeHandles({ type: 'linea', x1: 1, y1: 2, x2: 9, y2: 8 })
    assert.equal(handles.length, 2)
    assert.deepEqual(handles[0], { id: 'a', x: 1, y: 2 })
  })

  it('snaps to endpoint and midpoint', () => {
    const objs = [{ id: '1', type: 'linea', x1: 0, y1: 0, x2: 100, y2: 0 }]
    const end = findSnap({ x: 2, y: 3 }, objs, { threshold: 10 })
    assert.equal(end.kind, 'end')
    assert.equal(end.x, 0)
    const mid = findSnap({ x: 50, y: 4 }, objs, { threshold: 10 })
    assert.equal(mid.kind, 'mid')
    assert.equal(mid.x, 50)
  })

  it('snaps perpendicular foot from start point', () => {
    const objs = [{ id: '1', type: 'linea', x1: 0, y1: 0, x2: 100, y2: 0 }]
    const from = { x: 40, y: 30 }
    const hit = findSnap({ x: 42, y: 5 }, objs, { threshold: 12, fromPoint: from })
    assert.equal(hit.kind, 'perp')
    assert.equal(hit.x, 40)
    assert.equal(hit.y, 0)
  })

  it('nearest projects onto a segment when not at end/mid', () => {
    const objs = [{ id: '1', type: 'linea', x1: 0, y1: 0, x2: 100, y2: 0 }]
    const along = findSnap({ x: 33, y: 4 }, objs, { threshold: 8 })
    assert.ok(along)
    assert.equal(along.kind, 'near')
    assert.equal(Math.round(along.x), 33)
    const off = findSnap({ x: 33, y: 4 }, objs, { threshold: 8, allowNear: false })
    assert.equal(off, null)
  })

  it('snaps to ellipse center and quadrants', () => {
    const objs = [{ id: 'e', type: 'elipse', x1: 0, y1: 0, x2: 100, y2: 80 }]
    const center = findSnap({ x: 51, y: 41 }, objs, { threshold: 10 })
    assert.equal(center.kind, 'center')
    assert.equal(center.x, 50)
    assert.equal(center.y, 40)
    const east = findSnap({ x: 100, y: 41 }, objs, { threshold: 8 })
    assert.equal(east.kind, 'quad')
    assert.equal(east.x, 100)
    assert.equal(east.y, 40)
  })

  it('snaps to stroke vertices as node', () => {
    const objs = [{
      id: 's',
      type: 'stroke',
      points: [{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 40, y: 0 }],
    }]
    const node = findSnap({ x: 21, y: 11 }, objs, { threshold: 6 })
    assert.equal(node.kind, 'node')
    assert.equal(node.x, 20)
    assert.equal(node.y, 10)
  })

  it('soft ortho attracts within 8° and leaves intermediate angles free', () => {
    const from = { x: 0, y: 0 }
    const almostH = applySoftOrtho(from, { x: 100, y: 8 })
    assert.ok(almostH)
    assert.equal(almostH.kind, 'ortho')
    assert.equal(Math.round(almostH.y), 0)
    const diagonal = applySoftOrtho(from, { x: 80, y: 80 })
    assert.equal(diagonal, null)
    assert.equal(SOFT_ORTHO_TOLERANCE_DEG, 8)
  })

  it('soft ortho defaults to canvas axes, not the last line', () => {
    const from = { x: 0, y: 0 }
    // Quase horizontal respecto al lienzo, aunque la última línea sea diagonal
    const almostH = applySoftOrtho(from, { x: 100, y: 8 })
    assert.ok(almostH)
    assert.equal(Math.round(almostH.y), 0)
    // 45° respecto al lienzo: no atrae (el usuario quiere un ángulo intermedio)
    const diagonal = applySoftOrtho(from, { x: 80, y: 80 })
    assert.equal(diagonal, null)
    const last = lastLineReferenceAngle([{ id: '1', type: 'linea', x1: 0, y1: 0, x2: 10, y2: 10 }])
    assert.ok(Math.abs(last - Math.PI / 4) < 1e-6)
  })

  it('snaps to polyline vertices as node', () => {
    const objs = [{
      id: 'p',
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }],
    }]
    const node = findSnap({ x: 21, y: 1 }, objs, { threshold: 6 })
    assert.equal(node.kind, 'node')
    assert.equal(node.x, 20)
    assert.equal(node.y, 0)
  })

  it('converts meters to world units without changing PX_PER_METER contract', () => {
    assert.equal(PX_PER_METER, 50)
    assert.equal(metersToWorld(1), 50)
    assert.equal(worldToMeters(50), 1)
    assert.equal(formatMeters(125), '2.50 m')
  })

  it('parses CAD-style dynamic measure in meters', () => {
    assert.deepEqual(parseDynMeasure('2,5'), { w: 2.5, h: null })
    assert.deepEqual(parseDynMeasure('3x1.20'), { w: 3, h: 1.2 })
    assert.equal(parseDynMeasure(''), null)
    const dest = pointAtDistance({ x: 0, y: 0 }, { x: 100, y: 0 }, 2)
    assert.equal(dest.x, 100)
    assert.equal(dest.y, 0)
  })

  it('grid step grows when zoomed out', () => {
    assert.equal(gridStepWorld(2), PX_PER_METER * 0.1)
    assert.equal(gridStepWorld(1), PX_PER_METER)
    assert.ok(gridStepWorld(0.15) > PX_PER_METER)
  })

  it('keeps all Fase 1 osnap kinds and snaps rect center + polyline mid', () => {
    for (const kind of SNAP_KINDS_FASE1) {
      assert.ok(SNAP_KIND_LABEL[kind], kind)
    }
    const rect = findSnap({ x: 51, y: 26 }, [{
      id: 'r', type: 'rect', x1: 0, y1: 0, x2: 100, y2: 50,
    }], { threshold: 10 })
    assert.equal(rect.kind, 'center')
    assert.equal(rect.x, 50)
    const mid = findSnap({ x: 10, y: 1 }, [{
      id: 'p',
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }],
    }], { threshold: 6 })
    assert.equal(mid.kind, 'mid')
    assert.equal(mid.x, 10)
  })

  it('ignores snaps outside threshold', () => {
    const objs = [{ id: '1', type: 'linea', x1: 0, y1: 0, x2: 100, y2: 0 }]
    const hit = findSnap({ x: 20, y: 20 }, objs, { threshold: 6 })
    assert.equal(hit, null)
  })

  it('ellipse from center keeps the first point as center', () => {
    const box = ellipseFromCenter(10, 20, 40, 50)
    assert.equal((box.x1 + box.x2) / 2, 10)
    assert.equal((box.y1 + box.y2) / 2, 20)
    assert.equal(box.x2 - box.x1, 60)
    const circle = ellipseFromCenter(0, 0, 30, 40, { circle: true })
    assert.equal(Math.round((circle.x2 - circle.x1) / 2), 50)
    assert.equal(Math.round((circle.y2 - circle.y1) / 2), 50)
  })

  it('uniform scale keeps center and proportions', () => {
    const origin = { type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20 }
    const next = scaleObjectUniform(origin, 2, { x: 20, y: 10 })
    assert.equal(next.x1, -20)
    assert.equal(next.y1, -10)
    assert.equal(next.x2, 60)
    assert.equal(next.y2, 30)
    const handles = getTransformHandles(origin)
    assert.equal(handles.length, 2)
    assert.equal(handles[0].id, 'rotate')
    assert.equal(handles[1].id, 'scale')
  })

  it('snaps standalone nodes', () => {
    const hit = findSnap({ x: 11, y: 9 }, [{
      id: 'n1', type: 'nodo', x: 10, y: 10, nodeNum: '1',
    }], { threshold: 6 })
    assert.equal(hit.kind, 'node')
    assert.equal(hit.x, 10)
  })

  it('parses coordinate CSV with Norte/Este headers', () => {
    const rows = parseCoordCsv('Nodo,Norte,Este,Cota,Descripcion\n1,100,200,12,PT1\n2,110,205,12.5,PT2')
    assert.equal(rows.length, 2)
    assert.equal(rows[0].num, '1')
    assert.equal(rows[0].norte, 100)
    assert.equal(rows[0].este, 200)
    const world = topoToWorld(200, 100, { este0: 200, norte0: 100 })
    assert.equal(world.x, 0)
    assert.ok(Math.abs(world.y) < 1e-9)
    const north = topoToWorld(200, 110, { este0: 200, norte0: 100 })
    assert.equal(north.y, -10 * PX_PER_METER)
    const positional = parseCoordMatrix([['3', 5, 8, 1, 'A']])
    assert.equal(positional[0].norte, 5)
    assert.equal(positional[0].este, 8)
  })

  it('CAD window contains fully and crossing intersects', () => {
    const objs = [
      { id: 'in', type: 'rect', x1: 10, y1: 10, x2: 20, y2: 20 },
      { id: 'partial', type: 'rect', x1: 25, y1: 10, x2: 45, y2: 20 },
      { id: 'out', type: 'rect', x1: 80, y1: 80, x2: 90, y2: 90 },
    ]
    const windowIds = selectIdsInDrag(objs, { x: 0, y: 0 }, { x: 30, y: 30 })
    assert.deepEqual(windowIds, ['in'])
    const crossingIds = selectIdsInDrag(objs, { x: 30, y: 0 }, { x: 0, y: 30 })
    assert.ok(crossingIds.includes('in'))
    assert.ok(crossingIds.includes('partial'))
    assert.ok(!crossingIds.includes('out'))
    assert.equal(selectionRectFromDrag({ x: 30, y: 0 }, { x: 0, y: 30 }).crossing, true)
  })

  it('node marker stays ~screen-sized when zoomed in', () => {
    const z = 10
    const r = nodeMarkerWorldRadius(z)
    assert.ok(r <= 2.6 / z + 1e-9)
    assert.ok(r < 4, 'old floor of 4 wu no longer applies at high zoom')
  })

  it('export canvas is always landscape', () => {
    const portrait = landscapeExportSize(400, 900)
    assert.ok(portrait.w >= portrait.h)
    assert.equal(portrait.h, 900)
    const already = landscapeExportSize(1200, 700)
    assert.equal(already.w, 1200)
  })

  it('clamps zoom well above 400%', () => {
    assert.equal(clampZoom(1), 1)
    assert.equal(clampZoom(4), 4)
    assert.equal(clampZoom(40), MAX_ZOOM)
    assert.equal(clampZoom(999), MAX_ZOOM)
    assert.equal(clampZoom(0.01), MIN_ZOOM)
    assert.ok(MAX_ZOOM >= 20)
  })

  it('hatch raster scale stays within pixel budget', () => {
    assert.equal(hatchRasterScale(10, 10), 4)
    const s = hatchRasterScale(3000, 3000)
    assert.ok(s < 1)
    assert.ok(3000 * 3000 * s * s <= 4_000_000 + 1)
  })

  it('block scales all children together', () => {
    const block = {
      type: 'bloque', x: 0, y: 0, w: 100, h: 50,
      children: [{ type: 'linea', x1: 0, y1: 0, x2: 100, y2: 0 }],
    }
    const next = scaleObjectUniform(block, 2, { x: 50, y: 25 })
    assert.equal(next.w, 200)
    assert.equal(next.h, 100)
    assert.equal(next.children[0].x2, 200)
  })

  it('library insert places a single cohesive block', () => {
    const item = {
      objects: [
        { id: 'a', type: 'linea', x1: 0, y1: 0, x2: 100, y2: 0 },
        { id: 'b', type: 'linea', x1: 0, y1: 0, x2: 0, y2: 50 },
      ],
    }
    const packed = packLibraryBlock(item.objects)
    assert.equal(packed.children.length, 2)
    const placed = instantiateLibraryItem(item, { x: 200, y: 80 })
    assert.equal(placed.length, 1)
    assert.equal(placed[0].type, 'bloque')
    assert.equal(placed[0].children.length, 2)
    const bb = objectsBounds(placed)
    assert.equal(Math.round((bb.minX + bb.maxX) / 2), 200)
    assert.equal(Math.round((bb.minY + bb.maxY) / 2), 80)
    assert.notEqual(placed[0].id, 'a')
  })

  it('texto resize keeps opposite corner', () => {
    const origin = { type: 'texto', x: 10, y: 20, w: 100, h: 40, text: 'Hi' }
    const next = applyResizeHandle(origin, 'se', { x: 150, y: 90 })
    assert.equal(next.x, 10)
    assert.equal(next.y, 20)
    assert.equal(next.w, 140)
    assert.equal(next.h, 70)
    const handles = getResizeHandles(origin)
    assert.equal(handles.length, 8)
  })
})
