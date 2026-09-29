import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PPTO_MASIVA_TIP_SELECCION,
  PPTO_MASIVA_TIP_COMPETENCIA,
  PPTO_MASIVA_TIP_OBS,
  PPTO_MASIVA_TIP_DIMS,
  PPTO_MASIVA_TIP_NODOS,
  PPTO_MASIVA_TIP_DEP,
  PPTO_MASIVA_TIP_INTERV,
  PPTO_MASIVA_TIP_TRAMOS_LISTA,
} from './pptoEdicionMasivaTips.js'
import { pptoSheetTipStyle, PPTO_Z_EDICION_MASIVA } from './pptoSheetStyles.js'

describe('pptoEdicionMasivaTips', () => {
  it('tips son textos cortos y no vacíos', () => {
    for (const tip of [
      PPTO_MASIVA_TIP_SELECCION,
      PPTO_MASIVA_TIP_COMPETENCIA,
      PPTO_MASIVA_TIP_OBS,
      PPTO_MASIVA_TIP_DIMS,
      PPTO_MASIVA_TIP_NODOS,
      PPTO_MASIVA_TIP_DEP,
      PPTO_MASIVA_TIP_INTERV,
      PPTO_MASIVA_TIP_TRAMOS_LISTA,
    ]) {
      assert.equal(typeof tip, 'string')
      assert.ok(tip.length > 20)
      assert.ok(tip.length < 320)
    }
  })

  it('renombra Validación Contratista en tips visibles', () => {
    assert.ok(PPTO_MASIVA_TIP_DEP.includes('Validación Contratista'))
    assert.ok(!PPTO_MASIVA_TIP_DEP.toLowerCase().includes('depuración'))
    assert.ok(PPTO_MASIVA_TIP_NODOS.toLowerCase().includes('sellado'))
  })
})

describe('pptoSheetTipStyle + z-index edición masiva', () => {
  it('exporta estilo tip y z-index por encima del detalle', () => {
    const st = pptoSheetTipStyle('#94a3b8', '#64748b')
    assert.equal(st.cursor, 'help')
    assert.equal(st.borderRadius, '50%')
    assert.ok(PPTO_Z_EDICION_MASIVA >= 5000)
  })
})
