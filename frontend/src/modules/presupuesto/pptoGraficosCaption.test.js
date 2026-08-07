import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCaptionPieFoto } from './pptoGraficosCaption.js'
import { sizeContainInBox } from './presupuestoExportLogos.js'

describe('buildCaptionPieFoto', () => {
  it('concatena valores distintos separados por coma', () => {
    const cap = buildCaptionPieFoto([
      { tramo: '3', infraestructura: 'Cuneta', abs_inicio: '2+900', abs_final: '3+100', id_pol: '64211' },
      { tramo: '4', infraestructura: 'Cuneta', abs_inicio: '2+900', abs_final: '3+100', id_pol: '64212' },
      { tramo: '5', infraestructura: 'Box Culvert', abs_inicio: '3+500', abs_final: '4+100', id_pol: '64213' },
    ])
    assert.match(cap, /Tramo: 3, 4, 5/)
    assert.match(cap, /Infraestructura: Cuneta, Box Culvert/)
    assert.match(cap, /Abs: 2\+900-3\+100, 3\+500-4\+100/)
    assert.match(cap, /Id_Pol: 64211, 64212, 64213/)
  })

  it('devuelve guión si no hay datos', () => {
    assert.equal(buildCaptionPieFoto([]), '—')
  })
})

describe('sizeContainInBox', () => {
  it('no deforma (conserva proporción)', () => {
    const s = sizeContainInBox(400, 200, 220, 150)
    assert.ok(Math.abs(s.width / s.height - 2) < 0.01)
    assert.ok(s.width <= 220 + 0.01)
    assert.ok(s.height <= 150 + 0.01)
  })
})
