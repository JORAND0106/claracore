import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MSG_FILTRO_PLANO_VACIO,
  filtroPlanoEstaActivo,
  grillaConFiltroPlano,
  interpretarFiltroActivo,
  mensajeFiltroPlano,
} from './pptoFiltroPlano.js'

describe('filtro desde el plano', () => {
  it('reemplaza la grilla solo con los registros de la selección', () => {
    const actuales = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const filtro = { sinCoincidencias: false, registros: [{ id: 9 }, { id: 8 }], ids: [9, 8] }
    assert.equal(filtroPlanoEstaActivo(filtro), true)
    assert.deepEqual(grillaConFiltroPlano(actuales, filtro), filtro.registros)
    assert.equal(mensajeFiltroPlano(filtro), 'Filtro desde el plano · 2 registros')
  })

  it('sin coincidencias no altera la grilla y deja un mensaje', () => {
    const actuales = [{ id: 1 }]
    const filtro = { sinCoincidencias: true, registros: [], ids: [], mensaje: '' }
    assert.equal(filtroPlanoEstaActivo(filtro), false)
    assert.deepEqual(grillaConFiltroPlano(actuales, filtro), actuales)
    assert.equal(mensajeFiltroPlano(filtro), MSG_FILTRO_PLANO_VACIO)
  })

  it('ignora una operación ya vista en la sesión y no persiste por sí sola', () => {
    const vistos = new Set([4])
    assert.equal(interpretarFiltroActivo({ pendiente: true, op_id: 4, ids: [1], registros: [{ id: 1 }] }, vistos), null)
    const nuevo = interpretarFiltroActivo({
      pendiente: true,
      op_id: 5,
      ids: [],
      registros: [],
      sin_coincidencias: true,
      mensaje: 'Ninguna entidad seleccionada en el plano corresponde a un registro del presupuesto.',
    }, vistos)
    assert.equal(nuevo.sinCoincidencias, true)
    assert.equal(nuevo.opId, 5)
    assert.match(nuevo.mensaje, /Ninguna entidad/)
  })
})
