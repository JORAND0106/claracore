import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actaEstaBloqueada,
  buildActasPages,
  buildBitacoraPages,
  equiposConUso,
  formatClimaResumen,
  formatEquipoDetalle,
  formatMaterialLine,
  formatNumerosVale,
  materialRowCells,
  materialesConRegistro,
  personalConCantidad,
} from './libroDigitalUtils.js'

describe('buildBitacoraPages', () => {
  it('agrupa por día: diario antes que eventos, fechas ascendentes', () => {
    const pages = buildBitacoraPages([
      { id: 3, tipo: 'evento', fecha: '2026-08-12', created_at: '2026-08-12T14:00:00Z', evento_tipo: 'novedades' },
      { id: 1, tipo: 'diario', fecha: '2026-08-12', created_at: '2026-08-12T08:00:00Z' },
      { id: 2, tipo: 'evento', fecha: '2026-08-12', created_at: '2026-08-12T10:00:00Z', evento_tipo: 'visita_terceros' },
      { id: 4, tipo: 'diario', fecha: '2026-08-10', created_at: '2026-08-10T09:00:00Z' },
      { id: 5, tipo: 'evento', fecha: '2026-08-11', created_at: '2026-08-11T11:00:00Z' },
    ])
    assert.deepEqual(
      pages.map((p) => `${p.kind}:${p.sourceId}`),
      ['diario:4', 'evento:5', 'diario:1', 'evento:2', 'evento:3'],
    )
  })

  it('omite filas sin fecha', () => {
    const pages = buildBitacoraPages([
      { id: 1, tipo: 'diario', fecha: '' },
      { id: 2, tipo: 'diario', fecha: '2026-08-01' },
    ])
    assert.equal(pages.length, 1)
    assert.equal(pages[0].sourceId, 2)
  })
})

describe('buildActasPages', () => {
  it('ordena por fecha y consecutivo; marca bloqueadas', () => {
    const pages = buildActasPages([
      { id: 2, consecutivo: 2, fecha_reunion: '2026-08-20', puede_abrir: true },
      { id: 1, consecutivo: 1, fecha_reunion: '2026-08-10', puede_abrir: false },
      { id: 3, consecutivo: 3, fecha_reunion: '2026-08-10', acceso_restringido: true },
    ])
    assert.equal(pages[0].kind, 'acta_bloqueada')
    assert.equal(pages[0].sourceId, 1)
    assert.equal(pages[1].kind, 'acta_bloqueada')
    assert.equal(pages[1].sourceId, 3)
    assert.equal(pages[2].kind, 'acta')
    assert.equal(pages[2].sourceId, 2)
  })
})

describe('helpers', () => {
  it('actaEstaBloqueada', () => {
    assert.equal(actaEstaBloqueada({ puede_abrir: false }), true)
    assert.equal(actaEstaBloqueada({ acceso_restringido: true }), true)
    assert.equal(actaEstaBloqueada({ puede_abrir: true }), false)
  })

  it('personalConCantidad filtra ceros', () => {
    assert.equal(personalConCantidad([
      { cargo: 'Oficial', cantidad: 2 },
      { cargo: 'Ayudante', cantidad: 0 },
    ]).length, 1)
  })

  it('materialesConRegistro usa tipo_material (no tipo/nombre)', () => {
    const rows = materialesConRegistro([
      {
        movimiento: 'ingreso',
        tipo_material: 'Material granular TM 25-40',
        proveedor: 'GRECO S.A.S.',
        cantidad: 60,
        numeros_vale: '101, 102',
        ubicacion_pk: '157409',
      },
      { movimiento: 'ingreso', tipo_material: '', proveedor: '', cantidad: 0 },
    ])
    assert.equal(rows.length, 1)
    assert.match(
      formatMaterialLine(rows[0]),
      /Ingreso · Material granular TM 25-40 · GRECO S\.A\.S\. · 60 · Vale\(s\): 101, 102 · PK 157409/,
    )
  })

  it('formatNumerosVale conserva múltiples vales sin truncar', () => {
    assert.equal(formatNumerosVale({ numeros_vale: '101, 102; 103\n104' }), '101, 102, 103, 104')
    assert.equal(formatNumerosVale({ numeros_vale: '  V-900  ' }), 'V-900')
    assert.equal(formatNumerosVale({ numero_vale: '55' }), '55')
    assert.equal(formatNumerosVale({ numeros_vale: '' }), '')
  })

  it('materialRowCells arma columnas completas para la tabla del libro', () => {
    const c = materialRowCells({
      movimiento: 'ingreso',
      tipo_material: 'Material granular TM 25-40',
      proveedor: 'GRECO S.A.S.',
      cantidad: 60,
      numeros_vale: '101, 102',
      ubicacion_pk: '157409',
    })
    assert.deepEqual(c, {
      movimiento: 'Ingreso',
      tipo: 'Material granular TM 25-40',
      proveedor: 'GRECO S.A.S.',
      cantidad: '60',
      vales: '101, 102',
      pk: '157409',
    })
  })

  it('equiposConUso prioriza equipo_nombre y formatEquipoDetalle', () => {
    const rows = equiposConUso([
      { equipo_nombre: 'Retroexcavadora', operador: 'Juan', cantidad: 1, hora_inicio: '07:00', hora_fin: '17:00' },
      { equipo_nombre: '', cantidad: 1 },
    ])
    assert.equal(rows.length, 1)
    const det = formatEquipoDetalle(rows[0])
    assert.equal(det.titulo, 'Retroexcavadora')
    assert.match(det.detalle, /Operador: Juan/)
    assert.match(det.detalle, /Cant\.: 1/)
    assert.match(det.detalle, /07:00/)
  })

  it('formatClimaResumen incluye temperatura y flag manual', () => {
    const c = formatClimaResumen({
      clima_descripcion: 'Nublado',
      clima_temp_c: 18,
      clima_codigo: 3,
      clima_editado_manual: true,
    })
    assert.equal(c.condicion, 'Nublado')
    assert.equal(c.temperatura, '18 °C')
    assert.equal(c.editadoManual, true)
  })
})
