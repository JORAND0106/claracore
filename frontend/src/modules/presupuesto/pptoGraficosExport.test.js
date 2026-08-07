import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  filtrarGraficosPorGrupoEntidad,
  graficoAplicaAGrupoEntidad,
  keysGrupoEntidadDeGrafico,
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
