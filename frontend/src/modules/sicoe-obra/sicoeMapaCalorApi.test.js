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

  it('serializa Acta RPO, ítem, semana y tramo igual que la grilla', () => {
    const params = sicoeBuildMapaCalorSearchParams({
      fSicoe: {
        acta_rpo: '616',
        semana: '12',
        item: '3.9.',
        tramo: 'T1',
        costado: 'Derecho',
      },
      itemsChips: ['3.9.'],
      itemsOp: 'and',
      capasValidacion: [],
      panelCapitulos: [],
      panelActasRpo: [],
    })
    assert.equal(params.get('formato'), 'mapa_calor')
    assert.equal(params.get('acta_rpo'), '616')
    assert.equal(params.get('semana'), '12')
    assert.equal(params.get('item'), '3.9.')
    assert.equal(params.get('tramo'), 'T1')
    assert.equal(params.get('costado'), 'Derecho')
  })

  it('actas_filtro / capitulos_filtro del panel tienen prioridad', () => {
    const params = sicoeBuildMapaCalorSearchParams({
      fSicoe: { acta_rpo: '1', capitulo: '01' },
      panelActasRpo: [616, 617],
      panelCapitulos: ['01', '02'],
      capasValidacion: [],
    })
    assert.equal(params.get('actas_filtro'), JSON.stringify([616, 617]))
    assert.equal(params.get('acta_rpo'), null)
    assert.equal(params.get('capitulos_filtro'), JSON.stringify(['01', '02']))
    assert.equal(params.get('capitulo'), null)
  })
})
