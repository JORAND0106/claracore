import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeAlertaCantidadVisible,
  sicoeCalcCantidadTotal,
  sicoeCantidadCambioSignificativo,
  sicoeEsCreadorRegistro,
  sicoeFormatearAlertaCantidad,
  sicoeNivelMaxAprobadoAlcanzado,
  sicoePuedeAgregarRegistroEnReporte,
  sicoePuedeEditarCamposDimensionales,
  sicoePuedeEditarCamposFinancieros,
} from './sicoeCreadorEdicionDimensional.js'

describe('sicoeCreadorEdicionDimensional', () => {
  it('identifica al creador del registro', () => {
    assert.equal(sicoeEsCreadorRegistro({ id: 7 }, { creado_por_reg: 7 }), true)
    assert.equal(sicoeEsCreadorRegistro({ sub: '7' }, { creado_por_reg: 7 }), true)
    assert.equal(sicoeEsCreadorRegistro({ id: 8 }, { creado_por_reg: 7 }), false)
  })

  it('Crear mixto habilita dims del creador sin Editar', () => {
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

  it('Crear no habilita dims a quien no creó el registro', () => {
    assert.equal(
      sicoePuedeEditarCamposDimensionales({
        puedeCrear: true,
        esCreador: false,
        selladoMax: false,
      }),
      false,
    )
  })

  it('Editar habilita dims por su propio alcance (independiente de Crear)', () => {
    assert.equal(
      sicoePuedeEditarCamposDimensionales({
        puedeCrear: false,
        esCreador: false,
        puedeEditar: true,
        selladoMax: false,
      }),
      true,
    )
  })

  it('financieros solo con Editar (Crear no desbloquea Ítem/Capítulo/Competencia)', () => {
    assert.equal(sicoePuedeEditarCamposFinancieros({ puedeEditar: true, selladoMax: false }), true)
    assert.equal(sicoePuedeEditarCamposFinancieros({ puedeEditar: false, selladoMax: false }), false)
    // Operativo típico: Crear + creador → dims sí, financieros no
    assert.equal(
      sicoePuedeEditarCamposDimensionales({
        puedeCrear: true,
        esCreador: true,
        puedeEditar: false,
        selladoMax: false,
      }),
      true,
    )
    assert.equal(
      sicoePuedeEditarCamposFinancieros({ puedeEditar: false, selladoMax: false }),
      false,
    )
    assert.equal(
      sicoePuedeEditarCamposFinancieros({ puedeEditar: true, selladoMax: true }),
      false,
    )
  })

  it('alerta visible en N1..max_prev y se apaga al re-aprobar max_prev', () => {
    const base = {
      cantidad_alerta_anterior: 10,
      cantidad_alerta_actual: 20,
      cantidad_alerta_nivel_max_previo: 2,
      nivel1_estado: 'No Revisado',
      nivel2_estado: 'No Revisado',
      nivel3_estado: 'No Revisado',
    }
    assert.equal(sicoeAlertaCantidadVisible(base, [1, 2, 3]), true)
    assert.equal(
      sicoeAlertaCantidadVisible({ ...base, nivel1_estado: 'Aprobado' }, [1, 2, 3]),
      true,
    )
    assert.equal(
      sicoeAlertaCantidadVisible(
        { ...base, nivel1_estado: 'Aprobado', nivel2_estado: 'Aprobado' },
        [1, 2, 3],
      ),
      false,
    )
    assert.equal(sicoeNivelMaxAprobadoAlcanzado({
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Aprobado',
    }, [1, 2, 3]), 2)
    const fmt = sicoeFormatearAlertaCantidad(base, [1, 2, 3])
    assert.equal(fmt.texto, 'Cantidad anterior: 10.00 → Cantidad actual: 20.00')
    assert.equal(fmt.nivelMaxPrevio, 2)
  })

  it('Crear o Editar habilitan + Nuevo Registro en reporte enviado', () => {
    assert.equal(
      sicoePuedeAgregarRegistroEnReporte({ puedeCrear: true, puedeEditar: false }),
      true,
    )
    assert.equal(
      sicoePuedeAgregarRegistroEnReporte({ puedeCrear: false, puedeEditar: true }),
      true,
    )
    assert.equal(
      sicoePuedeAgregarRegistroEnReporte({ puedeCrear: false, puedeEditar: false }),
      false,
    )
  })

  it('solo cambio de cantidad total es significativo', () => {
    assert.equal(sicoeCalcCantidadTotal(2, 3, 4, 1), 24)
    assert.equal(sicoeCantidadCambioSignificativo(10, 10), false)
    assert.equal(sicoeCantidadCambioSignificativo(10, 12), true)
  })
})
