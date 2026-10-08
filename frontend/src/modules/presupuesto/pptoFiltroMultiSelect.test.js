/**
 * Tests — cascada de opciones de filtro y multi-select acumulativo.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  pptoFiltroCascadeOpcionesParams,
  pptoFiltroPatchLista,
  pptoFiltroValoresLista,
  pptoFiltroDef,
  pptoMergeOpcionesFiltro,
} from './pptoFiltroCatalogo.js'

describe('pptoFiltroCascadeOpcionesParams', () => {
  it('no envía tramo/calzada (evita auto-filtro que bloquea Agregar)', () => {
    const f = {
      tramo: 'T1',
      tramos: ['T1', 'T2'],
      calzada: 'C1',
      calzadas: ['C1'],
      caps: ['CAP-A'],
      competencias: ['Comp1'],
      tipoEjecucion: 'Presupuesto de Obra',
    }
    const p = pptoFiltroCascadeOpcionesParams(f, 'Presupuesto de Obra')
    assert.equal(p.capitulo, 'CAP-A')
    assert.equal(p.competencia, 'Comp1')
    assert.equal(p.tramo, undefined)
    assert.equal(p.calzada, undefined)
    assert.ok(!('tramo' in p) || p.tramo == null)
  })

  it('con varios capítulos no fija capitulo en cascada', () => {
    const f = { caps: ['A', 'B'], tipoEjecucion: 'Presupuesto de Obra' }
    const p = pptoFiltroCascadeOpcionesParams(f)
    assert.equal(p.capitulo, undefined)
  })
})

describe('pptoMergeOpcionesFiltro', () => {
  it('une catálogos y conserva valores no seleccionados', () => {
    const merged = pptoMergeOpcionesFiltro(
      ['T1'],
      ['T2', 'T3'],
      [{ value: 'T1' }, { value: 'T4' }],
    )
    assert.deepEqual(merged, ['T1', 'T2', 'T3', 'T4'])
  })
})

describe('select_multi patch acumulativo', () => {
  it('tramo acumula varios valores en tramos[]', () => {
    const def = pptoFiltroDef('tramo')
    const p1 = pptoFiltroPatchLista(def, ['T1'])
    assert.equal(p1.tramo, 'T1')
    assert.deepEqual(p1.tramos, ['T1'])

    const p2 = pptoFiltroPatchLista(def, ['T1', 'T2'])
    assert.equal(p2.tramo, '')
    assert.deepEqual(p2.tramos, ['T1', 'T2'])

    const lista = pptoFiltroValoresLista(def, { ...p2 })
    assert.deepEqual(lista, ['T1', 'T2'])
  })

  it('calzada, infraestructura, capítulo y unidad también acumulan', () => {
    for (const key of ['calzada', 'infraestructura', 'capitulo', 'und', 'competencia']) {
      const def = pptoFiltroDef(key)
      const vals = ['A', 'B']
      const patch = pptoFiltroPatchLista(def, vals)
      const lista = pptoFiltroValoresLista(def, patch)
      assert.deepEqual(lista, vals, key)
    }
  })
})
