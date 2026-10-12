import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addDaysIso, emptyObservacionesGestionObra, rangoSemanaAnterior } from './gestionObraRango.js'

describe('gestionObraRango', () => {
  it('rangoSemanaAnterior cubre 7 días previos a la reunión', () => {
    const r = rangoSemanaAnterior('2026-10-12')
    assert.equal(r.fecha_hasta, '2026-10-11')
    assert.equal(r.fecha_desde, '2026-10-05')
  })

  it('addDaysIso respeta UTC de calendario', () => {
    assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28')
  })

  it('emptyObservacionesGestionObra tiene las 5 secciones', () => {
    const o = emptyObservacionesGestionObra()
    assert.deepEqual(Object.keys(o).sort(), [
      'actividades',
      'almacen',
      'cantidades_obra',
      'personal_jornada',
      'programacion',
    ])
  })
})
