import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { finalizeJoinSequence, joinIntersectingLines, segmentIntersection } from './esquemaJoin.js'

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

  it('joins a third line against the polyline from a previous join', () => {
    const first = joinIntersectingLines([
      { id: 'a', type: 'linea', x1: 0, y1: 0, x2: 40, y2: 0 },
      { id: 'b', type: 'linea', x1: 40, y1: 0, x2: 40, y2: 30 },
    ])
    const poly = first.objects.find((o) => o.type === 'polilinea')
    assert.ok(poly)
    const second = joinIntersectingLines([
      ...first.objects,
      { id: 'c', type: 'linea', x1: 20, y1: -10, x2: 20, y2: 10 },
    ])
    assert.ok(second.joined >= 1)
    assert.equal(second.objects.some((o) => o.id === 'c'), false)
    assert.ok(second.objects.some((o) => o.type === 'polilinea' || o.type === 'linea'))
  })

  it('join uses rotated world geometry, not stored x1/x2', () => {
    const rot = Math.PI / 2
    const rotated = { id: 'r', type: 'linea', x1: 0, y1: 0, x2: 40, y2: 0, rotation: rot }
    const other = { id: 'v', type: 'linea', x1: 0, y1: -5, x2: 40, y2: -5 }
    const out = joinIntersectingLines([rotated, other])
    assert.ok(out.joined >= 1)
    assert.ok(out.objects.every((o) => !o.rotation))
  })

  it('Terminar only commits the typed sequence and never closes last→first', () => {
    const objects = [
      { id: 'n1', type: 'nodo', nodeNum: '1', x: 0, y: 0 },
      { id: 'n2', type: 'nodo', nodeNum: '2', x: 40, y: 0 },
      { id: 'n3', type: 'nodo', nodeNum: '3', x: 40, y: 30 },
      { id: 'ab', type: 'linea', joinSeq: true, x1: 0, y1: 0, x2: 40, y2: 0 },
      { id: 'bc', type: 'linea', joinSeq: true, x1: 40, y1: 0, x2: 40, y2: 30 },
    ]
    const next = finalizeJoinSequence(objects)
    assert.equal(next.filter((o) => o.type === 'linea').length, 2)
    assert.ok(next.every((o) => !o.joinSeq))
    assert.equal(next.some((o) => o.type === 'linea' && o.x1 === 40 && o.y1 === 30 && o.x2 === 0 && o.y2 === 0), false)
  })
})
