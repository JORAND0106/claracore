import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeBuildMapaCalorSearchParams,
  sicoeSerializarCapasMapa,
} from './sicoeMapaCalorParams.js'

describe('sicoeMapaCalorParams', () => {
  it('serializa capas de validación', () => {
    const ser = sicoeSerializarCapasMapa([
      { nivel: 2, estado: 'Pendiente' },
      { cargo_id: 54, estado: 'Aprobado' },
      { estado: '' },
    ])
    assert.deepEqual(ser, [
      { nivel: 2, estado: 'Pendiente' },
      { cargo_id: 54, estado: 'Aprobado' },
    ])
  })

  it('build params incluye formato=mapa_calor y filtros fSicoe', () => {
    const params = sicoeBuildMapaCalorSearchParams({
      fSicoe: {
        capitulo: '01',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-31',
        subcontratista_id: '9',
      },
      itemsChips: [],
      itemsOp: 'and',
      capasValidacion: [{ nivel: 1, estado: 'Aprobado' }],
      capasValidacionOp: 'and',
      q_observacion: '',
      q_nodo: '',
      panelCapitulos: [],
      panelActasRpo: [],
    })
    assert.equal(params.get('formato'), 'mapa_calor')
    assert.equal(params.get('capitulo'), '01')
    assert.equal(params.get('fecha_desde'), '2026-01-01')
    assert.equal(params.get('fecha_hasta'), '2026-01-31')
    assert.equal(params.get('subcontratista_id'), '9')
    const capas = JSON.parse(params.get('validacion_capas'))
    assert.deepEqual(capas[0], { nivel: 1, estado: 'Aprobado' })
  })
})
