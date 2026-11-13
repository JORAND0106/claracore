import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  claraGisBundleVacio,
  claraGisBundleNoRevisado,
  claraGisBundleFocoItem,
  claraGisAnotarFocoFeatures,
  claraGisEsMesaValidador,
  claraGisTieneCriterios,
} from './claraGisMesaValidacion.js'

describe('claraGisMesaValidacion', () => {
  it('bundle No Revisado marca criterios activos', () => {
    const b = claraGisBundleNoRevisado([{ nivel: 2, estado: 'No Revisado' }])
    assert.equal(claraGisTieneCriterios(b), true)
    assert.deepEqual(b.capasValidacion, [{ nivel: 2, estado: 'No Revisado' }])
  })

  it('bundle vacío sin capas no tiene criterios', () => {
    assert.equal(claraGisTieneCriterios(claraGisBundleVacio()), false)
    assert.equal(claraGisTieneCriterios(claraGisBundleNoRevisado([])), false)
  })

  it('foco por ítem filtra solo ese ítem sin capas', () => {
    const b = claraGisBundleFocoItem('01.02.03')
    assert.equal(b.fSicoe.item, '01.02.03')
    assert.deepEqual(b.itemsChips, ['01.02.03'])
    assert.deepEqual(b.capasValidacion, [])
    assert.equal(claraGisTieneCriterios(b), true)
  })

  it('anotar foco marca activo y referencia', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { id: 10 }, geometry: null },
        { type: 'Feature', properties: { id: 20 }, geometry: null },
      ],
    }
    const out = claraGisAnotarFocoFeatures(fc, 10)
    assert.equal(out.features[0].properties.claragis_modo, 'activo')
    assert.equal(out.features[1].properties.claragis_modo, 'referencia')
  })

  it('mesa validador exige permiso validar y capas', () => {
    const user = {
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', contrato_id: 1, validar: true, ver: true }],
      contrato_id: 1,
      cargo_nombre: 'Residente',
    }
    assert.equal(claraGisEsMesaValidador(user, 1, [{ nivel: 2, estado: 'No Revisado' }]), true)
    assert.equal(claraGisEsMesaValidador(user, 1, []), false)
    assert.equal(
      claraGisEsMesaValidador(
        { ...user, cargo_nombre: 'Desarrollador', permisos: [] },
        1,
        [{ nivel: 1, estado: 'No Revisado' }],
      ),
      false,
    )
  })
})
