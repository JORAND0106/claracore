import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  expandirOcurrencias,
  idsConSolapePorAsignado,
  intervalosSolapan,
} from './planActividadesOcurrencias.js'

describe('expandirOcurrencias', () => {
  it('sin fechas → vacío', () => {
    assert.deepEqual(expandirOcurrencias({}), [])
  })

  it('ninguna → una ocurrencia', () => {
    const o = expandirOcurrencias({
      fechaInicio: '2026-11-03',
      fechaFin: '2026-11-05',
      periodicidad: 'ninguna',
    })
    assert.equal(o.length, 1)
    assert.equal(o[0].fecha_inicio, '2026-11-03')
    assert.equal(o[0].fecha_fin, '2026-11-05')
  })

  it('semanal genera varias', () => {
    const o = expandirOcurrencias({
      fechaInicio: '2026-11-03',
      fechaFin: '2026-11-03',
      periodicidad: 'semanal',
      periodicidadHasta: '2026-11-24',
    })
    assert.equal(o.length, 4)
    assert.equal(o[1].fecha_inicio, '2026-11-10')
  })
})

describe('solapes', () => {
  it('detecta cruce', () => {
    assert.equal(intervalosSolapan('2026-11-01', '2026-11-05', '2026-11-05', '2026-11-07'), true)
    assert.equal(intervalosSolapan('2026-11-01', '2026-11-04', '2026-11-05', '2026-11-07'), false)
  })

  it('marca ids con solape del mismo asignado', () => {
    const ids = idsConSolapePorAsignado([
      {
        id: 1,
        asignaciones: [{ usuario_id: 10 }],
        ocurrencias: [{ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-05' }],
      },
      {
        id: 2,
        asignaciones: [{ usuario_id: 10 }],
        ocurrencias: [{ fecha_inicio: '2026-11-04', fecha_fin: '2026-11-06' }],
      },
      {
        id: 3,
        asignaciones: [{ usuario_id: 11 }],
        ocurrencias: [{ fecha_inicio: '2026-11-04', fecha_fin: '2026-11-06' }],
      },
    ])
    assert.equal(ids.has(1), true)
    assert.equal(ids.has(2), true)
    assert.equal(ids.has(3), false)
  })
})
