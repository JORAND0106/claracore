import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyResizeHandle,
  findSnap,
  getResizeHandles,
  parsePositive,
} from './esquemaGeometry.js'

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
})
