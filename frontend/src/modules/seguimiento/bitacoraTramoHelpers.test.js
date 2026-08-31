/**
 * Node tests — segmentación Diario por Tramo.
 * Run: node --test src/modules/seguimiento/bitacoraTramoHelpers.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TRAMO_NO_ESPECIFICADO_LABEL,
  normalizeTramoValue,
  labelTramoBitacora,
  groupDiariosByFecha,
  tramosDisponiblesParaNuevo,
  diariosDeFecha,
} from './bitacoraTramoHelpers.js'

describe('bitacoraTramoHelpers', () => {
  it('normaliza y etiqueta tramo', () => {
    assert.equal(normalizeTramoValue('  A  '), 'A')
    assert.equal(normalizeTramoValue(''), null)
    assert.equal(normalizeTramoValue(null), null)
    assert.equal(labelTramoBitacora(null), TRAMO_NO_ESPECIFICADO_LABEL)
    assert.equal(labelTramoBitacora('Tramo 1'), 'Tramo 1')
  })

  it('agrupa diarios por fecha e ignora eventos', () => {
    const map = groupDiariosByFecha([
      { id: 1, tipo: 'diario', fecha: '2026-08-31', tramo: 'B' },
      { id: 2, tipo: 'diario', fecha: '2026-08-31', tramo: 'A' },
      { id: 3, tipo: 'evento', fecha: '2026-08-31', tramo: 'X' },
      { id: 4, tipo: 'diario', fecha: '2026-08-30', tramo: 'A' },
    ])
    assert.equal(map.get('2026-08-31').length, 2)
    assert.equal(map.get('2026-08-31')[0].tramo, 'A')
    assert.equal(map.get('2026-08-30').length, 1)
  })

  it('filtra tramos disponibles excluyendo ocupados', () => {
    const avail = tramosDisponiblesParaNuevo(
      ['A', 'B', 'C', 'A'],
      [{ tramo: 'B' }, { tramo: null }],
    )
    assert.deepEqual(avail, ['A', 'C'])
  })

  it('diariosDeFecha', () => {
    const rows = [
      { id: 1, fecha: '2026-08-31', tipo: 'diario' },
      { id: 2, fecha: '2026-08-30', tipo: 'diario' },
    ]
    assert.equal(diariosDeFecha(rows, '2026-08-31').length, 1)
  })
})
