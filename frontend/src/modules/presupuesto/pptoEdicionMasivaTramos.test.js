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
  pptoOrigenRegistroTramo,
  pptoFilasDetalleTramo,
  pptoOrigenTramoBadgeStyle,
  pptoActualizarCompetenciaFilas,
  pptoClonarFilasFuenteTramos,
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

describe('pptoOrigenRegistroTramo / pptoFilasDetalleTramo', () => {
  const tramo = { no_inicio: 'A', no_final: 'B', label: 'A → B' }
  const filas = [
    { id: 1, no_inicio: 'A', no_final: 'A' }, // NI
    { id: 2, no_inicio: 'A', no_final: 'B' }, // TR
    { id: 3, no_inicio: 'B', no_final: 'B' }, // NF
    { id: 4, no_inicio: 'X', no_final: 'Y' }, // fuera
  ]

  it('clasifica NI / TR / NF como el Revisor', () => {
    assert.equal(pptoOrigenRegistroTramo(filas[0], tramo), 'NI')
    assert.equal(pptoOrigenRegistroTramo(filas[1], tramo), 'TR')
    assert.equal(pptoOrigenRegistroTramo(filas[2], tramo), 'NF')
    assert.equal(pptoOrigenRegistroTramo(filas[3], tramo), null)
  })

  it('detalle une NI+TR+NF en ese orden', () => {
    const det = pptoFilasDetalleTramo(filas, tramo)
    assert.deepEqual(det.map((x) => `${x.origen}:${x.registro.id}`), ['NI:1', 'TR:2', 'NF:3'])
  })

  it('badge styles distingue colores por origen', () => {
    assert.equal(pptoOrigenTramoBadgeStyle('NI').label, 'NI')
    assert.equal(pptoOrigenTramoBadgeStyle('NF').label, 'NF')
    assert.equal(pptoOrigenTramoBadgeStyle('TR').label, 'TR')
    assert.notEqual(pptoOrigenTramoBadgeStyle('NI').color, pptoOrigenTramoBadgeStyle('NF').color)
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

describe('pptoActualizarCompetenciaFilas', () => {
  it('actualiza competencia solo en los ids afectados (comparación string/number)', () => {
    const filas = [
      { id: 1, competencia: 'Vieja A' },
      { id: 2, competencia: 'Vieja B' },
      { id: 3, competencia: 'Vieja C' },
    ]
    const next = pptoActualizarCompetenciaFilas(filas, ['1', 3], 'Nueva')
    assert.equal(next[0].competencia, 'Nueva')
    assert.equal(next[1].competencia, 'Vieja B')
    assert.equal(next[2].competencia, 'Nueva')
    // No muta el arreglo original
    assert.equal(filas[0].competencia, 'Vieja A')
  })

  it('sin ids o sin competencia deja las filas igual', () => {
    const filas = [{ id: 1, competencia: 'X' }]
    assert.equal(pptoActualizarCompetenciaFilas(filas, [], 'Nueva'), filas)
    assert.equal(pptoActualizarCompetenciaFilas(filas, [1], '  '), filas)
  })

  it('conserva la misma cantidad de filas (no oculta registros al cambiar competencia)', () => {
    const filas = [
      { id: 10, competencia: 'A', no_inicio: 'N1', no_final: 'N2' },
      { id: 11, competencia: 'A', no_inicio: 'N1', no_final: 'N2' },
      { id: 12, competencia: 'B', no_inicio: 'N1', no_final: 'N2' },
    ]
    const next = pptoActualizarCompetenciaFilas(filas, [10, 11], 'Z')
    assert.equal(next.length, filas.length)
    assert.deepEqual(next.map((r) => r.id), [10, 11, 12])
    assert.equal(next[0].competencia, 'Z')
    assert.equal(next[1].competencia, 'Z')
    assert.equal(next[2].competencia, 'B')
    // El detalle del tramo sigue mostrando las mismas filas
    const tramo = { no_inicio: 'N1', no_final: 'N2', label: 'N1 → N2' }
    assert.equal(pptoFilasDetalleTramo(next, tramo).length, 3)
  })
})

describe('pptoClonarFilasFuenteTramos', () => {
  it('clona filas para un snapshot independiente', () => {
    const filas = [{ id: 1, competencia: 'A' }]
    const clone = pptoClonarFilasFuenteTramos(filas)
    assert.notEqual(clone, filas)
    assert.notEqual(clone[0], filas[0])
    clone[0].competencia = 'B'
    assert.equal(filas[0].competencia, 'A')
  })
})
