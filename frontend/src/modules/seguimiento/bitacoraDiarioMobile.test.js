import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  debeUsarGrillaDiarioCompacta,
  MAQUINARIA_DATA_LABELS,
  MATERIALES_DATA_LABELS,
  META_DATA_LABELS,
} from './bitacoraDiarioMobile.js'
import { BITACORA_HORA_INICIO_DEFAULT, horaInicioLaboresInicial } from './bitacoraConstants.js'

describe('bitacoraDiarioMobile', () => {
  it('activa compacto solo con viewportCompact', () => {
    assert.equal(debeUsarGrillaDiarioCompacta(false), false)
    assert.equal(debeUsarGrillaDiarioCompacta(true), true)
    assert.equal(debeUsarGrillaDiarioCompacta(null), false)
  })

  it('define labels para Maquinaria y Materiales (con Tramo; última vacía = acciones)', () => {
    assert.ok(MAQUINARIA_DATA_LABELS.includes('Equipo / máquina'))
    assert.ok(MAQUINARIA_DATA_LABELS.includes('Tramo'))
    assert.ok(MATERIALES_DATA_LABELS.includes('Tipo de material'))
    assert.ok(MATERIALES_DATA_LABELS.includes('Tramo'))
    assert.equal(MAQUINARIA_DATA_LABELS.at(-1), '')
    assert.equal(MATERIALES_DATA_LABELS.at(-1), '')
  })

  it('define labels del encabezado meta Excel sin Tramo de documento', () => {
    for (const lab of ['Fecha', 'Hora inicio', 'Clima', 'Elaborado por']) {
      assert.ok(META_DATA_LABELS.includes(lab), `falta ${lab}`)
    }
    assert.equal(META_DATA_LABELS.includes('Tramo *'), false)
    assert.equal(META_DATA_LABELS.includes('Tramo'), false)
  })

  it('hora de inicio por defecto al crear sigue siendo 07:30', () => {
    assert.equal(BITACORA_HORA_INICIO_DEFAULT, '07:30')
    assert.equal(horaInicioLaboresInicial(null), '07:30')
    assert.equal(horaInicioLaboresInicial({}), '07:30')
  })
})
