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
  cantidadManualPorCargo,
  capitalizarNombrePropio,
  emptyAsistenciaRow,
  estadoCuentaEnResumen,
  filasAsistenciaPorCargo,
  filtrarCatalogoPorCargo,
  filtrarTrabajadoresRrhh,
  formatHorarioAsistencia,
  mapaEstadosRrhh,
  nombreCompletoRrhh,
  parseFechaISO,
  personalAgregadoDesdeAsistencia,
  resolverCatalogoCargos,
  resumenCargosDesdeCatalogo,
  soloDigitosDocumento,
  stripTramoFilasAutocompletar,
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


  it('encuentra Gustavo y arma cargo/empresa desde payload RRHH real', () => {
    const cat = [{
      id: 101,
      nombres: 'Gustavo',
      apellidos: 'Ramírez López',
      nombre: 'Gustavo Ramírez López',
      tipo_documento: 'CC',
      numero_documento: '80123456',
      cargo_aspira: 'Oficial de obra',
      empresa_nombre: 'Constructora Demo S.A.S.',
      empresa_subcontratista_id: 3,
      estado: 'activo',
    }]
    const hits = filtrarTrabajadoresRrhh(cat, 'gustavo', [])
    assert.equal(hits.length, 1)
    const row = asistenciaRowFromRrhh(hits[0])
    assert.equal(row.nombre, 'Gustavo Ramírez López')
    assert.equal(row.cargo, 'Oficial de obra')
    assert.equal(row.subcontratista_nombre, 'Constructora Demo S.A.S.')
    assert.equal(filtrarTrabajadoresRrhh(cat, 'Zzzinexistente', []).length, 0)
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

  it('con 100+ personas el resumen permanece compacto por cargo', () => {
    const cargos = ['Ayudante', 'Maestro', 'Topógrafo', 'Oficial', 'Operador']
    const rows = Array.from({ length: 120 }, (_, i) => ({
      nombre: `Persona ${i + 1}`,
      cargo: cargos[i % cargos.length],
      estado: 'activo',
      rrhh_trabajador_id: i + 1,
    }))
    const agg = personalAgregadoDesdeAsistencia(rows)
    assert.equal(agg.length, cargos.length)
    assert.equal(agg.reduce((s, r) => s + r.cantidad, 0), 120)
    assert.ok(agg.every((r) => r.cantidad === 24))
  })
})

describe('filasAsistenciaPorCargo / cantidadManualPorCargo', () => {
  it('filtra por cargo case-insensitive y conserva índices originales', () => {
    const rows = [
      { nombre: 'A', cargo: 'Ayudante' },
      { nombre: 'B', cargo: 'Oficial' },
      { nombre: 'C', cargo: 'ayudante' },
      { nombre: 'D', cargo: 'Maestro' },
    ]
    const hits = filasAsistenciaPorCargo(rows, 'Ayudantes'.replace(/s$/, '')) // Ayudante
    assert.equal(hits.length, 2)
    assert.equal(hits[0].index, 0)
    assert.equal(hits[0].row.nombre, 'A')
    assert.equal(hits[1].index, 2)
    assert.equal(hits[1].row.nombre, 'C')
    assert.deepEqual(filasAsistenciaPorCargo(rows, ''), [])
    assert.deepEqual(filasAsistenciaPorCargo(null, 'Oficial'), [])
  })

  it('con 100+ filas el detalle de un cargo solo trae ese subconjunto', () => {
    const rows = Array.from({ length: 110 }, (_, i) => ({
      nombre: `P${i}`,
      cargo: i < 40 ? 'Ayudante' : (i < 70 ? 'Maestro' : 'Topógrafo'),
      estado: 'activo',
    }))
    const ayudantes = filasAsistenciaPorCargo(rows, 'Ayudante')
    assert.equal(ayudantes.length, 40)
    assert.equal(ayudantes[39].index, 39)
    assert.equal(filasAsistenciaPorCargo(rows, 'Maestro').length, 30)
    assert.equal(filasAsistenciaPorCargo(rows, 'Topógrafo').length, 40)
  })

  it('cantidadManualPorCargo lee el aporte directo del cargo', () => {
    assert.equal(cantidadManualPorCargo([{ cargo: 'Ayudante', cantidad: 5 }], 'ayudante'), 5)
    assert.equal(cantidadManualPorCargo([{ cargo: 'Oficial', cantidad: 2 }], 'Ayudante'), 0)
    assert.equal(cantidadManualPorCargo([], 'Oficial'), 0)
  })
})

describe('resumenCargosDesdeCatalogo / filtro por cargo', () => {
  it('muestra todo el catálogo RRHH con ceros e incluye cargos con conteo fuera de catálogo', () => {
    const rows = resumenCargosDesdeCatalogo(
      ['Ayudante', 'Maestro', 'Topógrafo', 'Oficial'],
      [
        { cargo: 'Ayudante', cantidad: 3 },
        { cargo: 'Cadenero', cantidad: 1 },
      ],
    )
    assert.deepEqual(rows, [
      { cargo: 'Ayudante', cantidad: 3 },
      { cargo: 'Cadenero', cantidad: 1 },
      { cargo: 'Maestro', cantidad: 0 },
      { cargo: 'Oficial', cantidad: 0 },
      { cargo: 'Topógrafo', cantidad: 0 },
    ])
  })

  it('resolverCatalogoCargos prioriza API RRHH y cae a trabajadores / fallback', () => {
    assert.deepEqual(
      resolverCatalogoCargos({ catalogoRrhh: ['Operador', 'Ayudante'] }),
      ['Operador', 'Ayudante'],
    )
    assert.deepEqual(
      resolverCatalogoCargos({
        trabajadores: [
          { cargo_aspira: 'Oficial' },
          { cargo_aspira: 'oficial' },
          { cargo_aspira: 'Topógrafo' },
        ],
      }),
      ['Oficial', 'Topógrafo'],
    )
    assert.deepEqual(
      resolverCatalogoCargos({ fallback: ['A', 'B'] }),
      ['A', 'B'],
    )
  })

  it('filtrarCatalogoPorCargo solo deja el cargo de la tarjeta', () => {
    const cat = [
      { id: 1, nombres: 'Ana', cargo_aspira: 'Ayudante' },
      { id: 2, nombres: 'Beto', cargo_aspira: 'Oficial' },
      { id: 3, nombres: 'Cata', cargo_aspira: 'ayudante' },
    ]
    const hits = filtrarCatalogoPorCargo(cat, 'Ayudante')
    assert.equal(hits.length, 2)
    assert.deepEqual(hits.map((t) => t.id), [1, 3])
    assert.equal(filtrarCatalogoPorCargo(cat, 'Maestro').length, 0)
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
        tramo: 'Tramo 1',
      }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nombre, 'Ana Maria')
    assert.equal(rows[0].documento_numero, '123')
    assert.equal(rows[0].hora_salida, '16:30')
    assert.equal(rows[0].rrhh_trabajador_id, 9)
    assert.equal(rows[0].tramo, 'Tramo 1')
    const payload = asistenciaParaPayload(rows)
    assert.equal(payload[0].cargo, 'Cadenero')
    assert.equal(payload[0].hora_salida, '16:30')
    assert.equal(payload[0].tramo, 'Tramo 1')
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

  it('emptyAsistenciaRow incluye tramo vacío; pick RRHH conserva tramo', () => {
    assert.equal(emptyAsistenciaRow().tramo, '')
    const row = asistenciaRowFromRrhh(
      { id: 1, nombres: 'Ana', apellidos: 'X', cargo_aspira: 'Oficial', estado: 'activo' },
      { tramo: 'Tramo Norte' },
    )
    assert.equal(row.tramo, 'Tramo Norte')
  })

  it('stripTramoFilasAutocompletar limpia tramo en filas de plantilla', () => {
    const stripped = stripTramoFilasAutocompletar([
      { nombre: 'A', tramo: 'Tramo 1', cargo: 'Oficial' },
      { equipo_nombre: 'Excavadora', tramo: 'Tramo 2' },
    ])
    assert.equal(stripped[0].tramo, '')
    assert.equal(stripped[0].nombre, 'A')
    assert.equal(stripped[1].tramo, '')
    assert.equal(stripped[1].equipo_nombre, 'Excavadora')
    assert.deepEqual(stripTramoFilasAutocompletar(null), [])
  })
})
