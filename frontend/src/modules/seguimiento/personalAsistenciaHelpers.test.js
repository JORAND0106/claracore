/**
 * Node tests — asistencia colaboradores Diario.
 * Run: node --test src/modules/seguimiento/personalAsistenciaHelpers.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  asistenciaFromEntrada,
  asistenciaParaPayload,
  capitalizarNombrePropio,
  estadoPermiteFechaRetiro,
  estadoSinJornada,
  parseFechaISO,
  personalAgregadoDesdeAsistencia,
  soloDigitosDocumento,
} from './personalAsistenciaHelpers.js'

describe('capitalizarNombrePropio / documento', () => {
  it('capitaliza nombre propio', () => {
    assert.equal(capitalizarNombrePropio('  juan CARLOS  pérez '), 'Juan Carlos Pérez')
  })
  it('solo dígitos en documento', () => {
    assert.equal(soloDigitosDocumento('1.234.567-8'), '12345678')
  })
})

describe('fechas / estados jornada', () => {
  it('parsea fecha ISO', () => {
    assert.equal(parseFechaISO('2026-08-27T12:00:00Z'), '2026-08-27')
    assert.equal(parseFechaISO(''), '')
    assert.equal(parseFechaISO('no-fecha'), '')
  })
  it('Inactivo e Incapacitado no tienen jornada; retiro solo Inactivo', () => {
    assert.equal(estadoSinJornada('activo'), false)
    assert.equal(estadoSinJornada('incapacitado'), true)
    assert.equal(estadoSinJornada('inactivo'), true)
    assert.equal(estadoPermiteFechaRetiro('inactivo'), true)
    assert.equal(estadoPermiteFechaRetiro('incapacitado'), false)
    assert.equal(estadoPermiteFechaRetiro('activo'), false)
  })
})

describe('personalAgregadoDesdeAsistencia', () => {
  it('cuenta solo activos por cargo', () => {
    const rows = personalAgregadoDesdeAsistencia([
      { nombre: 'A', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'B', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'C', cargo: 'Ayudante', estado: 'activo' },
      { nombre: 'D', cargo: 'Oficial', estado: 'incapacitado' },
      { nombre: 'E', cargo: 'Oficial', estado: 'inactivo' },
      { nombre: 'F', cargo: '', estado: 'activo' },
    ])
    assert.deepEqual(rows, [
      { cargo: 'Ayudante', cantidad: 1 },
      { cargo: 'Oficial', cantidad: 2 },
    ])
  })
})

describe('asistenciaFromEntrada / payload', () => {
  it('normaliza filas y arma payload', () => {
    const rows = asistenciaFromEntrada({
      asistencia_colaboradores: [{
        nombre: 'ana maria',
        documento_numero: '12.3',
        cargo: 'Cadenero',
        estado: 'Activo',
        hora_salida: '',
        fecha_ingreso: '2026-01-15',
      }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nombre, 'Ana Maria')
    assert.equal(rows[0].documento_numero, '123')
    assert.equal(rows[0].hora_salida, '16:30')
    assert.equal(rows[0].fecha_ingreso, '2026-01-15')
    const payload = asistenciaParaPayload(rows)
    assert.equal(payload[0].cargo, 'Cadenero')
    assert.equal(payload[0].fecha_ingreso, '2026-01-15')
  })

  it('limpia horas si Inactivo o Incapacitado y conserva fechas', () => {
    const rows = asistenciaFromEntrada([
      {
        nombre: 'Luis',
        cargo: 'Oficial',
        estado: 'inactivo',
        hora_ingreso: '07:00',
        hora_salida: '16:30',
        fecha_ingreso: '2025-03-01',
        fecha_retiro: '2026-08-27',
      },
      {
        nombre: 'Ana',
        cargo: 'Ayudante',
        estado: 'incapacitado',
        hora_ingreso: '08:00',
        hora_salida: '16:30',
      },
    ])
    assert.equal(rows[0].hora_ingreso, '')
    assert.equal(rows[0].hora_salida, '')
    assert.equal(rows[0].fecha_retiro, '2026-08-27')
    assert.equal(rows[1].hora_ingreso, '')
    const payload = asistenciaParaPayload(rows)
    assert.equal(payload[0].hora_ingreso, null)
    assert.equal(payload[0].hora_salida, null)
    assert.equal(payload[1].hora_salida, null)
    assert.equal(personalAgregadoDesdeAsistencia(rows).length, 0)
  })
})
