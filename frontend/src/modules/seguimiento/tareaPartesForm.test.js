import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fechaVencimientoDesdePartes,
  newParteItem,
  partesToPayload,
} from './tareaPartesForm.js'

describe('tareaPartesForm helpers', () => {
  it('newParteItem crea id y campos vacíos', () => {
    const p = newParteItem({ titulo: 'A', fecha: '2026-10-20' })
    assert.equal(p.titulo, 'A')
    assert.equal(p.fecha, '2026-10-20')
    assert.ok(p.id)
    assert.equal(p.estado_gestion, 'abierto')
  })

  it('partesToPayload omite filas sin título y mapea responsables', () => {
    const payload = partesToPayload([
      newParteItem({ titulo: 'Uno', fecha: '2026-10-15', asignado_a_id: 2, asignado_a_nombre: 'Ana' }),
      newParteItem({ titulo: '  ', fecha: '2026-10-16' }),
      newParteItem({
        titulo: 'Dos',
        asignado_a_id: 3,
        asignado_a_nombre: 'Bob',
        notificar_a_id: 9,
        notificar_a_nombre: 'Ref',
        relacion_notificacion: 'referencia',
      }),
    ], { personal: false })
    assert.equal(payload.length, 2)
    assert.equal(payload[0].titulo, 'Uno')
    assert.equal(payload[0].asignado_a_id, 2)
    assert.equal(payload[0].fecha_vencimiento, '2026-10-15')
    assert.equal(payload[1].asignado_a_id, 3)
    assert.equal(payload[1].notificar_a_id, 9)
  })

  it('partesToPayload en personal asigna al creador', () => {
    const payload = partesToPayload(
      [newParteItem({ titulo: 'Mía' })],
      { personal: true, creador: { id: 7, nombre: 'Yo' } },
    )
    assert.equal(payload[0].asignado_a_id, 7)
  })

  it('fechaVencimientoDesdePartes toma la más próxima', () => {
    const due = fechaVencimientoDesdePartes([
      newParteItem({ titulo: 'A', fecha: '2026-10-20', hora: '18:00' }),
      newParteItem({ titulo: 'B', fecha: '2026-10-12', hora: '09:00' }),
      newParteItem({ titulo: 'C' }),
    ])
    assert.equal(due.fecha, '2026-10-12')
    assert.equal(due.hora, '09:00')
  })
})
