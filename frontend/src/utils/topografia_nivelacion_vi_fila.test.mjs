/**
 * Vista intermedia (Vi) como fila de cartera independiente.
 *
 * node --test frontend/src/utils/topografia_nivelacion_vi_fila.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calcularVistaNivelacion,
  carteraVplusSinVista,
  esFilaSoloVi,
  indiceInsercionVistaIntermedia,
  MSG_VI_FILA_INDEPENDIENTE,
  nuevaFilaPunto,
  prepararBorradorBmInicial,
  prepararBorradorSiguiente,
  validarBorradorParaAgregar,
} from './topografia_nivelacion.js'

const tipoNivel = 'electronico'
const bm = 'BM-INI'
const cotasBib = { 'BM-INI': 100 }

function meta(extra = {}) {
  return {
    abscisa: '10',
    ubicacion_pk_id: 'pk-1',
    ubicacion_pk: '100',
    descripcion_punto: 'Punto de prueba',
    ...extra,
  }
}

describe('Vi como fila independiente', () => {
  it('rechaza Vi mezclada con V+ o V− en el mismo alta', () => {
    const filas = [{
      ...prepararBorradorBmInicial(bm),
      ...meta({ abscisa: '0', ubicacion_pk: '0', descripcion_punto: 'BM' }),
      vplus: { hS: '', hM: '', hI: '', lectura: '1.500' },
    }]
    const borrador = {
      ...prepararBorradorSiguiente(1),
      ...meta({ nombre_punto: 'Aux_1', tipo_punto: 'auxiliar' }),
      vplus: { hS: '', hM: '', hI: '', lectura: '1.200' },
      vi: { hS: '', hM: '', hI: '', lectura: '1.100' },
    }
    const gate = validarBorradorParaAgregar(borrador, filas, tipoNivel, bm, {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(gate.ok, false)
    assert.equal(gate.msg, MSG_VI_FILA_INDEPENDIENTE)
  })

  it('inserta Vi justo después de la estación con V+ (antes de un V− posterior)', () => {
    const f0 = {
      ...prepararBorradorBmInicial(bm),
      ...meta({ abscisa: '0', ubicacion_pk: '0', descripcion_punto: 'BM' }),
      vplus: { hS: '', hM: '', hI: '', lectura: '1.500' },
    }
    const f1 = {
      ...nuevaFilaPunto(2, false),
      ...meta({ nombre_punto: 'TP-1', tipo_punto: 'cambio', descripcion_punto: 'Cambio' }),
      vminus: { hS: '', hM: '', hI: '', lectura: '1.200' },
      vplus: { hS: '', hM: '', hI: '', lectura: '1.400' },
    }
    // Solo BM+V+ → Vi debe ir en índice 1
    assert.equal(indiceInsercionVistaIntermedia([f0], tipoNivel), 1)
    // Tras cambio con V+ → Vi va después del cambio (índice 2)
    assert.equal(indiceInsercionVistaIntermedia([f0, f1], tipoNivel), 2)

    const borradorVi = {
      ...prepararBorradorSiguiente(1),
      ...meta({ nombre_punto: 'Aux_1', tipo_punto: 'auxiliar', descripcion_punto: 'Intermedia' }),
      vi: { hS: '', hM: '', hI: '', lectura: '1.100' },
    }
    const gate = validarBorradorParaAgregar(borradorVi, [f0], tipoNivel, bm, {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(gate.ok, true, gate.msg)
    assert.equal(gate.esVistaIntermedia, true)
    assert.equal(gate.insertAt, 1)
    assert.ok(esFilaSoloVi(gate.fila, tipoNivel))

    // Insertar entre BM y un V− suelto (apertura): Vi queda tras BM
    const fVm = {
      ...nuevaFilaPunto(2, false),
      ...meta({ nombre_punto: 'TP-A', tipo_punto: 'estacion', descripcion_punto: 'Adelante' }),
      vminus: { hS: '', hM: '', hI: '', lectura: '1.050' },
    }
    assert.equal(indiceInsercionVistaIntermedia([f0, fVm], tipoNivel), 1)
  })

  it('calcula cota de Vi como HI − Vi y no altera la cadena V+/V−', () => {
    const f0 = {
      ...prepararBorradorBmInicial(bm),
      ...meta({ abscisa: '0', ubicacion_pk: '0', descripcion_punto: 'BM' }),
      vplus: { hS: '', hM: '', hI: '', lectura: '1.500' },
    }
    const fVi = {
      ...nuevaFilaPunto(2, false),
      ...meta({ nombre_punto: 'Aux_1', tipo_punto: 'auxiliar', descripcion_punto: 'Intermedia' }),
      vi: { hS: '', hM: '', hI: '', lectura: '1.200' },
    }
    const f1 = {
      ...nuevaFilaPunto(3, false),
      ...meta({ nombre_punto: 'TP-1', tipo_punto: 'cambio', descripcion_punto: 'Cambio' }),
      vminus: { hS: '', hM: '', hI: '', lectura: '1.000' },
      vplus: { hS: '', hM: '', hI: '', lectura: '1.300' },
    }

    const vista = calcularVistaNivelacion([f0, fVi, f1], tipoNivel, cotasBib)
    // HI BM = 100 + 1.5 = 101.5
    assert.ok(Math.abs(vista.filasVista[0].altura_instrumento - 101.5) < 1e-9)
    // Cota Aux = 101.5 - 1.2 = 100.3
    assert.ok(Math.abs(vista.filasVista[1].cota - 100.3) < 1e-9)
    assert.ok(Math.abs(vista.filasVista[1].altura_instrumento - 101.5) < 1e-9)
    // V− TP = 101.5 - 1.0 = 100.5; nueva HI = 100.5 + 1.3 = 101.8
    assert.ok(Math.abs(vista.filasVista[2].cota - 100.5) < 1e-9)
    assert.ok(Math.abs(vista.filasVista[2].altura_instrumento - 101.8) < 1e-9)

    // Tras Vi, la V+ del BM ya no deja la cartera “incompleta”
    assert.equal(carteraVplusSinVista([f0, fVi], tipoNivel), false)
  })

  it('apila varias Vi tras la misma estación V+', () => {
    const f0 = {
      ...prepararBorradorBmInicial(bm),
      ...meta({ abscisa: '0', ubicacion_pk: '0', descripcion_punto: 'BM' }),
      vplus: { hS: '', hM: '', hI: '', lectura: '1.500' },
    }
    const v1 = {
      ...nuevaFilaPunto(2, false),
      ...meta({ nombre_punto: 'Aux_1', tipo_punto: 'auxiliar' }),
      vi: { hS: '', hM: '', hI: '', lectura: '1.100' },
    }
    assert.equal(indiceInsercionVistaIntermedia([f0, v1], tipoNivel), 2)
  })
})
