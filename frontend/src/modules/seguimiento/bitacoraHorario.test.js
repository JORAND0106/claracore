/**
 * node --test src/modules/seguimiento/bitacoraHorario.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularHorasExtra,
  etiquetaDiaEspecial,
  horasLaborablesDia,
  horasPrecargaDesdeHorario,
  horasSemanales,
  horarioDefault,
  keyDiaDesdeFechaISO,
  normalizeHorario,
  tieneJornadaOrdinaria,
} from './bitacoraHorario.js'

describe('bitacoraHorario', () => {
  it('default Lun–Vie 8h (con almuerzo) y 40h semanales', () => {
    const h = horarioDefault('2026-11-10')
    assert.equal(h.vigente_desde, '2026-11-10')
    assert.equal(h.nocturno_inicio, '19:00')
    assert.equal(h.nocturno_fin, '06:00')
    assert.equal(horasLaborablesDia(h.dias.lun), 8)
    assert.equal(horasLaborablesDia(h.dias.sab), 0)
    assert.equal(horasSemanales(h), 40)
  })

  it('normaliza franja nocturna del contrato', () => {
    const h = normalizeHorario({ nocturno_inicio: '21:00', nocturno_fin: '05:00' })
    assert.equal(h.nocturno_inicio, '21:00')
    assert.equal(h.nocturno_fin, '05:00')
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

  it('festivo lunes (16/11/2026): 08:00–11:00 → 3.00 extra festivo', () => {
    const h = horarioDefault()
    assert.equal(tieneJornadaOrdinaria(h, '2026-11-16'), false)
    assert.equal(etiquetaDiaEspecial('2026-11-16', h), 'Festivo')
    assert.equal(
      calcularHorasExtra({
        hora_ingreso: '08:00',
        hora_salida: '11:00',
        horario: h,
        fechaISO: '2026-11-16',
      }),
      3,
    )
    // Lunes ordinario no festivo: dentro de jornada → 0
    assert.equal(
      calcularHorasExtra({
        hora_ingreso: '08:00',
        hora_salida: '11:00',
        horario: h,
        fechaISO: '2026-11-09',
      }),
      0,
    )
  })

  it('domingo laborable en contrato respeta jornada ordinaria', () => {
    const h = normalizeHorario({
      dias: {
        dom: {
          laborable: true,
          entrada: '08:00',
          salida: '12:00',
          almuerzo_inicio: '',
          almuerzo_fin: '',
        },
      },
    })
    assert.equal(tieneJornadaOrdinaria(h, '2026-11-08'), true)
    assert.equal(etiquetaDiaEspecial('2026-11-08', h), null)
    assert.equal(
      calcularHorasExtra({
        hora_ingreso: '08:00',
        hora_salida: '12:00',
        horario: h,
        fechaISO: '2026-11-08',
      }),
      0,
    )
  })
})
