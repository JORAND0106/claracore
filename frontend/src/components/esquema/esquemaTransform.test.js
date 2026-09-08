import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld, objectWorldPoint, PX_PER_METER } from './esquemaGeometry.js'
import { arrayPolar, arrayRectangular, mirrorObject, mirrorPoint, mirrorSelection } from './esquemaTransform.js'

describe('esquemaTransform', () => {
  it('mirrors a point across a vertical axis', () => {
    const p = mirrorPoint({ x: 10, y: 4 }, { x: 25, y: 0 }, { x: 25, y: 10 })
    assert.equal(p.x, 40)
    assert.equal(p.y, 4)
  })

  it('mirrors a line and a disconnected neighbor across the same axis', () => {
    const a = { id: 'a', type: 'linea', x1: 0, y1: 0, x2: 20, y2: 0, rotation: 0 }
    const b = { id: 'b', type: 'linea', x1: 0, y1: 30, x2: 20, y2: 30, rotation: 0 }
    const axis = { a: { x: 40, y: 0 }, b: { x: 40, y: 10 } }
    const ma = mirrorObject(a, axis.a, axis.b)
    const mb = mirrorObject(b, axis.a, axis.b)
    assert.equal(ma.x1, 80)
    assert.equal(ma.x2, 60)
    assert.equal(mb.y1, 30)
    assert.equal(mb.x1, 80)
    const kept = mirrorSelection([a, b], { ...axis, keepOriginal: true })
    assert.equal(kept.objects.length, 2)
    assert.deepEqual(kept.removed, [])
    const onlyCopy = mirrorSelection([a, b], { ...axis, keepOriginal: false })
    assert.deepEqual(onlyCopy.removed, ['a', 'b'])
  })

  it('builds a rectangular array including the original as 0,0', () => {
    const src = [{ id: 's', type: 'rect', x1: 0, y1: 0, x2: 10, y2: 8 }]
    const copies = arrayRectangular(src, { rows: 2, cols: 3, dxMeters: 1, dyMeters: 2 })
    assert.equal(copies.length, 5)
    assert.equal(copies[0].x1, metersToWorld(1))
    assert.equal(copies[1].x1, metersToWorld(2))
    const last = copies[copies.length - 1]
    assert.equal(last.x1, metersToWorld(2))
    assert.equal(last.y1, metersToWorld(2))
  })

  it('builds a polar array around a center and keeps relative radius', () => {
    const src = [{ id: 's', type: 'linea', x1: 50, y1: 0, x2: 70, y2: 0, rotation: 0 }]
    const copies = arrayPolar(src, { center: { x: 0, y: 0 }, count: 4, angleDeg: 360 })
    assert.equal(copies.length, 3)
    const vis = objectWorldPoint(copies[0], { x: copies[0].x1, y: copies[0].y1 })
    assert.ok(Math.abs(vis.x) < 1e-6)
    assert.ok(Math.abs(vis.y - 50) < 1e-6)
    const r0 = Math.hypot(50, 0)
    const r1 = Math.hypot(vis.x, vis.y)
    assert.ok(Math.abs(r1 - r0) < 1e-6)
    assert.equal(PX_PER_METER, 50)
  })
})
