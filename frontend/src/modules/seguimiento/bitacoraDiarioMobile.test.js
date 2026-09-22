import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  debeUsarGrillaDiarioCompacta,
  MAQUINARIA_DATA_LABELS,
  MATERIALES_DATA_LABELS,
  META_DATA_LABELS,
} from './bitacoraDiarioMobile.js'

describe('bitacoraDiarioMobile', () => {
  it('activa compacto solo con viewportCompact', () => {
    assert.equal(debeUsarGrillaDiarioCompacta(false), false)
    assert.equal(debeUsarGrillaDiarioCompacta(true), true)
    assert.equal(debeUsarGrillaDiarioCompacta(null), false)
  })

  it('define labels para Maquinaria y Materiales (última vacía = acciones)', () => {
    assert.ok(MAQUINARIA_DATA_LABELS.includes('Equipo / máquina'))
    assert.ok(MATERIALES_DATA_LABELS.includes('Tipo de material'))
    assert.equal(MAQUINARIA_DATA_LABELS.at(-1), '')
    assert.equal(MATERIALES_DATA_LABELS.at(-1), '')
  })

  it('define labels del encabezado meta Excel', () => {
    for (const lab of ['Fecha', 'Tramo *', 'Hora inicio', 'Clima', 'Elaborado por']) {
      assert.ok(META_DATA_LABELS.includes(lab), `falta ${lab}`)
    }
  })
})
