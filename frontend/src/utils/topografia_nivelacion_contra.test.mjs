/**
 * Contranivelación: autocomplete, puntos solo de ida, perfil inverso, Δcota.
 *
 * node --test frontend/src/utils/topografia_nivelacion_contra.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ORDEN_CONTRA_BASE,
  abscisaFinalPerfilIda,
  autocompletarDesdeIda,
  cotasSemillaContranivelacion,
  deltaCotaContranivelacion,
  filasToLecturas,
  normalizarOrdenContra,
  prepararBorradorContraInicio,
  puntosPerfilContranivelacion,
  puntosPerfilNivelacion,
  separarLecturasIdaContra,
  validarBorradorContranivelacion,
  MSG_PUNTO_NO_EN_IDA,
} from './topografia_nivelacion.js'

const tipo = 'electronico'

function fila(nombre, extra = {}) {
  return {
    orden: 1,
    nombre_punto: nombre,
    tipo_punto: 'estacion',
    abscisa: '10',
    ubicacion_pk_id: 'pk-1',
    ubicacion_pk: '100',
    descripcion_punto: `Desc ${nombre}`,
    vplus: { hS: '', hM: '', hI: '', lectura: '' },
    vi: { hS: '', hM: '', hI: '', lectura: '' },
    vminus: { hS: '', hM: '', hI: '', lectura: '' },
    ...extra,
  }
}

describe('contranivelación — utilidades', () => {
  const filasIda = [
    fila('GPS 1', { tipo_punto: 'BM', descripcion_punto: 'Inicio', es_fila_cierre: false }),
    fila('C#1', { tipo_punto: 'cambio', descripcion_punto: 'Cambio 1' }),
    fila('Aux_1', { tipo_punto: 'auxiliar', descripcion_punto: 'Intermedia' }),
    fila('GPS 1', {
      tipo_punto: 'estacion',
      descripcion_punto: 'Punto de cierre',
      es_fila_cierre: true,
      punto_biblioteca_id: 'bm-1',
    }),
  ]

  it('autocompleta Tipo/PK/Descripción desde la ida', () => {
    const meta = autocompletarDesdeIda('c#1', filasIda)
    assert.ok(meta)
    assert.equal(meta.nombre_punto, 'C#1')
    assert.equal(meta.tipo_punto, 'cambio')
    assert.equal(meta.descripcion_punto, 'Cambio 1')
    assert.equal(meta.ubicacion_pk, '100')
  })

  it('rechaza puntos que no están en la ida', () => {
    const gate = validarBorradorContranivelacion(
      {
        ...fila('PuntoNuevo'),
        vplus: { hS: '', hM: '', hI: '', lectura: '1.200' },
      },
      [],
      filasIda,
      tipo,
    )
    assert.equal(gate.ok, false)
    assert.equal(gate.msg, MSG_PUNTO_NO_EN_IDA)
  })

  it('acepta punto de la ida y mezcla meta + lecturas', () => {
    const gate = validarBorradorContranivelacion(
      {
        ...prepararBorradorContraInicio(filasIda, 'GPS 1'),
        nombre_punto: 'C#1',
        vminus: { hS: '', hM: '', hI: '', lectura: '1.050' },
      },
      [fila('GPS 1', { vplus: { hS: '', hM: '', hI: '', lectura: '1.500' } })],
      filasIda,
      tipo,
    )
    assert.equal(gate.ok, true, gate.msg)
    assert.equal(gate.fila.tipo_punto, 'cambio')
    assert.equal(gate.fila.descripcion_punto, 'Cambio 1')
  })

  it('persiste contra con orden ≥ ORDEN_CONTRA_BASE y la separa al cargar', () => {
    const contraFilas = [
      fila('GPS 1', { vplus: { hS: '', hM: '', hI: '', lectura: '1.400' } }),
    ]
    const lectIda = filasToLecturas([
      fila('GPS 1', { vplus: { hS: '', hM: '', hI: '', lectura: '1.500' } }),
    ], tipo)
    const lectContra = filasToLecturas(contraFilas, tipo, { ordenBase: ORDEN_CONTRA_BASE })
    assert.ok(lectContra.every((l) => l.orden >= ORDEN_CONTRA_BASE))
    const { ida, contra } = separarLecturasIdaContra([...lectIda, ...lectContra])
    assert.equal(ida.length, 1)
    assert.equal(contra.length, 1)
    const norm = normalizarOrdenContra(contra)
    assert.ok(norm[0].orden < ORDEN_CONTRA_BASE)
  })

  it('perfil inverso parte de abscisa final de ida y descuenta tramos', () => {
    const vistaIda = [
      { nombre_punto: 'GPS 1', cota: 100, distancia_vplus_calc: 40, distancia_vminus_calc: null },
      { nombre_punto: 'C#1', cota: 100.2, distancia_vplus_calc: 35, distancia_vminus_calc: 40 },
      { nombre_punto: 'GPS 1', cota: 100.01, distancia_vplus_calc: null, distancia_vminus_calc: 30, es_fila_cierre: true },
    ]
    const ptsIda = puntosPerfilNivelacion(vistaIda)
    const fin = abscisaFinalPerfilIda(vistaIda)
    assert.equal(fin, 145) // 0→80→145
    assert.equal(ptsIda[2].abscisa, 145)

    const vistaContra = [
      { nombre_punto: 'GPS 1', cota: 100.01, distancia_vplus_calc: 30, distancia_vminus_calc: null },
      { nombre_punto: 'C#1', cota: 100.15, distancia_vplus_calc: 40, distancia_vminus_calc: 35 },
      { nombre_punto: 'GPS 1', cota: 99.98, distancia_vplus_calc: null, distancia_vminus_calc: 40 },
    ]
    const ptsContra = puntosPerfilContranivelacion(vistaContra, fin)
    assert.equal(ptsContra[0].abscisa, 145)
    // 145 - (30+35) = 80
    assert.equal(ptsContra[1].abscisa, 80)
    // 80 - (40+40) = 0
    assert.equal(ptsContra[2].abscisa, 0)
  })

  it('Δcota es informativa y no exige admisibilidad', () => {
    const filasVistaIda = [
      { cota: 100 },
      { cota: 100.2 },
      { cota: 100.05 },
    ]
    const filasIdaLocal = [
      fila('GPS 1'),
      fila('C#1'),
      { ...fila('GPS 1'), es_fila_cierre: true },
    ]
    const filasContra = [fila('GPS 1'), fila('C#1'), fila('GPS 1')]
    const filasVistaContra = [{ cota: 100.05 }, { cota: 100.1 }, { cota: 100.02 }]
    const d = deltaCotaContranivelacion({
      filasIda: filasIdaLocal,
      filasVistaIda,
      filasContra,
      filasVistaContra,
      bmInicialNombre: 'GPS 1',
    })
    assert.equal(d.ok, true)
    assert.ok(Math.abs(d.deltaM - (100.02 - 100.05)) < 1e-9)
    assert.ok(Math.abs(d.deltaMm - (-30)) < 1e-6)
  })

  it('semilla de cotas solo inyecta el cierre de ida', () => {
    const seed = cotasSemillaContranivelacion(
      filasIda,
      [{ cota: 100 }, { cota: 100.2 }, { cota: 100.1 }, { cota: 100.05 }],
      { 'GPS 1': 100 },
      'GPS 1',
    )
    assert.equal(seed['GPS 1'], 100.05)
    assert.equal(seed['C#1'], undefined)
  })
})
