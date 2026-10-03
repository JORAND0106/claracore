import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validarLocalizacion } from './sicoeLocalizacionHelpers.js'

describe('validarLocalizacion — coordenadas no obligatorias al reportar', () => {
  it('acepta localización completa sin GPS ni vértices', () => {
    const { ok, errores } = validarLocalizacion({
      pkSeleccionado: { id: 1, civ: 'C1' },
      margen: 'Izquierda',
      absInicio: 100,
      absFinal: 120,
      nodoIni: 'N1',
      nodoFin: 'N2',
    })
    assert.equal(ok, true)
    assert.deepEqual(errores, {})
  })

  it('no exige coordLat/coordLng', () => {
    const { ok } = validarLocalizacion({
      pk_id_id: 9,
      margen: 'Derecha',
      absInicio: '0',
      absFinal: '10',
      nodoIni: 'A',
      nodoFin: 'B',
      coordLat: null,
      coordLng: null,
    })
    assert.equal(ok, true)
  })
})
