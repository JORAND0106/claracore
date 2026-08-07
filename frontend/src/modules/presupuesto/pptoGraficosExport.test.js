import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  filtrarGraficosPorGrupoEntidad,
  graficoAplicaAGrupoEntidad,
  keysGrupoEntidadDeGrafico,
  presupuestoIdsDeGrafico,
  subagruparRegistrosPorGrupoGrafico,
} from './pptoGraficosExport.js'

const img = { natW: 1, natH: 1 }

describe('keysGrupoEntidadDeGrafico / graficoAplicaAGrupoEntidad', () => {
  it('mapea tipos a keys de subtabla', () => {
    const keys = keysGrupoEntidadDeGrafico({
      tipos_entidad: ['Área', 'Longitud/Tramo', 'Nodo'],
    })
    assert.deepEqual([...keys].sort(), ['area', 'longitud', 'unidad'])
  })

  it('sin tipos_entidad aplica a cualquier subtabla (fallback)', () => {
    assert.equal(graficoAplicaAGrupoEntidad({ image: img }, 'area'), true)
    assert.equal(graficoAplicaAGrupoEntidad({ image: img, tipos_entidad: [] }, 'longitud'), true)
  })

  it('con tipos mixtos se repite en cada subtabla correspondiente', () => {
    const g = { image: img, tipos_entidad: ['Área', 'Polyline'] }
    assert.equal(graficoAplicaAGrupoEntidad(g, 'area'), true)
    assert.equal(graficoAplicaAGrupoEntidad(g, 'longitud'), true)
    assert.equal(graficoAplicaAGrupoEntidad(g, 'unidad'), false)
  })
})

describe('filtrarGraficosPorGrupoEntidad', () => {
  it('filtra por subtabla y exige image', () => {
    const grafs = [
      { caption: 'A', image: img, tipos_entidad: ['Área'] },
      { caption: 'L', image: img, tipos_entidad: ['Longitud'] },
      { caption: 'AL', image: img, tipos_entidad: ['Hatch', 'Line'] },
      { caption: 'sin-img', tipos_entidad: ['Área'] },
    ]
    assert.deepEqual(
      filtrarGraficosPorGrupoEntidad(grafs, 'area').map((g) => g.caption),
      ['A', 'AL'],
    )
    assert.deepEqual(
      filtrarGraficosPorGrupoEntidad(grafs, 'longitud').map((g) => g.caption),
      ['L', 'AL'],
    )
    assert.deepEqual(
      filtrarGraficosPorGrupoEntidad(grafs, 'unidad').map((g) => g.caption),
      [],
    )
  })
})

describe('subagruparRegistrosPorGrupoGrafico', () => {
  it('prioriza grupo de gráfico y deja remanente al final ordenado', () => {
    const regs = [
      { id: 1, tramo: 'T2', infraestructura: 'A', abs_inicio: '1+000' },
      { id: 2, tramo: 'T1', infraestructura: 'B', abs_inicio: '2+000' },
      { id: 3, tramo: 'T1', infraestructura: 'A', abs_inicio: '1+500' },
      { id: 4, tramo: 'T0', infraestructura: 'Z', abs_inicio: '0+100' },
      { id: 5, tramo: 'T9', infraestructura: 'X', abs_inicio: '9+000' },
    ]
    const grafs = [
      {
        grupo_id: 'g-b',
        orden: 1,
        caption: 'B',
        image: img,
        tipos_entidad: ['Área'],
        presupuesto_ids: [2, 3],
      },
      {
        grupo_id: 'g-a',
        orden: 0,
        caption: 'A',
        image: img,
        tipos_entidad: ['Área'],
        presupuesto_ids: [1],
      },
    ]
    const subs = subagruparRegistrosPorGrupoGrafico(regs, grafs, 'area')
    assert.deepEqual(
      subs.map((s) => s.grupoId),
      ['g-a', 'g-b', null],
    )
    assert.deepEqual(
      subs[0].registros.map((r) => r.id),
      [1],
    )
    // Dentro de g-b: T1/A/1+500 antes que T1/B/2+000
    assert.deepEqual(
      subs[1].registros.map((r) => r.id),
      [3, 2],
    )
    // Remanente: T0 luego T9
    assert.deepEqual(
      subs[2].registros.map((r) => r.id),
      [4, 5],
    )
    assert.equal(subs[2].graficos.length, 0)
    assert.equal(subs[0].graficos[0].caption, 'A')
    assert.equal(subs[1].graficos[0].caption, 'B')
  })

  it('asignación exclusiva: un registro en dos grupos queda en el primero', () => {
    const regs = [
      { id: 10, tramo: 'T1', infraestructura: 'A', abs_inicio: '1+000' },
      { id: 11, tramo: 'T1', infraestructura: 'A', abs_inicio: '2+000' },
    ]
    const grafs = [
      {
        grupo_id: 'first',
        orden: 0,
        image: img,
        tipos_entidad: ['Área'],
        presupuesto_ids: [10],
      },
      {
        grupo_id: 'second',
        orden: 1,
        image: img,
        tipos_entidad: ['Área'],
        presupuesto_ids: [10, 11],
      },
    ]
    const subs = subagruparRegistrosPorGrupoGrafico(regs, grafs, 'area')
    assert.deepEqual(
      subs.map((s) => s.grupoId),
      ['first', 'second'],
    )
    assert.deepEqual(
      subs[0].registros.map((r) => r.id),
      [10],
    )
    assert.deepEqual(
      subs[1].registros.map((r) => r.id),
      [11],
    )
  })

  it('sin gráficos → un solo bloque remanente ordenado', () => {
    const regs = [
      { id: 2, tramo: 'T2', infraestructura: 'A', abs_inicio: '1+000' },
      { id: 1, tramo: 'T1', infraestructura: 'A', abs_inicio: '1+000' },
    ]
    const subs = subagruparRegistrosPorGrupoGrafico(regs, [], 'area')
    assert.equal(subs.length, 1)
    assert.equal(subs[0].grupoId, null)
    assert.deepEqual(
      subs[0].registros.map((r) => r.id),
      [1, 2],
    )
  })
})

describe('presupuestoIdsDeGrafico', () => {
  it('normaliza y deduplica ids', () => {
    assert.deepEqual(presupuestoIdsDeGrafico({ presupuesto_ids: [1, '2', 1, 0, null] }), [1, 2])
  })
})
