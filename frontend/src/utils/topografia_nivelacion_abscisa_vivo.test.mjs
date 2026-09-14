/**
 * Abscisado en vivo: abscisa inicial + dist. acum. / abs. circuito.
 * Incluye preview en tiempo real bajo V− y contrato Enter→Tab.
 * node --test frontend/src/utils/topografia_nivelacion_abscisa_vivo.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  abscisaInicialCircuito,
  calcularVistaNivelacion,
  cotasDesdePuntos,
  distanciaVminusEnVivo,
  enriquecerFilasVistaAbscisado,
  filasToLecturas,
  lecturasToFilas,
  nuevaFilaPunto,
  prepararBorradorBmInicial,
  previewAbscisadoCaptura,
  puntosPerfilNivelacion,
  validarBorradorParaAgregar,
} from './topografia_nivelacion.js'

const dir = dirname(fileURLToPath(import.meta.url))
const sharedSrc = readFileSync(join(dir, '../components/topografia/nivelacionUiShared.jsx'), 'utf8')
const ingresoSrc = readFileSync(join(dir, '../components/topografia/NivelacionIngresoPanel.jsx'), 'utf8')
const editSrc = readFileSync(join(dir, '../components/topografia/NivelacionLecturaEditModal.jsx'), 'utf8')

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

describe('preview Abscisado captura en tiempo real (bajo V−)', () => {
  it('recalcula al cambiar Dist de V− sin completar aún la fila', () => {
    const { cotasBib, filas, tipoNivel } = circuitoConInicial(1000)
    const previas = filas.slice(0, 1) // solo BM con V+ = 40
    const borrador = {
      ...nuevaFilaPunto(2, false),
      nombre_punto: 'TP1',
      tipo_punto: 'cambio',
      descripcion_punto: 'en captura',
      vminus: { lectura: '', hS: '', hM: '', hI: '' },
      dist_vminus_m: '30',
    }
    const p1 = previewAbscisadoCaptura(previas, borrador, tipoNivel, cotasBib)
    assert.equal(p1.distancia_acumulada, 70) // 0 + 40 + 30
    assert.equal(p1.abscisa_circuito, 1070)

    const p2 = previewAbscisadoCaptura(
      previas,
      { ...borrador, dist_vminus_m: '45' },
      tipoNivel,
      cotasBib,
    )
    assert.equal(p2.distancia_acumulada, 85)
    assert.equal(p2.abscisa_circuito, 1085)
  })

  it('distanciaVminusEnVivo usa taquimétrica S/I en automático sin exigir M', () => {
    const d = distanciaVminusEnVivo(
      { vminus: { hS: '1.450', hM: '', hI: '1.250' }, dist_vminus_m: '' },
      'automatico',
    )
    assert.ok(Math.abs(d - 20) < 1e-9) // |1.250-1.450|*100
  })

  it('en edición (replaceIdx) refleja el Dist V− modificado', () => {
    const { cotasBib, filas, tipoNivel } = circuitoConInicial(1000)
    const edit = {
      ...filas[1],
      dist_vminus_m: 50, // era 30 → tramo 40+50=90
    }
    const p = previewAbscisadoCaptura(filas, edit, tipoNivel, cotasBib, { replaceIdx: 1 })
    assert.equal(p.distancia_acumulada, 90)
    assert.equal(p.abscisa_circuito, 1090)
  })
})

describe('Enter como Tab + preview bajo V− (contrato UI)', () => {
  it('exporta handleEnterAsTab y PreviewAbscisadoVminus', () => {
    assert.match(sharedSrc, /export function handleEnterAsTab/)
    assert.match(sharedSrc, /export function PreviewAbscisadoVminus/)
    assert.match(sharedSrc, /niv-preview-abscisado-vminus/)
  })

  it('panel de ingreso usa Enter→Tab y preview bajo V−', () => {
    assert.match(ingresoSrc, /handleEnterAsTab/)
    assert.match(ingresoSrc, /previewAbscisadoCaptura/)
    assert.match(ingresoSrc, /previewAbscisado=\{previewAbscisado\}/)
    assert.match(ingresoSrc, /bk === 'vminus' && previewAbscisado/)
  })

  it('modal de edición usa Enter→Tab y preview bajo V−', () => {
    assert.match(editSrc, /handleEnterAsTab/)
    assert.match(editSrc, /previewAbscisadoCaptura/)
    assert.match(editSrc, /replaceIdx:\s*idx/)
    assert.match(editSrc, /previewAbscisado=\{previewAbscisado\}/)
  })
})
