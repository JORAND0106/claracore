import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pptoTramoOpcionLabel,
  pptoConstruirOpcionesTramo,
  pptoFiltrarOpcionesTramo,
  pptoFilaCoincideOpcionTramo,
  pptoFilasFuenteTramos,
  pptoConstruirTramosUnicos,
  pptoFiltrarTramosUnicos,
  pptoFilasDeTramo,
  pptoFilasCapituloTramos,
} from './pptoTramoBusqueda.js'

describe('pptoTramoOpcionLabel', () => {
  it('formatea Nodo Inicio · Nodo Fin · Tramo', () => {
    assert.equal(
      pptoTramoOpcionLabel({ noInicio: 'A', noFinal: 'B', tramo: 'T1' }),
      'A · B · T1',
    )
  })
})

describe('pptoConstruirTramosUnicos (lógica exacta botón Tramos)', () => {
  it('agrupa por no_inicio||no_final y etiqueta Nodo → Nodo', () => {
    const tramos = pptoConstruirTramosUnicos([
      { id: 1, no_inicio: 'A', no_final: 'B', tramo: 'T1' },
      { id: 2, no_inicio: 'A', no_final: 'B', tramo: 'T1' },
      { id: 3, no_inicio: 'C', no_final: 'D', tramo: 'T2' },
    ])
    assert.equal(tramos.length, 2)
    assert.equal(tramos[0].key, 'A||B')
    assert.equal(tramos[0].label, 'A → B')
    assert.equal(tramos[1].label, 'C → D')
  })

  it('omite pares incompletos o no_inicio === no_final', () => {
    const tramos = pptoConstruirTramosUnicos([
      { id: 1, no_inicio: 'A', no_final: '', tramo: 'X' },
      { id: 2, no_inicio: 'M', no_final: 'M', tramo: 'Y' },
      { id: 3, tramo: 'SoloNombre' },
      { id: 4, no_inicio: 'P', no_final: 'Q' },
    ])
    assert.equal(tramos.length, 1)
    assert.equal(tramos[0].label, 'P → Q')
  })

  it('conserva orden de primera aparición (como el Revisor)', () => {
    const tramos = pptoConstruirTramosUnicos([
      { no_inicio: 'Z', no_final: 'Y' },
      { no_inicio: 'A', no_final: 'B' },
    ])
    assert.equal(tramos[0].label, 'Z → Y')
    assert.equal(tramos[1].label, 'A → B')
  })
})

describe('pptoFiltrarTramosUnicos', () => {
  const tramos = pptoConstruirTramosUnicos([
    { no_inicio: 'Norte', no_final: 'Sur' },
    { no_inicio: 'Este', no_final: 'Oeste' },
  ])

  it('sin query devuelve todos', () => {
    assert.equal(pptoFiltrarTramosUnicos(tramos, '').length, 2)
  })

  it('filtra por nodo inicio o fin', () => {
    assert.equal(pptoFiltrarTramosUnicos(tramos, 'norte').length, 1)
    assert.equal(pptoFiltrarTramosUnicos(tramos, 'oeste').length, 1)
    assert.equal(pptoFiltrarTramosUnicos(tramos, 'xyz').length, 0)
  })
})

describe('pptoFilasDeTramo', () => {
  const filas = [
    { id: 1, no_inicio: 'A', no_final: 'B', item: '1' },
    { id: 2, no_inicio: 'A', no_final: 'B', item: '2' },
    { id: 3, no_inicio: 'A', no_final: 'A', item: 'nodo' },
    { id: 4, no_inicio: 'C', no_final: 'D', item: '3' },
  ]
  const tramo = { no_inicio: 'A', no_final: 'B', label: 'A → B' }

  it('coincide exacta no_inicio + no_final (como Revisor)', () => {
    const regs = pptoFilasDeTramo(filas, tramo)
    assert.equal(regs.length, 2)
    assert.deepEqual(regs.map((r) => r.id), [1, 2])
  })
})

describe('pptoFilasCapituloTramos', () => {
  it('filtra por capítulo igual que el Revisor', () => {
    const rows = pptoFilasCapituloTramos([
      { id: 1, capitulo: 'CAP-A' },
      { id: 2, capitulo: 'CAP-B' },
      { id: 3, capitulo: 'CAP-A' },
    ], 'CAP-A')
    assert.equal(rows.length, 2)
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
})

describe('pptoConstruirOpcionesTramo (legacy)', () => {
  it('deduplica triples nodo/tramo', () => {
    const ops = pptoConstruirOpcionesTramo([
      { id: 1, no_inicio: 'A', no_final: 'B', tramo: 'T1' },
      { id: 2, no_inicio: 'A', no_final: 'B', tramo: 'T1' },
    ])
    assert.equal(ops.length, 1)
  })
})

describe('pptoFiltrarOpcionesTramo', () => {
  const ops = pptoConstruirOpcionesTramo([
    { no_inicio: 'Norte', no_final: 'Sur', tramo: 'Calle 1' },
  ])
  it('sin query devuelve todas', () => {
    assert.equal(pptoFiltrarOpcionesTramo(ops, '').length, 1)
  })
})

describe('pptoFilaCoincideOpcionTramo', () => {
  it('coincide por los tres campos', () => {
    const op = pptoConstruirOpcionesTramo([{ no_inicio: 'A', no_final: 'B', tramo: 'T' }])[0]
    assert.equal(pptoFilaCoincideOpcionTramo({ no_inicio: 'A', no_final: 'B', tramo: 'T' }, op), true)
  })
})
