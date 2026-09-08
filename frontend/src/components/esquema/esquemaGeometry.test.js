import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyResizeHandle,
  applySoftOrtho,
  applySoftOrthoAngle,
  arrowHeadLength,
  cotaLayout,
  degToRad,
  ellipseFromCenter,
  findSnap,
  snapMoveDelta,
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
  snapMarkerScreenSize,
  snapThresholdWorld,
  SNAP_MARKER_MIN_PX,
  SNAP_MARKER_MAX_PX,
  nearestResizeHandle,
  rotateObjectAroundPivot,
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
    const nearest = nearestResizeHandle({ x: 5, y: 5 }, square)
    assert.ok(nearest, 'Dimensionar from the body still picks a handle')
  })

  it('findSnap on a 0.20 m square vertex is exact (no coordinate conversion drift)', () => {
    const square = [{ id: 'a', type: 'rect', x1: 0, y1: 0, x2: metersToWorld(0.2), y2: metersToWorld(0.2) }]
    const se = { x: metersToWorld(0.2), y: metersToWorld(0.2) }
    const hit = findSnap({ x: se.x - 1.2, y: se.y - 1.1 }, square, { threshold: 6.5 })
    assert.equal(hit.kind, 'end')
    assert.equal(hit.x, se.x)
    assert.equal(hit.y, se.y)
  })

  it('move snap: 0.20 m vertex lands on target; cursor-anchored move inherited the grab offset', () => {
    const moving = [{ id: 'a', type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 }]
    const others = [{ id: 'b', type: 'rect', x1: 50, y1: 0, x2: 80, y2: 20 }]
    const rawClick = { x: 7.5, y: 7.5 }
    const grab = findSnap(rawClick, moving, { threshold: 6.5, allowNear: false })
    assert.equal(grab.x, 10)
    assert.equal(grab.y, 10)
    const cursor = { x: 51, y: 1 }
    const threshold = 6.5

    const naive = findSnap(cursor, others, { threshold })
    assert.equal(naive.x, 50)
    assert.equal(naive.y, 0)
    const naiveSE = { x: 10 + (naive.x - rawClick.x), y: 10 + (naive.y - rawClick.y) }
    assert.equal(naiveSE.x, 52.5)
    assert.equal(naiveSE.y, 2.5)

    const moved = snapMoveDelta(cursor, grab, moving, others, threshold)
    assert.equal(10 + moved.dx, 50)
    assert.equal(10 + moved.dy, 0)
    assert.equal(moved.snap.x, 50)
    assert.equal(moved.snap.y, 0)
  })

  it('1.00 m line: old 6.5 px aperture missed Endpoint under the visible marker', () => {
    const line = [{ id: 'L', type: 'linea', x1: 0, y1: 0, x2: metersToWorld(1), y2: 0 }]
    const end = { x: metersToWorld(1), y: 0 }
    const zoom = 2
    const oldThresh = 6.5 / zoom
    const click = { x: end.x - 5, y: 0 }
    const oldHit = findSnap(click, line, { threshold: oldThresh, allowNear: false })
    assert.equal(oldHit, null, '6.5 px screen aperture misses a click inside the 13 px marker')
    const hit = findSnap(click, line, { threshold: snapThresholdWorld(zoom), allowNear: false })
    assert.equal(hit.kind, 'end')
    assert.equal(hit.x, end.x)
    assert.equal(hit.y, end.y)
    const target = [{ id: 'T', type: 'linea', x1: 200, y1: 0, x2: 260, y2: 0 }]
    const moved = snapMoveDelta({ x: 201, y: 1 }, end, line, target, snapThresholdWorld(zoom))
    assert.equal(end.x + moved.dx, 200)
    assert.equal(end.y + moved.dy, 0)
  })

  it('polyline continuation does not force the next segment onto a perpendicular', () => {
    const guide = [{ id: 'g', type: 'linea', x1: 0, y1: 40, x2: 200, y2: 40 }]
    const from = { x: 80, y: 0 }
    const cursor = { x: 81, y: 39 }
    const forced = findSnap(cursor, guide, { threshold: 20, fromPoint: from, allowPerp: true })
    assert.equal(forced.kind, 'perp')
    const free = findSnap(cursor, guide, { threshold: 20, fromPoint: from, allowPerp: false })
    assert.notEqual(free?.kind, 'perp')
  })

  it('rotate around a picked base keeps that point fixed', () => {
    const line = { type: 'linea', x1: 0, y1: 0, x2: 50, y2: 0, rotation: 0 }
    const pivot = { x: 0, y: 0 }
    const next = rotateObjectAroundPivot(line, pivot, Math.PI / 2)
    const C = { x: (next.x1 + next.x2) / 2, y: (next.y1 + next.y2) / 2 }
    const dx = next.x1 - C.x
    const dy = next.y1 - C.y
    const vis = {
      x: C.x + dx * Math.cos(next.rotation) - dy * Math.sin(next.rotation),
      y: C.y + dx * Math.sin(next.rotation) + dy * Math.cos(next.rotation),
    }
    assert.ok(Math.hypot(vis.x - pivot.x, vis.y - pivot.y) < 1e-6)
  })

  it('move snap also lands a larger figure vertex exactly', () => {
    const moving = [{ id: 'a', type: 'rect', x1: 0, y1: 0, x2: 100, y2: 60 }]
    const others = [{ id: 'b', type: 'linea', x1: 200, y1: 40, x2: 260, y2: 40 }]
    const grab = findSnap({ x: 96, y: 4 }, moving, { threshold: 8, allowNear: false })
    assert.equal(grab.x, 100)
    assert.equal(grab.y, 0)
    const moved = snapMoveDelta({ x: 202, y: 42 }, grab, moving, others, 8)
    assert.equal(100 + moved.dx, 200)
    assert.equal(0 + moved.dy, 40)
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

  it('texto corner handle scales font; edge handle only changes the box', () => {
    const origin = { type: 'texto', x: 0, y: 0, w: 100, h: 40, fontSize: 16, text: 'Hi' }
    const corner = applyResizeHandle(origin, 'se', { x: 200, y: 80 })
    assert.equal(corner.w, 200)
    assert.equal(corner.h, 80)
    assert.ok(corner.fontSize > 16)
    assert.ok(Math.abs(corner.fontSize - 32) < 0.01)
    const edge = applyResizeHandle(origin, 'e', { x: 180, y: 20 })
    assert.equal(edge.w, 180)
    assert.equal(edge.h, 40)
    assert.equal(edge.fontSize, 16)
  })

  it('snap markers keep an 8 px floor and a 13 px cap', () => {
    const far = snapMarkerScreenSize(0.15)
    const mid = snapMarkerScreenSize(1)
    const near = snapMarkerScreenSize(8)
    assert.ok(far >= SNAP_MARKER_MIN_PX)
    assert.ok(mid >= SNAP_MARKER_MIN_PX)
    assert.ok(near <= SNAP_MARKER_MAX_PX)
    assert.ok(far <= mid)
    assert.ok(mid <= near)
    assert.equal(snapMarkerScreenSize(0.25), SNAP_MARKER_MIN_PX)
    const z = 2
    const markerWu = snapMarkerScreenSize(z) / z
    assert.ok(snapThresholdWorld(z) > 6.5 / z)
    assert.ok(snapThresholdWorld(z) >= markerWu * 0.8, 'aperture must cover the visible marker disc')
  })

  it('soft ortho on rotation uses the same 8° tolerance as lines', () => {
    const snapped = applySoftOrthoAngle(degToRad(7))
    assert.ok(Math.abs(snapped) < 1e-9)
    const free = applySoftOrthoAngle(degToRad(45))
    assert.ok(Math.abs(free - degToRad(45)) < 1e-9)
    const ninety = applySoftOrthoAngle(degToRad(86))
    assert.ok(Math.abs(ninety - Math.PI / 2) < 1e-9)
  })

  it('arrow head grows with body length when scaled', () => {
    const arrow = { type: 'flecha', x1: 0, y1: 0, x2: 100, y2: 0, width: 3 }
    const short = arrowHeadLength(arrow)
    const scaled = scaleObjectUniform(arrow, 2, { x: 50, y: 0 })
    const long = arrowHeadLength(scaled)
    assert.ok(long > short * 1.5)
    assert.ok(scaled.width > arrow.width)
  })

  it('cota layout places dim line offset from the measured segment', () => {
    const L = cotaLayout({ type: 'cota', x1: 0, y1: 0, x2: 100, y2: 0, offset: 20 })
    assert.equal(Math.round(L.len), 100)
    assert.equal(Math.round(L.d1.y), -20)
    assert.equal(Math.round(L.d2.y), -20)
    const handles = getResizeHandles({ type: 'cota', x1: 0, y1: 0, x2: 100, y2: 0, offset: 20 })
    assert.equal(handles.length, 3)
    const moved = applyResizeHandle({ type: 'cota', x1: 0, y1: 0, x2: 100, y2: 0, offset: 20 }, 'dim', { x: 50, y: 40 })
    assert.ok(moved.offset < 0)
  })
})


