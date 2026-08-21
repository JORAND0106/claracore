/**
 * Node tests for visitantes grid helpers.
 * Run: node --test src/modules/seguimiento/visitantesEvento.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { emptyVisitanteRow, visitantesFromDetalle } from './visitantesEventoHelpers.js'

describe('visitantesFromDetalle', () => {
  it('usa visitantes_lista estructurada', () => {
    const rows = visitantesFromDetalle({
      visitantes_lista: [
        { visitante_id: 1, nombre: 'Ana Pérez', cargo: 'Auditora' },
        { nombre: '  ', cargo: 'x' },
      ],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nombre, 'Ana Pérez')
    assert.equal(rows[0].cargo, 'Auditora')
    assert.equal(rows[0].visitante_id, 1)
  })

  it('parsea texto legacy con cargos entre paréntesis', () => {
    const rows = visitantesFromDetalle({
      visitantes: 'Ana Pérez (Auditora), Luis Gómez',
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].nombre, 'Ana Pérez')
    assert.equal(rows[0].cargo, 'Auditora')
    assert.equal(rows[1].nombre, 'Luis Gómez')
    assert.equal(rows[1].cargo, '')
  })

  it('devuelve fila vacía si no hay datos', () => {
    const rows = visitantesFromDetalle({})
    assert.deepEqual(rows, [emptyVisitanteRow()])
  })
})
