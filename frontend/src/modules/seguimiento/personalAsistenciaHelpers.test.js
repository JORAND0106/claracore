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

describe('personalAgregadoDesdeAsistencia', () => {
  it('cuenta solo activos por cargo', () => {
    const rows = personalAgregadoDesdeAsistencia([
      { nombre: 'A', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'B', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'C', cargo: 'Ayudante', estado: 'activo' },
      { nombre: 'D', cargo: 'Oficial', estado: 'incapacitado' },
      { nombre: 'E', cargo: '', estado: 'activo' },
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
      }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nombre, 'Ana Maria')
    assert.equal(rows[0].documento_numero, '123')
    assert.equal(rows[0].hora_salida, '16:30')
    const payload = asistenciaParaPayload(rows)
    assert.equal(payload[0].cargo, 'Cadenero')
  })
})
