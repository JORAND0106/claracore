import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveReporteTransporte,
  repartirTransportePorPk,
} from './pptoTransporte.js'

describe('repartirTransportePorPk', () => {
  it('reparte proporcional y ajusta redondeo al PK de mayor peso', () => {
    const r = repartirTransportePorPk(
      [
        { pk_id: 'A', cant_compacta: 10 },
        { pk_id: 'B', cant_compacta: 20 },
        { pk_id: 'C', cant_compacta: 30 },
      ],
      6950,
    )
    assert.equal(r.ok, true)
    assert.equal(r.totalCompacta, 60)
    assert.equal(r.totalAsignado, 6950)
    const sum = Math.round(r.filas.reduce((s, f) => s + f.cant_transporte, 0) * 100) / 100
    assert.equal(sum, 6950)
    // C tiene el mayor peso
    const c = r.filas.find((f) => f.pk_id === 'C')
    assert.ok(c.cant_transporte >= r.filas.find((f) => f.pk_id === 'A').cant_transporte)
  })

  it('bloquea si compacta es cero', () => {
    const r = repartirTransportePorPk([{ pk_id: 'A', cant_compacta: 0 }], 100)
    assert.equal(r.ok, false)
    assert.match(String(r.error), /cero/i)
  })

  it('omite PK sin cantidad y exige qty > 0', () => {
    assert.equal(repartirTransportePorPk([{ pk_id: 'A', cant_compacta: 5 }], 0).ok, false)
    const r = repartirTransportePorPk(
      [
        { pk_id: 'A', cant_compacta: 5 },
        { pk_id: '', cant_compacta: 99 },
        { pk_id: 'B', cant_compacta: 5 },
      ],
      10,
    )
    assert.equal(r.ok, true)
    assert.equal(r.filas.length, 2)
    assert.equal(r.totalAsignado, 10)
  })
})

describe('claveReporteTransporte', () => {
  it('normaliza orden de ítems e incluye destino', () => {
    const a = claveReporteTransporte({
      capituloOrigen: '8.X',
      itemsOrigen: ['8.02', '8.01'],
      capituloDestino: '9.Y',
      competenciaDestino: 'IDU',
      itemDestino: '8.99',
    })
    const b = claveReporteTransporte({
      capituloOrigen: '8.X',
      itemsOrigen: ['8.01', '8.02', '8.01'],
      capituloDestino: '9.Y',
      competenciaDestino: 'IDU',
      itemDestino: '8.99',
    })
    assert.equal(a, b)
    assert.ok(a.includes('9.Y'))
  })
})
