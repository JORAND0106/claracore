/**
 * Node tests — asistencia colaboradores Diario (RRHH).
 * Run: node --test src/modules/seguimiento/personalAsistenciaHelpers.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPRESA_REGISTRO_DIRECTO,
  EMPRESA_SIN_NOMBRE,
  HINT_OPERADOR_DESDE_ASISTENCIA,
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
  filtrarCatalogoPorCargoYEmpresa,
  filtrarTrabajadoresRrhh,
  formatHorarioAsistencia,
  mapaEstadosRrhh,
  nombreCompletoRrhh,
  nombreEmpresaAsistencia,
  operadorEstaEnAsistencia,
  operadorSelectValue,
  opcionesOperadorDesdeAsistencia,
  parseFechaISO,
  parseOperadorSelectValue,
  personalAgregadoDesdeAsistencia,
  personalAgregadoPorEmpresaCargo,
  resolverCatalogoCargos,
  resumenCargosDesdeCatalogo,
  resumenEmpresasCargos,
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

  it('excluye Administrativo del catálogo y del picker (exacto; no Residente Administrativo)', () => {
    assert.deepEqual(
      resolverCatalogoCargos({
        catalogoRrhh: ['Administrativo', 'Oficial', 'Residente Administrativo', 'administrativo'],
      }),
      ['Oficial', 'Residente Administrativo'],
    )
    const rows = resumenCargosDesdeCatalogo(
      ['Administrativo', 'Oficial', 'Residente Administrativo'],
      [
        { cargo: 'Administrativo', cantidad: 2 },
        { cargo: 'Oficial', cantidad: 1 },
      ],
    )
    assert.deepEqual(rows, [
      { cargo: 'Oficial', cantidad: 1 },
      { cargo: 'Residente Administrativo', cantidad: 0 },
    ])
    const cat = [
      { id: 1, nombres: 'Ana', cargo_aspira: 'Oficial' },
      { id: 2, nombres: 'Beth', cargo_aspira: 'Administrativo' },
      { id: 3, nombres: 'Carla', cargo_aspira: 'Residente Administrativo' },
    ]
    const hits = filtrarTrabajadoresRrhh(cat, '')
    assert.deepEqual(hits.map((t) => t.id), [1, 3])
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

describe('resumen por empresa → cargo', () => {
  it('agrupa por empresa sin duplicar personas entre empresas', () => {
    const rows = [
      { nombre: 'A', cargo: 'Ayudante', estado: 'activo', subcontratista_nombre: 'Empresa A' },
      { nombre: 'B', cargo: 'Ayudante', estado: 'activo', subcontratista_nombre: 'Empresa A' },
      { nombre: 'C', cargo: 'Oficial', estado: 'activo', subcontratista_nombre: 'Empresa A' },
      { nombre: 'D', cargo: 'Ayudante', estado: 'activo', subcontratista_nombre: 'Empresa B' },
      { nombre: 'E', cargo: 'Topógrafo', estado: 'activo', subcontratista_nombre: 'Empresa B' },
      { nombre: 'F', cargo: 'Ayudante', estado: 'inactivo', subcontratista_nombre: 'Empresa B' },
    ]
    const agg = personalAgregadoPorEmpresaCargo(rows)
    assert.equal(agg.length, 2)
    assert.equal(agg[0].empresa, 'Empresa A')
    assert.equal(agg[0].total, 3)
    assert.deepEqual(agg[0].agregado, [
      { cargo: 'Ayudante', cantidad: 2 },
      { cargo: 'Oficial', cantidad: 1 },
    ])
    assert.equal(agg[1].empresa, 'Empresa B')
    assert.equal(agg[1].total, 2)
    assert.deepEqual(agg[1].agregado, [
      { cargo: 'Ayudante', cantidad: 1 },
      { cargo: 'Topógrafo', cantidad: 1 },
    ])
    assert.equal(nombreEmpresaAsistencia({}), EMPRESA_SIN_NOMBRE)
  })

  it('resumenEmpresasCargos solo lista cargos con registros (sin vacíos ni empresas en cero)', () => {
    const groups = resumenEmpresasCargos({
      rows: [
        { nombre: 'A', cargo: 'Ayudante', estado: 'activo', subcontratista_nombre: 'Consorcio X' },
        { nombre: 'B', cargo: 'Oficial', estado: 'activo', subcontratista_nombre: 'Sub Y' },
      ],
      personalManual: [{ cargo: 'Maestro', cantidad: 2 }],
    })
    assert.equal(groups.length, 3) // Consorcio X, Sub Y, registro directo
    const consorcio = groups.find((g) => g.empresa === 'Consorcio X')
    assert.ok(consorcio)
    assert.deepEqual(consorcio.cargos, [{ cargo: 'Ayudante', cantidad: 1 }])
    assert.equal(consorcio.total, 1)
    assert.equal(consorcio.cargos.some((c) => c.cantidad === 0), false)
    const sub = groups.find((g) => g.empresa === 'Sub Y')
    assert.deepEqual(sub.cargos, [{ cargo: 'Oficial', cantidad: 1 }])
    assert.equal(groups.some((g) => g.empresa === 'Otra Z'), false)
    const manual = groups.find((g) => g.esRegistroDirecto)
    assert.equal(manual.empresa, EMPRESA_REGISTRO_DIRECTO)
    assert.deepEqual(manual.cargos, [{ cargo: 'Maestro', cantidad: 2 }])
  })

  it('filas y catálogo respetan filtro empresa+cargo', () => {
    const rows = [
      { nombre: 'A', cargo: 'Ayudante', subcontratista_nombre: 'Empresa A' },
      { nombre: 'B', cargo: 'Ayudante', subcontratista_nombre: 'Empresa B' },
      { nombre: 'C', cargo: 'Oficial', subcontratista_nombre: 'Empresa A' },
    ]
    assert.equal(filasAsistenciaPorCargo(rows, 'Ayudante').length, 2)
    assert.equal(filasAsistenciaPorCargo(rows, 'Ayudante', { empresa: 'Empresa A' }).length, 1)
    assert.equal(filasAsistenciaPorCargo(rows, 'Ayudante', { empresa: 'Empresa A' })[0].row.nombre, 'A')

    const cat = [
      { id: 1, cargo_aspira: 'Ayudante', empresa_nombre: 'Empresa A' },
      { id: 2, cargo_aspira: 'Ayudante', empresa_nombre: 'Empresa B' },
      { id: 3, cargo_aspira: 'Oficial', empresa_nombre: 'Empresa A' },
    ]
    assert.deepEqual(
      filtrarCatalogoPorCargoYEmpresa(cat, 'Ayudante', 'Empresa A').map((t) => t.id),
      [1],
    )
  })
})

describe('opcionesOperadorDesdeAsistencia', () => {
  it('lista solo nominados del día, sin duplicar por rrhh id', () => {
    const ops = opcionesOperadorDesdeAsistencia([
      { nombre: 'Ana Lopez', cargo: 'Operador', rrhh_trabajador_id: 1 },
      { nombre: '', cargo: 'Oficial', rrhh_trabajador_id: 2 },
      { nombre: 'Ana Lopez', cargo: 'Operador', rrhh_trabajador_id: 1 },
      { nombre: 'Beto Ruiz', cargo: 'Ayudante', rrhh_trabajador_id: 3 },
    ])
    assert.equal(ops.length, 2)
    assert.equal(ops[0].nombre, 'Ana Lopez')
    assert.equal(ops[0].value, 'id:1')
    assert.equal(ops[0].label, 'Ana Lopez · Operador')
    assert.equal(ops[1].nombre, 'Beto Ruiz')
  })

  it('parse/select value y validación contra asistencia del día', () => {
    const asistencia = [
      { nombre: 'Ana Lopez', cargo: 'Operador', rrhh_trabajador_id: 7, estado: 'activo' },
    ]
    const ops = opcionesOperadorDesdeAsistencia(asistencia)
    assert.deepEqual(parseOperadorSelectValue('id:7', ops), {
      operador: 'Ana Lopez',
      operador_rrhh_id: 7,
    })
    assert.deepEqual(parseOperadorSelectValue('', ops), {
      operador: '',
      operador_rrhh_id: null,
    })
    assert.equal(operadorSelectValue({ operador: 'Ana Lopez', operador_rrhh_id: 7 }), 'id:7')
    assert.equal(operadorEstaEnAsistencia({ operador: '', operador_rrhh_id: null }, asistencia), true)
    assert.equal(
      operadorEstaEnAsistencia({ operador: 'Ana Lopez', operador_rrhh_id: 7 }, asistencia),
      true,
    )
    assert.equal(
      operadorEstaEnAsistencia({ operador: 'Ghost', operador_rrhh_id: 99 }, asistencia),
      false,
    )
    assert.ok(HINT_OPERADOR_DESDE_ASISTENCIA.includes('asistencia'))
  })

  it('seleccionar operador no duplica el conteo del resumen por cargo', () => {
    const asistencia = [
      { nombre: 'Ana Lopez', cargo: 'Operador', estado: 'activo', rrhh_trabajador_id: 7 },
      { nombre: 'Beto Ruiz', cargo: 'Ayudante', estado: 'activo', rrhh_trabajador_id: 8 },
    ]
    const resumen = personalAgregadoDesdeAsistencia(asistencia)
    assert.deepEqual(resumen, [
      { cargo: 'Ayudante', cantidad: 1 },
      { cargo: 'Operador', cantidad: 1 },
    ])
    // Vincular Ana a maquinaria no agrega filas a asistencia ni altera el agregado.
    const uso = parseOperadorSelectValue('id:7', opcionesOperadorDesdeAsistencia(asistencia))
    assert.equal(uso.operador_rrhh_id, 7)
    assert.deepEqual(personalAgregadoDesdeAsistencia(asistencia), resumen)
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
