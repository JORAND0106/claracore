import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeCalcCantidadTotal,
  sicoeCantidadCambioSignificativo,
  sicoeEsCreadorRegistro,
  sicoeFormatearAlertaCantidad,
  sicoePuedeEditarCamposDimensionales,
  sicoePuedeEditarCamposFinancieros,
} from './sicoeCreadorEdicionDimensional.js'

describe('sicoeCreadorEdicionDimensional', () => {
  it('identifica al creador del registro', () => {
    assert.equal(sicoeEsCreadorRegistro({ id: 7 }, { creado_por_reg: 7 }), true)
    assert.equal(sicoeEsCreadorRegistro({ sub: '7' }, { creado_por_reg: 7 }), true)
    assert.equal(sicoeEsCreadorRegistro({ id: 8 }, { creado_por_reg: 7 }), false)
    assert.equal(sicoeEsCreadorRegistro({ id: 7 }, {}), false)
  })

  it('habilita dimensiones al creador con Crear si no está sellado', () => {
    assert.equal(
      sicoePuedeEditarCamposDimensionales({
        puedeCrear: true,
        esCreador: true,
        puedeEditar: false,
        selladoMax: false,
      }),
      true,
    )
  })

  it('bloquea dimensiones tras sellado final', () => {
    assert.equal(
      sicoePuedeEditarCamposDimensionales({
        puedeCrear: true,
        esCreador: true,
        selladoMax: true,
      }),
      false,
    )
  })

  it('no habilita dimensiones sin ser creador', () => {
    assert.equal(
      sicoePuedeEditarCamposDimensionales({
        puedeCrear: true,
        esCreador: false,
        selladoMax: false,
      }),
      false,
    )
  })

  it('campos financieros solo con Editar y sin sellado', () => {
    assert.equal(sicoePuedeEditarCamposFinancieros({ puedeEditar: true, selladoMax: false }), true)
    assert.equal(sicoePuedeEditarCamposFinancieros({ puedeEditar: true, selladoMax: true }), false)
    assert.equal(sicoePuedeEditarCamposFinancieros({ puedeEditar: false, selladoMax: false }), false)
  })

  it('recalcula cantidad y formatea alerta', () => {
    assert.equal(sicoeCalcCantidadTotal(2, 3, 4, 1), 24)
    assert.equal(sicoeCantidadCambioSignificativo(10, 10), false)
    assert.equal(sicoeCantidadCambioSignificativo(10, 10.01), true)
    const a = sicoeFormatearAlertaCantidad({
      cantidad_alerta_anterior: 12.5,
      cantidad_alerta_actual: 18,
    })
    assert.equal(a.texto, 'Cantidad anterior: 12.50 → Cantidad actual: 18.00')
    assert.equal(sicoeFormatearAlertaCantidad({}), null)
  })
})
