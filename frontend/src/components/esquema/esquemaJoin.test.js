import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { joinIntersectingLines, segmentIntersection } from './esquemaJoin.js'

describe('esquemaJoin', () => {
  it('detects a real crossing and leaves disjoint lines untouched', () => {
    const cross = segmentIntersection(
      { x: 0, y: 10 }, { x: 20, y: 10 },
      { x: 10, y: 0 }, { x: 10, y: 20 },
    )
    assert.ok(cross)
    assert.equal(Math.round(cross.x), 10)
    assert.equal(Math.round(cross.y), 10)
    assert.equal(segmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 20 }, { x: 10, y: 20 },
    ), null)
  })

  it('joins an L at the shared endpoint into one polyline', () => {
    const out = joinIntersectingLines([
      { id: 'a', type: 'linea', x1: 0, y1: 0, x2: 40, y2: 0, color: '#111' },
      { id: 'b', type: 'linea', x1: 40, y1: 0, x2: 40, y2: 30, color: '#111' },
      { id: 'c', type: 'linea', x1: 200, y1: 0, x2: 260, y2: 0, color: '#111' },
    ], ['a', 'b', 'c'])
    const polys = out.objects.filter((o) => o.type === 'polilinea')
    const leftover = out.objects.filter((o) => o.id === 'c')
    assert.equal(polys.length, 1)
    assert.equal(polys[0].points.length, 3)
    assert.equal(leftover.length, 1)
    assert.equal(leftover[0].type, 'linea')
  })

  it('splits a crossing into chains that share the intersection and ignores rects', () => {
    const out = joinIntersectingLines([
      { id: 'h', type: 'linea', x1: 0, y1: 10, x2: 20, y2: 10 },
      { id: 'v', type: 'linea', x1: 10, y1: 0, x2: 10, y2: 20 },
      { id: 'r', type: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 },
    ])
    assert.ok(out.objects.some((o) => o.type === 'rect' && o.id === 'r'))
    assert.equal(out.objects.filter((o) => o.id === 'h' || o.id === 'v').length, 0)
    const chains = out.objects.filter((o) => o.type === 'linea' || o.type === 'polilinea')
    assert.ok(chains.length >= 1)
    assert.ok(out.joined >= 1)
  })
})
