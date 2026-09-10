/**
 * Node tests — asistencia colaboradores Diario (RRHH).
 * Run: node --test src/modules/seguimiento/personalAsistenciaHelpers.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  HINT_REGISTRAR_EN_RRHH,
  HORA_SALIDA_DEFAULT,
  asistenciaFromEntrada,
  asistenciaParaPayload,
  asistenciaRowFromRrhh,
  capitalizarNombrePropio,
  estadoCuentaEnResumen,
  filtrarTrabajadoresRrhh,
  formatHorarioAsistencia,
  mapaEstadosRrhh,
  nombreCompletoRrhh,
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

describe('fechas / estados RRHH', () => {
  it('parsea fecha ISO', () => {
    assert.equal(parseFechaISO('2026-08-27T12:00:00Z'), '2026-08-27')
    assert.equal(parseFechaISO(''), '')
    assert.equal(parseFechaISO('no-fecha'), '')
  })
  it('solo Activo cuenta en resumen', () => {
    assert.equal(estadoCuentaEnResumen('activo'), true)
    assert.equal(estadoCuentaEnResumen('incapacitado'), false)
    assert.equal(estadoCuentaEnResumen('inactivo'), false)
    assert.equal(estadoCuentaEnResumen('retirado'), false)
  })
})

describe('RRHH mapping / filtro', () => {
  it('arma fila desde trabajador RRHH', () => {
    const row = asistenciaRowFromRrhh({
      id: 7,
      nombres: 'ana',
      apellidos: 'lopez',
      tipo_documento: 'CC',
      numero_documento: '12.3',
      cargo_aspira: 'Oficial',
      empresa_nombre: 'Consorcio X',
      empresa_subcontratista_id: null,
      estado: 'activo',
    })
    assert.equal(row.rrhh_trabajador_id, 7)
    assert.equal(row.nombre, 'Ana Lopez')
    assert.equal(row.cargo, 'Oficial')
    assert.equal(row.subcontratista_nombre, 'Consorcio X')
    assert.equal(row.hora_salida, HORA_SALIDA_DEFAULT)
    assert.equal(row.origen, 'rrhh')
  })

  it('filtra catálogo y excluye ya usados', () => {
    const cat = [
      { id: 1, nombres: 'Juan', apellidos: 'Perez', cargo_aspira: 'Ayudante', numero_documento: '111' },
      { id: 2, nombres: 'Maria', apellidos: 'Ruiz', cargo_aspira: 'Oficial', numero_documento: '222' },
    ]
    assert.equal(filtrarTrabajadoresRrhh(cat, 'mar', []).length, 1)
    assert.equal(filtrarTrabajadoresRrhh(cat, '', [1]).length, 1)
    assert.equal(filtrarTrabajadoresRrhh(cat, 'xyz', []).length, 0)
    assert.ok(HINT_REGISTRAR_EN_RRHH.includes('RRHH'))
    assert.equal(nombreCompletoRrhh(cat[0]), 'Juan Perez')
  })
})

describe('personalAgregadoDesdeAsistencia', () => {
  it('cuenta solo activos por cargo (snapshot)', () => {
    const rows = personalAgregadoDesdeAsistencia([
      { nombre: 'A', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'B', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'C', cargo: 'Ayudante', estado: 'activo' },
      { nombre: 'D', cargo: 'Oficial', estado: 'incapacitado' },
      { nombre: 'E', cargo: 'Oficial', estado: 'inactivo' },
      { nombre: 'F', cargo: '', estado: 'activo' },
      { nombre: 'G', cargo: 'Oficial', estado: 'retirado' },
    ])
    assert.deepEqual(rows, [
      { cargo: 'Ayudante', cantidad: 1 },
      { cargo: 'Oficial', cantidad: 2 },
    ])
  })

  it('con liveEstadosByRrhhId usa estado actual de RRHH (reporte abierto)', () => {
    const rows = [
      { nombre: 'A', cargo: 'Oficial', estado: 'activo', rrhh_trabajador_id: 1 },
      { nombre: 'B', cargo: 'Oficial', estado: 'activo', rrhh_trabajador_id: 2 },
    ]
    const live = mapaEstadosRrhh([
      { id: 1, estado: 'activo' },
      { id: 2, estado: 'inactivo' },
    ])
    const agg = personalAgregadoDesdeAsistencia(rows, { liveEstadosByRrhhId: live })
    assert.deepEqual(agg, [{ cargo: 'Oficial', cantidad: 1 }])
  })

  it('sin live map (cerrado) conserva snapshot y no se altera con RRHH posterior', () => {
    const rows = [
      { nombre: 'A', cargo: 'Oficial', estado: 'activo', rrhh_trabajador_id: 1 },
    ]
    // Aunque RRHH ahora diga inactivo, al no pasar live map se usa el snapshot.
    const agg = personalAgregadoDesdeAsistencia(rows, { liveEstadosByRrhhId: null })
    assert.deepEqual(agg, [{ cargo: 'Oficial', cantidad: 1 }])
  })
})

describe('asistenciaFromEntrada / payload', () => {
  it('normaliza filas y arma payload con horario del día', () => {
    const rows = asistenciaFromEntrada({
      asistencia_colaboradores: [{
        rrhh_trabajador_id: 9,
        nombre: 'ana maria',
        documento_numero: '12.3',
        cargo: 'Cadenero',
        estado: 'Activo',
        hora_salida: '',
        fecha_ingreso: '2026-01-15',
        origen: 'rrhh',
      }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nombre, 'Ana Maria')
    assert.equal(rows[0].documento_numero, '123')
    assert.equal(rows[0].hora_salida, '16:30')
    assert.equal(rows[0].rrhh_trabajador_id, 9)
    const payload = asistenciaParaPayload(rows)
    assert.equal(payload[0].cargo, 'Cadenero')
    assert.equal(payload[0].hora_salida, '16:30')
  })

  it('conserva horario aunque el estado RRHH no sea activo', () => {
    const rows = asistenciaFromEntrada([
      {
        nombre: 'Luis',
        cargo: 'Oficial',
        estado: 'inactivo',
        hora_ingreso: '07:00',
        hora_salida: '16:30',
        rrhh_trabajador_id: 3,
        origen: 'rrhh',
      },
    ])
    assert.equal(rows[0].hora_ingreso, '07:00')
    assert.equal(rows[0].hora_salida, '16:30')
    assert.equal(formatHorarioAsistencia(rows[0]), '07:00 – 16:30')
    assert.equal(personalAgregadoDesdeAsistencia(rows).length, 0)
  })
})
