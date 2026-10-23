import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calcularCantidadRegistro,
  calcularCantidadVarilla,
  sicoeDiametrosValidosMsg,
  sicoeFmtPesoKgM,
  sicoeHeadersMedicion,
  sicoeKgPendienteRecaptura,
  sicoeMedicionCeldasDisplay,
  sicoeNormalizarDiametroVarilla,
  sicoePesoKgMPorDiametro,
  sicoeUnidadEsKg,
  sicoeValidarDiametroOError,
} from './sicoeVarilla.js'

describe('sicoeVarilla', () => {
  it('detecta unidad Kg', () => {
    assert.equal(sicoeUnidadEsKg('Kg'), true)
    assert.equal(sicoeUnidadEsKg('m²'), false)
  })

  it('normaliza diámetros NTC', () => {
    assert.equal(sicoeNormalizarDiametroVarilla('3/8'), '3/8')
    assert.equal(sicoeNormalizarDiametroVarilla('Ø1 1/4'), '1 1/4')
    assert.equal(sicoeNormalizarDiametroVarilla('1-1/4'), '1 1/4')
    assert.equal(sicoeNormalizarDiametroVarilla('9/16'), null)
  })

  it('pesos NTC a 3 dp (1/2" = 0,994)', () => {
    assert.equal(sicoePesoKgMPorDiametro('3/8'), 0.56)
    assert.equal(sicoePesoKgMPorDiametro('1/2'), 0.994)
    assert.equal(sicoePesoKgMPorDiametro('1'), 3.973)
    assert.equal(sicoeFmtPesoKgM(0.994), '0.994')
  })

  it('calcula Cant Total varilla con peso de tabla', () => {
    assert.equal(calcularCantidadVarilla(12, 0.56, 10), 67.2)
    assert.equal(
      calcularCantidadRegistro({
        es_varilla: true,
        longitud: 12,
        diametro_varilla: '3/8',
        cantidad: 10,
      }),
      67.2,
    )
    // Diámetro 1/2" usa 0,994 aunque el peso guardado sea 0,99
    assert.equal(
      calcularCantidadRegistro({
        es_varilla: true,
        longitud: 10,
        diametro_varilla: '1/2',
        peso_kg_m: 0.99,
        cantidad: 1,
      }),
      9.94,
    )
  })

  it('rechaza diámetro inválido', () => {
    const r = sicoeValidarDiametroOError('9/16')
    assert.equal(r.ok, false)
    assert.match(r.error, /Diámetro/)
    assert.ok(sicoeDiametrosValidosMsg().includes('3/8'))
  })

  it('pendiente recaptura solo Kg sin elección', () => {
    assert.equal(sicoeKgPendienteRecaptura({ unidad: 'Kg', es_varilla: null }), true)
    assert.equal(sicoeKgPendienteRecaptura({ unidad: 'Kg', es_varilla: false }), false)
  })

  it('headers y celdas según esquema (peso 3 dp)', () => {
    const vars = [{ es_varilla: true, diametro_varilla: '1/2', peso_kg_m: 0.99 }]
    assert.equal(sicoeHeadersMedicion(vars).modo, 'varilla')
    assert.equal(sicoeHeadersMedicion(vars).col2, 'Ø')
    const cel = sicoeMedicionCeldasDisplay(vars[0])
    assert.equal(cel.col2, 'Ø 1/2')
    assert.equal(cel.col3, '0.994')
  })
})
