/**
 * Prueba de flujo completo Circuito de Nivelación (patrón panel + cartera)
 * con datos de campo realistas, verificando que el cierre (error, tolerancia,
 * dictamen) no cambia respecto al cálculo canónico.
 *
 * node --test frontend/src/utils/topografia_nivelacion_patron_campo.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calcularVistaNivelacion,
  cotasDesdePuntos,
  filasToLecturas,
  lecturasToFilas,
  nuevaFilaCierre,
  nuevaFilaPunto,
  prepararBorradorBmInicial,
  prepararBorradorSiguiente,
  validarBorradorParaAgregar,
} from './topografia_nivelacion.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '../../..', 'backend')

/** Datos de campo (nivel automático 3 hilos), circuito cerrado sobre BM-INI. */
function circuitoCampo() {
  const cotasBib = cotasDesdePuntos([
    { nombre: 'BM-INI', cota: 801.400, verificado: true },
    { nombre: 'BM-FIN', cota: 801.400, verificado: true },
  ])

  // 1) V+ en BM-INI  HS/HM/HI → dist taqui = 100*(1.450-1.050)=40 m; HI = 801.400+1.250 = 802.650
  const f0 = {
    ...prepararBorradorBmInicial('BM-INI'),
    abscisa: '0',
    ubicacion_pk_id: 'pk-0',
    ubicacion_pk: '525250',
    descripcion_punto: 'Amarre BM inicial',
    vplus: { hS: '1.450', hM: '1.250', hI: '1.050', lectura: '' },
  }

  // 2) Cambio en TP-1: V− fija cota; V+ nueva HI
  //    V− HM=1.180 → cota = 802.650-1.180 = 801.470
  //    V+ HM=1.320 → HI = 801.470+1.320 = 802.790
  //    dist V− = 100*(1.380-0.980)=40; dist V+ = 100*(1.520-1.120)=40
  const f1 = {
    ...nuevaFilaPunto(2, false),
    nombre_punto: 'TP-1',
    tipo_punto: 'cambio',
    abscisa: '40',
    ubicacion_pk_id: 'pk-1',
    ubicacion_pk: '525254',
    descripcion_punto: 'Cambio de estación 1',
    vminus: { hS: '1.380', hM: '1.180', hI: '0.980', lectura: '' },
    vplus: { hS: '1.520', hM: '1.320', hI: '1.120', lectura: '' },
  }

  // 3) Cierre en BM-INI: V− HM=1.392 → cota_calc = 802.790-1.392 = 801.398
  //    error = 801.398 - 801.400 = -0.002 m = -2.00 mm
  //    dist V− = 100*(1.592-1.192)=40 → total V+/V− = 40+40+40+40 = 160 m = 0.16 km
  //    tol = 1 mm/km * sqrt(0.16) / 1000 m = 0.4/1000 = 0.0004 m = 0.40 mm
  //    |err| 2.00 mm > 0.40 mm → INADMISIBLE con tol 1 mm/km
  //
  // Ajuste de campo: HM cierre 1.3905 → cota 801.3995 ≈ error -0.5 mm → aún inadmisible
  // Usamos HM=1.3902 → cota=801.3998 → error=-0.2 mm ≤ 0.40 mm → ADMISIBLE
  const bmFin = { id: 'bm-ini', nombre: 'BM-INI', cota: 801.400 }
  const f2 = {
    ...nuevaFilaCierre(bmFin, 3, '80'),
    ubicacion_pk_id: 'pk-0',
    ubicacion_pk: '525250',
    vminus: { hS: '1.5902', hM: '1.3902', hI: '1.1902', lectura: '' },
  }

  return { cotasBib, filas: [f0, f1, f2], tipoNivel: 'automatico' }
}

function cierreDesdeVista(filas, tipoNivel, cotasBib, bmFinalNombre, tolMmKm = 1) {
  const vista = calcularVistaNivelacion(filas, tipoNivel, cotasBib, { distMax: 50 })
  const idx = filas.findIndex((f) => f.es_fila_cierre)
  const cotaCalc = vista.filasVista[idx]?.cota
  const cotaBib = cotasBib[bmFinalNombre]
  const errM = Number(cotaCalc) - Number(cotaBib)
  const distKm = (vista.distancia_vplus_m + vista.distancia_vminus_m) / 1000
  const tolM = distKm > 0 ? (tolMmKm * Math.sqrt(distKm)) / 1000 : null
  return {
    vista,
    cotaCalc,
    cotaBib,
    errorM: errM,
    errorMm: errM * 1000,
    toleranciaMm: tolM != null ? tolM * 1000 : null,
    distKm,
    admisible: tolM != null && Math.abs(errM) <= tolM,
  }
}

describe('patrón panel+cartera — flujo agregar lecturas', () => {
  it('valida borrador BM y construye cartera como Agregar lectura', () => {
    const { cotasBib, tipoNivel } = circuitoCampo()
    let filas = []
    let borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM inicial',
      vplus: { hS: '1.450', hM: '1.250', hI: '1.050', lectura: '' },
    }
    const g0 = validarBorradorParaAgregar(borrador, filas, tipoNivel, 'BM-INI', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(g0.ok, true, g0.msg)
    filas = [...filas, { ...g0.fila, orden: 1 }]
    borrador = prepararBorradorSiguiente(filas.length)

    borrador = {
      ...borrador,
      nombre_punto: 'TP-1',
      tipo_punto: 'cambio',
      abscisa: '40',
      ubicacion_pk_id: 'pk-1',
      ubicacion_pk: '525254',
      descripcion_punto: 'Cambio de estación 1',
      vminus: { hS: '1.380', hM: '1.180', hI: '0.980', lectura: '' },
      vplus: { hS: '1.520', hM: '1.320', hI: '1.120', lectura: '' },
    }
    const g1 = validarBorradorParaAgregar(borrador, filas, tipoNivel, 'BM-INI', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(g1.ok, true, g1.msg)
    filas = [...filas, { ...g1.fila, orden: 2 }]

    assert.equal(filas.length, 2)
    const vista = calcularVistaNivelacion(filas, tipoNivel, cotasBib, { distMax: 50 })
    assert.ok(Math.abs(vista.filasVista[0].altura_instrumento - 802.65) < 1e-6)
    assert.ok(Math.abs(vista.filasVista[1].cota - 801.47) < 1e-6)
    assert.ok(Math.abs(vista.filasVista[1].altura_instrumento - 802.79) < 1e-6)
  })

  it('round-trip filas ↔ lecturas no altera HI/cota', () => {
    const { filas, tipoNivel, cotasBib } = circuitoCampo()
    const lecturas = filasToLecturas(filas, tipoNivel)
    const again = lecturasToFilas(lecturas, tipoNivel)
    // restaurar marca de cierre (payload no siempre la rehidrata igual)
    again[again.length - 1].es_fila_cierre = true
    again[again.length - 1].punto_biblioteca_id = filas[2].punto_biblioteca_id

    const a = cierreDesdeVista(filas, tipoNivel, cotasBib, 'BM-INI')
    const b = cierreDesdeVista(again, tipoNivel, cotasBib, 'BM-INI')
    assert.ok(Math.abs(a.errorMm - b.errorMm) < 1e-6)
    assert.ok(Math.abs(a.toleranciaMm - b.toleranciaMm) < 1e-6)
    assert.equal(a.admisible, b.admisible)
  })
})

describe('cierre de nivelación — datos de campo (resultado numérico)', () => {
  it('calcula error, tolerancia y dictamen (cliente)', () => {
    const { filas, tipoNivel, cotasBib } = circuitoCampo()
    const c = cierreDesdeVista(filas, tipoNivel, cotasBib, 'BM-INI', 1)

    // Publicar números explícitos para el reporte del ticket
    console.log('\n=== CIERRE NIVELACIÓN (cliente calcularVistaNivelacion) ===')
    console.log(`Cota calculada cierre: ${c.cotaCalc?.toFixed(4)} m`)
    console.log(`Cota biblioteca BM:    ${c.cotaBib?.toFixed(4)} m`)
    console.log(`Error de cierre:       ${c.errorMm.toFixed(3)} mm`)
    console.log(`Tolerancia:            ${c.toleranciaMm.toFixed(3)} mm  (1 mm/√km · √${c.distKm.toFixed(4)} km)`)
    console.log(`Dictamen:              ${c.admisible ? 'ADMISIBLE' : 'INADMISIBLE'}`)
    console.log(`Dist V+ + V−:          ${(c.distKm * 1000).toFixed(1)} m`)
    console.log('=========================================================\n')

    assert.ok(c.cotaCalc != null)
    assert.ok(Math.abs(c.errorMm - (-0.2)) < 0.05, `errorMm=${c.errorMm}`)
    assert.ok(Math.abs(c.toleranciaMm - 0.4) < 0.01, `tolMm=${c.toleranciaMm}`)
    assert.equal(c.admisible, true)
    assert.ok(Math.abs(c.distKm - 0.16) < 1e-6)
  })

  it('coincide con calcular_nivelacion_geometrica (backend)', () => {
    const { filas, tipoNivel, cotasBib } = circuitoCampo()
    const lecturas = filasToLecturas(filas, tipoNivel).map((l, i) => ({
      ...l,
      id: `L${i}`,
      // marcar cierre
      ...(filas[Math.floor(((l.orden || 1) - 1) / 10)]?.es_fila_cierre
        ? { punto_biblioteca_id: 'bm-ini', descripcion_punto: 'Punto de cierre' }
        : {}),
    }))

    const py = `
import json
from topografia_utils import calcular_nivelacion_geometrica
niv = {"tipo_nivel": "automatico", "tolerancia_mm_km": 1, "distancia_max_visual_m": 50, "distancia_max_circuito_km": 1}
cotas = json.loads(${JSON.stringify(JSON.stringify(cotasBib))})
lecturas = json.loads(${JSON.stringify(JSON.stringify(lecturas))})
res = calcular_nivelacion_geometrica(niv, lecturas, cotas, "BM-INI", "BM-INI")
print(json.dumps({
  "error_cierre": res.get("error_cierre"),
  "tolerancia_calculada": res.get("tolerancia_calculada"),
  "admisible": res.get("admisible"),
  "distancia_km": res.get("distancia_km"),
  "distancia_vplus_m": res.get("distancia_vplus_m"),
  "distancia_vminus_m": res.get("distancia_vminus_m"),
  "errores": res.get("errores"),
}))
`
    const r = spawnSync('python3', ['-c', py], { cwd: backendRoot, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    const backend = JSON.parse(r.stdout.trim().split('\n').pop())

    const client = cierreDesdeVista(filas, tipoNivel, cotasBib, 'BM-INI', 1)

    console.log('\n=== CIERRE NIVELACIÓN (backend calcular_nivelacion_geometrica) ===')
    console.log(`Error de cierre:  ${backend.error_cierre != null ? (backend.error_cierre * 1000).toFixed(3) : '—'} mm`)
    console.log(`Tolerancia:       ${backend.tolerancia_calculada != null ? (backend.tolerancia_calculada * 1000).toFixed(3) : '—'} mm`)
    console.log(`Dictamen:         ${backend.admisible ? 'ADMISIBLE' : 'INADMISIBLE'}`)
    console.log(`Distancia km:     ${backend.distancia_km}`)
    console.log(`Errores calc:     ${JSON.stringify(backend.errores)}`)
    console.log('=================================================================\n')

    assert.ok(backend.error_cierre != null, 'backend sin error_cierre')
    assert.ok(Math.abs(backend.error_cierre * 1000 - client.errorMm) < 0.05)
    assert.ok(Math.abs(backend.tolerancia_calculada * 1000 - client.toleranciaMm) < 0.05)
    assert.equal(backend.admisible, client.admisible)
    assert.equal(backend.admisible, true)
  })
})
