/**
 * Roundtrip EPSG:3116 ↔ WGS84.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { gkBogotaToWgs84, wgs84ToGkBogota } from './epsg3116.js'

describe('epsg3116', () => {
  it('roundtrip cerca del origen Bogotá', () => {
    const este = 1000000
    const norte = 1000000
    const ll = gkBogotaToWgs84(este, norte)
    assert.ok(ll)
    const back = wgs84ToGkBogota(ll.lng, ll.lat)
    assert.ok(back)
    assert.ok(Math.abs(back.este - este) < 0.05)
    assert.ok(Math.abs(back.norte - norte) < 0.05)
  })

  it('roundtrip puntos alcantarilla captura', () => {
    const p1 = { este: 958213.494, norte: 971988.373 }
    const ll = gkBogotaToWgs84(p1.este, p1.norte)
    const back = wgs84ToGkBogota(ll.lng, ll.lat)
    assert.ok(Math.abs(back.este - p1.este) < 0.05)
    assert.ok(Math.abs(back.norte - p1.norte) < 0.05)
  })
})
