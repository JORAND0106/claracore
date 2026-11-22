import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  displayLabelSubsector,
  formatAbscisaLabel,
  overlapM,
  parseAbscisaLabel,
  rangesOverlap,
  roundAbscisaDecenaM,
} from './progObraSubsectores.js'

describe('progObraSubsectores', () => {
  it('redondea abscisas a decena y formatea K3+000', () => {
    assert.equal(roundAbscisaDecenaM(3204), 3200)
    assert.equal(roundAbscisaDecenaM('3+205'), 3210)
    assert.equal(formatAbscisaLabel(3000), 'K3+000')
    assert.equal(formatAbscisaLabel(3200), 'K3+200')
    assert.equal(parseAbscisaLabel('K3+200'), 3200)
  })

  it('arma etiqueta de subsector', () => {
    assert.equal(displayLabelSubsector('PK-A', 3000, 3200), 'PK-A · K3+000–K3+200')
  })

  it('detecta solapes de rangos', () => {
    assert.equal(overlapM(0, 100, 50, 150), 50)
    assert.equal(rangesOverlap(3000, 3200, 3200, 3400), false)
    assert.equal(rangesOverlap(3000, 3200, 3190, 3400), true)
  })
})
