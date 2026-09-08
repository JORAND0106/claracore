import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cotaArrowHeadLength, PX_PER_METER, repositionCota } from './esquemaGeometry.js'
import { cotaText, createCota, DEFAULT_COTA_OFFSET } from './esquemaCota.js'

describe('esquemaCota', () => {
  it('stores a recognized cota entity with automatic meter text', () => {
    const cota = createCota({ x: 0, y: 0 }, { x: PX_PER_METER * 1.2, y: 0 })
    assert.equal(cota.type, 'cota')
    assert.equal(cota.offset, DEFAULT_COTA_OFFSET)
    assert.equal(cota.text, '1.20 m')
    assert.equal(cotaText({ ...cota, x2: PX_PER_METER * 2 }), '2.00 m')
  })

  it('keeps arrow length independent of the measured span', () => {
    const head1 = cotaArrowHeadLength(1)
    const headFar = cotaArrowHeadLength(1)
    assert.equal(head1, headFar)
    assert.ok(head1 < 20)
    const moved = repositionCota(
      createCota({ x: 0, y: 0 }, { x: PX_PER_METER * 4, y: 0 }),
      { x: PX_PER_METER * 2, y: 80 },
    )
    assert.equal(moved.x2, PX_PER_METER * 4)
    assert.equal(moved.text, '4.00 m')
    assert.ok(moved.offset < 0)
  })
})
