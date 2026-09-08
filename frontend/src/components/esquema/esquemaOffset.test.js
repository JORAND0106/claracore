import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canOffsetEntity, offsetEntity, signedOffsetDistance } from './esquemaOffset.js'

describe('esquemaOffset', () => {
  it('offsets a horizontal line to the chosen side', () => {
    const line = { type: 'linea', x1: 0, y1: 10, x2: 80, y2: 10 }
    const up = signedOffsetDistance(line, { x: 40, y: 0 })
    assert.ok(up < 0)
    const copy = offsetEntity(line, -20)
    assert.equal(copy.y1, -10)
    assert.equal(copy.y2, -10)
    assert.equal(copy.x1, 0)
    assert.equal(copy.x2, 80)
  })

  it('inflates a rectangle outward and rejects a collapse', () => {
    const rect = { type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20 }
    const out = offsetEntity(rect, 5)
    assert.equal(out.x1, -5)
    assert.equal(out.y1, -5)
    assert.equal(out.x2, 45)
    assert.equal(out.y2, 25)
    assert.equal(offsetEntity(rect, -30), null)
  })

  it('grows an ellipse / circle by the signed distance', () => {
    const circle = { type: 'elipse', x1: -10, y1: -10, x2: 10, y2: 10 }
    const next = offsetEntity(circle, 5)
    assert.equal(next.x1, -15)
    assert.equal(next.y2, 15)
    assert.equal(canOffsetEntity(circle), true)
    assert.equal(canOffsetEntity({ type: 'texto' }), false)
  })

  it('offsets a polyline keeping endpoint count', () => {
    const poly = { type: 'polilinea', points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }] }
    const next = offsetEntity(poly, 10)
    assert.equal(next.points.length, 3)
    assert.ok(Math.abs(next.points[0].y - 10) < 1e-6)
  })
})
