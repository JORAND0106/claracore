import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PX_PER_METER } from './esquemaGeometry.js'
import { cotaText, createCota, DEFAULT_COTA_OFFSET } from './esquemaCota.js'

describe('esquemaCota', () => {
  it('stores a recognized cota entity with automatic meter text', () => {
    const cota = createCota({ x: 0, y: 0 }, { x: PX_PER_METER * 1.2, y: 0 })
    assert.equal(cota.type, 'cota')
    assert.equal(cota.offset, DEFAULT_COTA_OFFSET)
    assert.equal(cota.text, '1.20 m')
    assert.equal(cotaText({ ...cota, x2: PX_PER_METER * 2 }), '2.00 m')
  })
})
