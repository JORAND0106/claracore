/**
 * node --test src/modules/seguimiento/bitacoraHorario.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularHorasExtra,
  horasLaborablesDia,
  horasPrecargaDesdeHorario,
  horasSemanales,
  horarioDefault,
  keyDiaDesdeFechaISO,
  normalizeHorario,
} from './bitacoraHorario.js'

describe('bitacoraHorario', () => {
  it('default Lun–Vie 8h (con almuerzo) y 40h semanales', () => {
    const h = horarioDefault('2026-11-10')
    assert.equal(h.vigente_desde, '2026-11-10')
    assert.equal(horasLaborablesDia(h.dias.lun), 8)
    assert.equal(horasLaborablesDia(h.dias.sab), 0)
    assert.equal(horasSemanales(h), 40)
  })

  it('sábado media jornada sin almuerzo', () => {
    const h = normalizeHorario({
      dias: {
        sab: {
          laborable: true,
          entrada: '07:30',
          salida: '12:30',
          almuerzo_inicio: '',
          almuerzo_fin: '',
        },
      },
    })
    assert.equal(horasLaborablesDia(h.dias.sab), 5)
  })

  it('keyDiaDesdeFechaISO mapea weekday Colombia-friendly', () => {
    // 2026-11-10 es martes
    assert.equal(keyDiaDesdeFechaISO('2026-11-10'), 'mar')
    assert.equal(keyDiaDesdeFechaISO('2026-11-08'), 'dom')
  })

  it('precarga y horas extra en día laborable', () => {
    const h = horarioDefault()
    const pre = horasPrecargaDesdeHorario(h, '2026-11-10') // mar
    assert.equal(pre.hora_ingreso, '07:30')
    assert.equal(pre.hora_salida, '16:30')
    assert.equal(pre.horas_jornada, 8)
    // Trabaja hasta 18:30 → 2h extra (almuerzo descontado)
    assert.equal(
      calcularHorasExtra({
        hora_ingreso: '07:30',
        hora_salida: '18:30',
        horario: h,
        fechaISO: '2026-11-10',
      }),
      2,
    )
    // Sin extra
    assert.equal(
      calcularHorasExtra({
        hora_ingreso: '07:30',
        hora_salida: '16:30',
        horario: h,
        fechaISO: '2026-11-10',
      }),
      0,
    )
  })

  it('día no laborable: todas las horas son extra', () => {
    const h = horarioDefault()
    assert.equal(
      calcularHorasExtra({
        hora_ingreso: '08:00',
        hora_salida: '12:00',
        horario: h,
        fechaISO: '2026-11-08', // domingo
      }),
      4,
    )
  })
})
