import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparRegistrosPorTipoEntidad,
  clasificarTipoEntidad,
  ordenarRegistrosSubtabla,
  parseAbsInicioOrden,
  PPTO_ENCABEZADO_GRUPO_ENTIDAD,
  PPTO_ENCABEZADO_GRUPO_ROW_HEIGHT,
  PPTO_GRUPOS_ENTIDAD,
} from './pptoTipoEntidad.js'

describe('clasificarTipoEntidad', () => {
  it('clasifica Área / Longitud / Unidad con variantes', () => {
    assert.equal(clasificarTipoEntidad('Área'), 'area')
    assert.equal(clasificarTipoEntidad('Hatch'), 'area')
    assert.equal(clasificarTipoEntidad('Longitud/Tramo'), 'longitud')
    assert.equal(clasificarTipoEntidad('Polyline'), 'longitud')
    assert.equal(clasificarTipoEntidad('Nodo'), 'unidad')
    assert.equal(clasificarTipoEntidad('Nodo RSP'), 'unidad')
  })

  it('devuelve null si vacío o desconocido', () => {
    assert.equal(clasificarTipoEntidad(''), null)
    assert.equal(clasificarTipoEntidad(null), null)
    assert.equal(clasificarTipoEntidad('xyz'), null)
  })
})

describe('agruparRegistrosPorTipoEntidad', () => {
  it('ordena Área → Longitud → Unidad y omite vacíos', () => {
    const groups = agruparRegistrosPorTipoEntidad([
      { id: 1, tipo_entidad: 'Nodo' },
      { id: 2, tipo_entidad: 'Área' },
      { id: 3, tipo_entidad: 'Longitud' },
      { id: 4, tipo_entidad: 'Área' },
    ])
    assert.deepEqual(groups.map((g) => g.key), ['area', 'longitud', 'unidad'])
    assert.deepEqual(groups.map((g) => g.colLabel), ['Área', 'Longitud', 'Unidad'])
    assert.equal(groups[0].registros.length, 2)
    assert.equal(groups[1].registros.length, 1)
    assert.equal(groups[2].registros.length, 1)
  })

  it('no genera subtabla ausente y manda sin clasificar a residual', () => {
    const groups = agruparRegistrosPorTipoEntidad([
      { id: 1, tipo_entidad: 'Longitud' },
      { id: 2, tipo_entidad: '' },
    ])
    assert.deepEqual(groups.map((g) => g.key), ['longitud', 'otros'])
    assert.equal(groups[1].colLabel, 'Área/Long/Nodo')
  })

  it('dentro de cada subtabla ordena por Tramo → Infraestructura → Abs Inicio', () => {
    const groups = agruparRegistrosPorTipoEntidad([
      { id: 1, tipo_entidad: 'Área', tramo: 'T2', infraestructura: 'B', abs_inicio: '1+100' },
      { id: 2, tipo_entidad: 'Área', tramo: 'T1', infraestructura: 'C', abs_inicio: '2+000' },
      { id: 3, tipo_entidad: 'Área', tramo: 'T1', infraestructura: 'A', abs_inicio: '3+000' },
      { id: 4, tipo_entidad: 'Área', tramo: 'T1', infraestructura: 'A', abs_inicio: '1+500' },
      { id: 5, tipo_entidad: 'Longitud', tramo: 'Z', infraestructura: 'X', abs_inicio: '0+100' },
      { id: 6, tipo_entidad: 'Longitud', tramo: 'A', infraestructura: 'Y', abs_inicio: '9+000' },
    ])
    assert.deepEqual(groups.map((g) => g.key), ['area', 'longitud'])
    assert.deepEqual(
      groups[0].registros.map((r) => r.id),
      [4, 3, 2, 1],
      'Área: T1/A/1+500 → T1/A/3+000 → T1/C/2+000 → T2/B/1+100',
    )
    assert.deepEqual(
      groups[1].registros.map((r) => r.id),
      [6, 5],
      'Longitud: tramo A antes que Z; agrupación Área→Longitud intacta',
    )
  })
})

describe('PPTO_ENCABEZADO_GRUPO_ENTIDAD', () => {
  it('define texto de una línea para Área / Longitud / Unidad y altura 22', () => {
    assert.equal(PPTO_ENCABEZADO_GRUPO_ROW_HEIGHT, 22)
    for (const g of PPTO_GRUPOS_ENTIDAD) {
      const t = PPTO_ENCABEZADO_GRUPO_ENTIDAD[g.key]
      assert.ok(t, `falta encabezado para ${g.key}`)
      assert.equal(t.includes('\n'), false, 'sin salto de línea')
      assert.match(t, /Cálculo de cantidades por/)
    }
    assert.match(PPTO_ENCABEZADO_GRUPO_ENTIDAD.area, /Áreas/)
    assert.match(PPTO_ENCABEZADO_GRUPO_ENTIDAD.longitud, /Longitud/)
    assert.match(PPTO_ENCABEZADO_GRUPO_ENTIDAD.unidad, /Unidad/)
    assert.equal(PPTO_ENCABEZADO_GRUPO_ENTIDAD.otros, undefined)
  })
})

describe('ordenarRegistrosSubtabla / parseAbsInicioOrden', () => {
  it('parsea Abs Inicio con formato km+m', () => {
    assert.equal(parseAbsInicioOrden('2+900'), 2900)
    assert.equal(parseAbsInicioOrden('0+050'), 50)
    assert.equal(parseAbsInicioOrden(''), null)
  })

  it('ordena cascada con múltiples tramos e infraestructuras', () => {
    const ordenados = ordenarRegistrosSubtabla([
      { id: 'd', tramo: 'TRAMO 10', infraestructura: 'INF-A', abs_inicio: '5+000' },
      { id: 'a', tramo: 'TRAMO 2', infraestructura: 'INF-B', abs_inicio: '1+000' },
      { id: 'c', tramo: 'TRAMO 2', infraestructura: 'INF-A', abs_inicio: '3+200' },
      { id: 'b', tramo: 'TRAMO 2', infraestructura: 'INF-A', abs_inicio: '1+100' },
    ])
    assert.deepEqual(
      ordenados.map((r) => r.id),
      ['b', 'c', 'a', 'd'],
    )
  })
})
