/**
 * determinarNivelValidacionTopo alineado con lado_validacion_topo_usuario (BE).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { determinarNivelValidacionTopo } from './topografiaPermisosNivel.js'

const permValidar = { crear: false, editar: false, validar: true }
const permEditar = { crear: true, editar: true, validar: false }
const permNinguno = { crear: false, editar: false, validar: false }

describe('determinarNivelValidacionTopo', () => {
  it('sin permiso validar → niveles vacíos', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Contratista', cargo_nombre: 'Topógrafo' },
      permEditar,
    )
    assert.equal(nv.puedeValidar, false)
    assert.deepEqual(nv.niveles, [])
  })

  it('contratista con validar → solo N1', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Contratista', cargo_nombre: 'Topógrafo' },
      permValidar,
    )
    assert.equal(nv.puedeValidar, true)
    assert.equal(nv.lado, 1)
    assert.deepEqual(nv.niveles, [1])
  })

  it('interventoría con validar → solo N2', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Interventoría', cargo_nombre: 'Residente' },
      permValidar,
    )
    assert.equal(nv.puedeValidar, true)
    assert.equal(nv.lado, 2)
    assert.deepEqual(nv.niveles, [2])
  })

  it('operativo interventoría → N2', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Operativo Interventoría', cargo_nombre: 'Auxiliar' },
      permValidar,
    )
    assert.equal(nv.lado, 2)
    assert.deepEqual(nv.niveles, [2])
  })

  it('cadenero con validar → N1', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Operativo Contratista', cargo_nombre: 'Cadenero' },
      permValidar,
    )
    assert.equal(nv.lado, 1)
    assert.deepEqual(nv.niveles, [1])
  })

  it('flag validar sin rol/cargo de lado → no inventa N1', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Contador', cargo_nombre: 'Analista' },
      permValidar,
    )
    assert.equal(nv.puedeValidar, false)
    assert.equal(nv.lado, null)
    assert.deepEqual(nv.niveles, [])
  })

  it('desarrollador → ambos niveles', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Desarrollador', cargo_nombre: 'Desarrollador' },
      permNinguno,
    )
    assert.equal(nv.esDev, true)
    assert.equal(nv.lado, 0)
    assert.deepEqual(nv.niveles, [1, 2])
  })

  it('topógrafo interventoría por cargo → N2', () => {
    const nv = determinarNivelValidacionTopo(
      { rol_nombre: 'Operativo Interventoría', cargo_nombre: 'Topógrafo Interventoría' },
      permValidar,
    )
    assert.equal(nv.lado, 2)
    assert.deepEqual(nv.niveles, [2])
  })
})
