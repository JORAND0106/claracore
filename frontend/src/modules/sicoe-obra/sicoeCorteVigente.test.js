import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sicoeCortesSoloVigente, sicoeElegirCorteVigente } from './sicoeCorteVigente.js'

describe('sicoeCorteVigente', () => {
  const ref = new Date('2026-08-15T12:00:00Z')

  it('elige solo el corte abierto que cubre la fecha', () => {
    const cortes = [
      { id: 1, consecutivo: 1, fecha_inicio: '2026-07-01', fecha_fin: '2026-07-15' },
      { id: 2, consecutivo: 2, fecha_inicio: '2026-07-15', fecha_fin: '2026-07-31' },
      { id: 3, consecutivo: 3, fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    ]
    const v = sicoeElegirCorteVigente(cortes, ref)
    assert.equal(v?.id, 3)
    assert.deepEqual(sicoeCortesSoloVigente(cortes, ref).map((c) => c.id), [3])
  })

  it('no ofrece cortes cerrados / anteriores', () => {
    const cortes = [
      { id: 1, consecutivo: 1, fecha_inicio: '2026-01-01', fecha_fin: '2026-01-15' },
      { id: 2, consecutivo: 2, fecha_inicio: '2026-01-15', fecha_fin: '2026-01-31' },
    ]
    assert.equal(sicoeElegirCorteVigente(cortes, ref), null)
    assert.deepEqual(sicoeCortesSoloVigente(cortes, ref), [])
  })

  it('si hay varios vigentes, prefiera el de mayor consecutivo', () => {
    const cortes = [
      { id: 10, consecutivo: 4, fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
      { id: 11, consecutivo: 5, fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    ]
    assert.equal(sicoeElegirCorteVigente(cortes, ref)?.id, 11)
  })
})
