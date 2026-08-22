import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarMigracionLegadoChecklist,
  mergeLegacyComentariosIntoChecklist,
  mergeLegacyNotificarIntoChecklist,
  normalizeNotificarSubitem,
} from './tareaChecklistMigracion.js'

describe('tareaChecklistMigracion', () => {
  it('fusiona comentarios del ítem en el primer sub-ítem sin duplicar', () => {
    const checklist = [{
      id: 'c1',
      texto: 'A',
      comentarios: [{ id: 'cm1', mensaje: 'Ya estaba', autor_nombre: 'Ana' }],
    }]
    const next = mergeLegacyComentariosIntoChecklist(checklist, [
      { id: 'cm1', mensaje: 'Ya estaba', autor_nombre: 'Ana' },
      { id: 'cm2', mensaje: 'Legacy', autor_nombre: 'Bob' },
    ])
    assert.equal(next[0].comentarios.length, 2)
    assert.equal(next[0].comentarios[1].id, 'cm2')
  })

  it('migra referencia legacy a Notificar a del primer sub-ítem', () => {
    const checklist = [{ id: 'c1', texto: 'A', comentarios: [] }]
    const next = mergeLegacyNotificarIntoChecklist(checklist, {
      relacion_destinatario: 'referencia',
      referido_a_id: 9,
      referido_a_nombre: 'Carla',
    })
    const n = normalizeNotificarSubitem(next[0])
    assert.deepEqual(n, { id: 9, nombre: 'Carla', relacion: 'referencia' })
  })

  it('no pisa notificar_a ya presente ni asignaciones formales', () => {
    const checklist = [{
      id: 'c1',
      notificar_a_id: 3,
      notificar_a_nombre: 'X',
      relacion_notificacion: 'referencia',
    }]
    const next = mergeLegacyNotificarIntoChecklist(checklist, {
      relacion_destinatario: 'referencia',
      referido_a_id: 9,
      referido_a_nombre: 'Carla',
    })
    assert.equal(next[0].notificar_a_id, 3)

    const formal = mergeLegacyNotificarIntoChecklist(
      [{ id: 'c1', texto: 'A' }],
      { relacion_destinatario: 'asignacion', asignado_a_id: 4, asignado_a_nombre: 'D' },
    )
    assert.equal(normalizeNotificarSubitem(formal[0]), null)
  })

  it('aplicarMigracionLegadoChecklist combina ambos', () => {
    const next = aplicarMigracionLegadoChecklist(
      [{ id: 'c1', texto: 'Sub', comentarios: [] }],
      {
        comentarios: [{ id: 'cm9', mensaje: 'Hola', autor_nombre: 'Z' }],
        relacion_destinatario: 'referencia',
        referido_a_id: 2,
        referido_a_nombre: 'Ref',
      },
    )
    assert.equal(next[0].comentarios[0].id, 'cm9')
    assert.equal(next[0].notificar_a_id, 2)
  })
})
