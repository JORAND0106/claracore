/**
 * Abscisado en vivo: abscisa inicial + dist. acum. / abs. circuito.
 * node --test frontend/src/utils/topografia_nivelacion_abscisa_vivo.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  abscisaInicialCircuito,
  calcularVistaNivelacion,
  cotasDesdePuntos,
  enriquecerFilasVistaAbscisado,
  filasToLecturas,
  lecturasToFilas,
  nuevaFilaPunto,
  prepararBorradorBmInicial,
  puntosPerfilNivelacion,
  validarBorradorParaAgregar,
} from './topografia_nivelacion.js'

function circuitoConInicial(abscisaInicial = 1000) {
  const cotasBib = cotasDesdePuntos([{ nombre: 'BM1', cota: 100, verificado: true }])
  const filas = [
    {
      ...prepararBorradorBmInicial('BM1'),
      abscisa_inicial: abscisaInicial,
      ubicacion_pk_id: 'pk1',
      ubicacion_pk: 'K1+000',
      vplus: { lectura: '1.500', hS: '', hM: '', hI: '' },
      dist_vplus_m: 40,
    },
    {
      ...nuevaFilaPunto(2, false),
      nombre_punto: 'TP1',
      tipo_punto: 'cambio',
      abscisa: '40',
      descripcion_punto: 'Cambio 1',
      vminus: { lectura: '1.200', hS: '', hM: '', hI: '' },
      dist_vminus_m: 30,
      vplus: { lectura: '1.400', hS: '', hM: '', hI: '' },
      dist_vplus_m: 25,
    },
    {
      ...nuevaFilaPunto(3, false),
      nombre_punto: 'TP2',
      tipo_punto: 'cambio',
      abscisa: '80',
      descripcion_punto: 'Cambio 2',
      vminus: { lectura: '1.100', hS: '', hM: '', hI: '' },
      dist_vminus_m: 20,
      es_fila_cierre: true,
      punto_biblioteca_id: 'bm1',
    },
  ]
  return { cotasBib, filas, tipoNivel: 'electronico' }
}

describe('abscisado en vivo — abscisa inicial + acumulación', () => {
  it('exige abscisa inicial al agregar la primera V+', () => {
    const borrador = {
      ...prepararBorradorBmInicial('BM1'),
      ubicacion_pk_id: 'pk1',
      ubicacion_pk: 'K1+000',
      vplus: { lectura: '1.2', hS: '', hM: '', hI: '' },
      dist_vplus_m: 10,
    }
    const sin = validarBorradorParaAgregar(borrador, [], 'electronico', 'BM1', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(sin.ok, false)
    assert.match(sin.msg, /abscisa inicial/i)

    const con = validarBorradorParaAgregar(
      { ...borrador, abscisa_inicial: '1250.5' },
      [],
      'electronico',
      'BM1',
      { modoApertura: true, circuitoAbierto: true },
    )
    assert.equal(con.ok, true, con.msg)
  })

  it('calcula dist. acum. y abs. circuito alineadas al perfil', () => {
    const { cotasBib, filas, tipoNivel } = circuitoConInicial(1000)
    const vista = calcularVistaNivelacion(filas, tipoNivel, cotasBib)
    const perfil = puntosPerfilNivelacion(vista.filasVista)

    assert.equal(vista.filasVista[0].distancia_acumulada, 0)
    assert.equal(vista.filasVista[0].abscisa_circuito, 1000)
    // Tramo BM→TP1 = V+(BM)=40 + V−(TP1)=30 = 70
    assert.equal(vista.filasVista[1].distancia_acumulada, 70)
    assert.equal(vista.filasVista[1].abscisa_circuito, 1070)
    // Tramo TP1→TP2 = V+(TP1)=25 + V−(TP2)=20 = 45 → acum 115
    assert.equal(vista.filasVista[2].distancia_acumulada, 115)
    assert.equal(vista.filasVista[2].abscisa_circuito, 1115)

    assert.deepEqual(
      perfil.map((p) => p.abscisa),
      vista.filasVista.map((f) => f.distancia_acumulada),
    )
  })

  it('enriquecerFilasVistaAbscisado coincide con puntosPerfilNivelacion', () => {
    const { cotasBib, filas, tipoNivel } = circuitoConInicial(500)
    const vista = calcularVistaNivelacion(filas, tipoNivel, cotasBib)
    // Re-enriquecer con otra inicial: dist. acum. igual, abs. circuito desplazada
    const otra = enriquecerFilasVistaAbscisado(vista.filasVista, 500)
    const perfil = puntosPerfilNivelacion(vista.filasVista)
    assert.equal(otra[1].distancia_acumulada, perfil[1].abscisa)
    assert.equal(otra[1].abscisa_circuito, 500 + perfil[1].abscisa)
  })

  it('persiste abscisa_inicial en round-trip lecturas', () => {
    const { filas, tipoNivel } = circuitoConInicial(2500)
    const lect = filasToLecturas(filas, tipoNivel)
    const back = lecturasToFilas(lect, tipoNivel)
    assert.equal(abscisaInicialCircuito(back), 2500)
    assert.equal(Number(back[0].abscisa_inicial), 2500)
  })
})
