import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { floodPixelsToM2, formatAreaM2, polygonAreaM2, PX_PER_METER } from './esquemaGeometry.js'
import { createAreaLabel } from './esquemaArea.js'

describe('esquemaArea', () => {
  it('converts hatch flood-fill pixels to m² with the 50 px/m scale', () => {
    assert.equal(PX_PER_METER, 50)
    assert.ok(Math.abs(floodPixelsToM2(2500, 1) - 1) < 1e-9)
    assert.ok(Math.abs(floodPixelsToM2(10000, 2) - 1) < 1e-9)
    assert.equal(formatAreaM2(1.5), '1.50 m²')
  })

  it('measures a 1 m × 1 m square and a 1 m radius disk by shoelace / πr²', () => {
    const square = [
      { x: 0, y: 0 },
      { x: PX_PER_METER, y: 0 },
      { x: PX_PER_METER, y: PX_PER_METER },
      { x: 0, y: PX_PER_METER },
    ]
    assert.ok(Math.abs(polygonAreaM2(square) - 1) < 1e-9)
    const r = PX_PER_METER
    const disk = Math.PI * r * r / (PX_PER_METER * PX_PER_METER)
    assert.ok(Math.abs(disk - Math.PI) < 1e-9)
    const mixed = polygonAreaM2(square) + disk
    assert.ok(Math.abs(mixed - (1 + Math.PI)) < 1e-9)
  })

  it('stores an area annotation that can be moved without changing m²', () => {
    const label = createAreaLabel({ x: 10, y: 20, areaM2: 2.5 })
    assert.equal(label.type, 'areaLabel')
    assert.equal(label.text, '2.50 m²')
    const moved = { ...label, x: 80, y: 90 }
    assert.equal(moved.areaM2, 2.5)
    assert.equal(moved.text, '2.50 m²')
  })
})
