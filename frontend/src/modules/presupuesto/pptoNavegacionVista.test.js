import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pptoPopVistaAnterior, pptoTotalesSeleccion } from './pptoNavegacionVista.js'

describe('pptoPopVistaAnterior', () => {
  it('con una sola entrada restaura esa vista previa y vacía el stack', () => {
    const stack = [{ id: 'prev' }]
    assert.deepEqual(pptoPopVistaAnterior(stack), { id: 'prev' })
    assert.deepEqual(stack, [])
  })

  it('con varias entradas descarta el tope (vista actual) y restaura la anterior', () => {
    const stack = [{ id: 'a' }, { id: 'b' }, { id: 'actual' }]
    assert.deepEqual(pptoPopVistaAnterior(stack), { id: 'b' })
    assert.deepEqual(stack, [{ id: 'a' }, { id: 'b' }])
  })

  it('stack vacío → null', () => {
    assert.equal(pptoPopVistaAnterior([]), null)
    assert.equal(pptoPopVistaAnterior(null), null)
  })
})

describe('pptoTotalesSeleccion', () => {
  const rows = [
    { id: 1, cant_total: 10, costo_directo: 100 },
    { id: 2, cant_total: 2.5, costo_directo: 50.5 },
    { id: 3, cant_total: 1, costo_directo: 10 },
  ]

  it('suma solo filas seleccionadas', () => {
    assert.deepEqual(pptoTotalesSeleccion(rows, new Set([1, 3])), {
      n: 2,
      cant: 11,
      costo: 110,
    })
  })

  it('sin selección → ceros', () => {
    assert.deepEqual(pptoTotalesSeleccion(rows, new Set()), { n: 0, cant: 0, costo: 0 })
  })

  it('ignora valores no numéricos', () => {
    assert.deepEqual(
      pptoTotalesSeleccion(
        [{ id: 1, cant_total: 'x', costo_directo: null }],
        new Set([1]),
      ),
      { n: 1, cant: 0, costo: 0 },
    )
  })
})
