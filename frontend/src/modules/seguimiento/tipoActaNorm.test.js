import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TIPO_ACTA_OTRO,
  buildTipoActaOptions,
  labelTipoActaValue,
  normTipoActaKey,
} from './tipoActaNorm.js'

describe('tipoActaNorm', () => {
  it('normTipoActaKey ignora mayúsculas y tildes', () => {
    assert.equal(normTipoActaKey('Comité'), normTipoActaKey('COMITE'))
    assert.equal(normTipoActaKey('Técnico'), normTipoActaKey('tecnico'))
  })

  it('buildTipoActaOptions incluye builtins, custom y Otro sin duplicar', () => {
    const opts = buildTipoActaOptions(
      [{ value: 'Comité' }, { value: 'COMITE' }, { value: 'interna' }],
      { includeOtro: true },
    )
    const values = opts.map((o) => o.value)
    assert.ok(values.includes('interna'))
    assert.ok(values.includes('externa'))
    assert.ok(values.includes('Comité'))
    assert.equal(values.filter((v) => normTipoActaKey(v) === 'comite').length, 1)
    assert.ok(values.includes(TIPO_ACTA_OTRO))
  })

  it('labelTipoActaValue', () => {
    assert.equal(labelTipoActaValue('externa'), 'Externa')
    assert.equal(labelTipoActaValue('Comité', [{ nombre: 'Comité' }]), 'Comité')
  })
})
