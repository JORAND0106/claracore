import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pptoTramoOpcionLabel,
  pptoConstruirOpcionesTramo,
  pptoFiltrarOpcionesTramo,
  pptoFilaCoincideOpcionTramo,
  pptoFilasFuenteTramos,
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
  })

  it('incluye filas solo con tramo', () => {
    const ops = pptoConstruirOpcionesTramo([{ id: 1, tramo: 'Calle 9' }])
    assert.equal(ops.length, 1)
    assert.equal(ops[0].label, '— · — · Calle 9')
  })

  it('acepta alias nodo_inicio/nodo_final', () => {
    const ops = pptoConstruirOpcionesTramo([
      { id: 1, nodo_inicio: 'X', nodo_final: 'Y', tramo: 'Z' },
    ])
    assert.equal(ops.length, 1)
    assert.equal(ops[0].noInicio, 'X')
  })
})

describe('pptoFilasFuenteTramos', () => {
  it('prioriza grilla filtrada y cae a registros si está vacía', () => {
    const a = pptoFilasFuenteTramos({
      registrosGrilla: [{ id: 1, tramo: 'T' }],
      registros: [{ id: 2, tramo: 'U' }],
      seleccionados: [],
      esSellado: () => false,
    })
    assert.equal(a.length, 1)
    assert.equal(a[0].id, 1)

    const b = pptoFilasFuenteTramos({
      registrosGrilla: [],
      registros: [{ id: 2, tramo: 'U' }],
      seleccionados: [],
      esSellado: () => false,
    })
    assert.equal(b.length, 1)
    assert.equal(b[0].id, 2)
  })

  it('omite sellados', () => {
    const rows = pptoFilasFuenteTramos({
      registrosGrilla: [
        { id: 1, tramo: 'T', sellado: true },
        { id: 2, tramo: 'U' },
      ],
      registros: [],
      seleccionados: [],
      esSellado: (r) => r.sellado === true,
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 2)
  })

  it('incluye seleccionados aunque no estén en la grilla filtrada', () => {
    const rows = pptoFilasFuenteTramos({
      registrosGrilla: [{ id: 1, tramo: 'T' }],
      registros: [
        { id: 1, tramo: 'T' },
        { id: 9, no_inicio: 'A', no_final: 'B', tramo: 'Sel' },
      ],
      seleccionados: new Set([9]),
      esSellado: () => false,
    })
    assert.equal(rows.length, 2)
    assert.ok(rows.some((r) => r.id === 9))
  })
})

describe('pptoFiltrarOpcionesTramo', () => {
  const ops = pptoConstruirOpcionesTramo([
    { no_inicio: 'Norte', no_final: 'Sur', tramo: 'Calle 1' },
    { no_inicio: 'Este', no_final: 'Oeste', tramo: 'Calle 2' },
  ])

  it('sin query devuelve todas', () => {
    assert.equal(pptoFiltrarOpcionesTramo(ops, '').length, 2)
    assert.equal(pptoFiltrarOpcionesTramo(ops, '  ').length, 2)
  })

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
