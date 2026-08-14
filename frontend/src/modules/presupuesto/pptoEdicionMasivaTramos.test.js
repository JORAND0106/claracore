import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pptoTramoOpcionLabel,
  pptoConstruirOpcionesTramo,
  pptoFiltrarOpcionesTramo,
  pptoFilaCoincideOpcionTramo,
} from './pptoTramoBusqueda.js'

describe('pptoTramoOpcionLabel', () => {
  it('formatea Nodo Inicio · Nodo Fin · Tramo', () => {
    assert.equal(
      pptoTramoOpcionLabel({ noInicio: 'A', noFinal: 'B', tramo: 'T1' }),
      'A · B · T1',
    )
  })
})

describe('pptoConstruirOpcionesTramo', () => {
  it('deduplica triples nodo/tramo', () => {
    const ops = pptoConstruirOpcionesTramo([
      { id: 1, no_inicio: 'A', no_final: 'B', tramo: 'T1' },
      { id: 2, no_inicio: 'A', no_final: 'B', tramo: 'T1' },
      { id: 3, no_inicio: 'C', no_final: 'D', tramo: 'T1' },
    ])
    assert.equal(ops.length, 2)
    assert.equal(ops[0].label.includes('·'), true)
  })
})

describe('pptoFiltrarOpcionesTramo', () => {
  const ops = pptoConstruirOpcionesTramo([
    { no_inicio: 'Norte', no_final: 'Sur', tramo: 'Calle 1' },
    { no_inicio: 'Este', no_final: 'Oeste', tramo: 'Calle 2' },
  ])

  it('filtra por nodo inicio, fin o nombre de tramo', () => {
    assert.equal(pptoFiltrarOpcionesTramo(ops, 'norte').length, 1)
    assert.equal(pptoFiltrarOpcionesTramo(ops, 'oeste').length, 1)
    assert.equal(pptoFiltrarOpcionesTramo(ops, 'calle 2').length, 1)
    assert.equal(pptoFiltrarOpcionesTramo(ops, 'xyz').length, 0)
  })
})

describe('pptoFilaCoincideOpcionTramo', () => {
  it('coincide por los tres campos', () => {
    const op = pptoConstruirOpcionesTramo([{ no_inicio: 'A', no_final: 'B', tramo: 'T' }])[0]
    assert.equal(pptoFilaCoincideOpcionTramo({ no_inicio: 'A', no_final: 'B', tramo: 'T' }, op), true)
    assert.equal(pptoFilaCoincideOpcionTramo({ no_inicio: 'A', no_final: 'X', tramo: 'T' }, op), false)
  })
})
