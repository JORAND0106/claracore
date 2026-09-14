/**
 * Separación S/M/I: mensaje con valores, sin duplicar UI, bloqueo si Δ > 2 mm.
 * node --test frontend/src/utils/topografia_nivelacion_hilos_sep.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HILO_PAR_TOL,
  diagnosticoHilosIncongruentes,
  hilosSeparacionBloqueante,
  mensajeSeparacionDesigual,
  prepararBorradorBmInicial,
  recolectarDiagnosticosHilosFila,
  validarBorradorParaAgregar,
} from './topografia_nivelacion.js'

const dir = dirname(fileURLToPath(import.meta.url))
const sharedSrc = readFileSync(join(dir, '../components/topografia/nivelacionUiShared.jsx'), 'utf8')
const ingresoSrc = readFileSync(join(dir, '../components/topografia/NivelacionIngresoPanel.jsx'), 'utf8')

describe('mensajeSeparacionDesigual', () => {
  it('incluye |S−M|, |M−I| y la diferencia en m y mm', () => {
    const msg = mensajeSeparacionDesigual(0.25, 0.2)
    assert.match(msg, /\|S−M\|=0\.250 m/)
    assert.match(msg, /\|M−I\|=0\.200 m/)
    assert.match(msg, /0\.050 m/)
    assert.match(msg, /50\.0 mm/)
    assert.match(msg, /\|S−M\| supera a \|M−I\|/)
  })
})

describe('diagnosticoHilosIncongruentes — umbral 2 mm', () => {
  it('Δ < 2 mm: sin diagnóstico', () => {
    // |S−M|=0.200, |M−I|=0.199 → Δ=0.001
    const d = diagnosticoHilosIncongruentes({ hS: 1.4, hM: 1.2, hI: 1.001 }, 'automatico')
    assert.equal(d, null)
  })

  it('Δ = 2 mm (= HILO_PAR_TOL): sin diagnóstico / no bloquea', () => {
    assert.equal(HILO_PAR_TOL, 0.002)
    // |S−M|=0.200, |M−I|=0.198 → Δ=0.002
    const d = diagnosticoHilosIncongruentes({ hS: 1.4, hM: 1.2, hI: 1.002 }, 'automatico')
    assert.equal(d, null)
    assert.equal(hilosSeparacionBloqueante({ hS: 1.4, hM: 1.2, hI: 1.002 }, 'automatico'), false)
  })

  it('Δ > 2 mm: mensaje detallado y bloqueante', () => {
    // |S−M|=0.250, |M−I|=0.200 → Δ=0.050
    const d = diagnosticoHilosIncongruentes({ hS: 1.5, hM: 1.25, hI: 1.05 }, 'automatico')
    assert.ok(d)
    assert.equal(d.tipo, 'separacion')
    assert.equal(d.bloqueante, true)
    assert.ok(Math.abs(d.sepSM - 0.25) < 1e-12)
    assert.ok(Math.abs(d.sepMI - 0.2) < 1e-12)
    assert.ok(Math.abs(d.diffSep - 0.05) < 1e-12)
    assert.match(d.msg, /\|S−M\|=0\.250/)
    assert.match(d.msg, /\|M−I\|=0\.200/)
    assert.equal(hilosSeparacionBloqueante({ hS: 1.5, hM: 1.25, hI: 1.05 }, 'automatico'), true)
  })

  it('orden HM fuera de rango sigue siendo aviso no bloqueante', () => {
    // sep OK (|S−M|=|M−I|=0.3) y M fuera de [S,I]
    const d = diagnosticoHilosIncongruentes({ hS: 0.5, hM: 0.8, hI: 0.5 }, 'automatico')
    assert.ok(d)
    assert.equal(d.tipo, 'orden')
    assert.equal(d.bloqueante, false)
  })
})

describe('validarBorradorParaAgregar — bloqueo separación', () => {
  function borradorConVplus(hS, hM, hI) {
    return {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa_inicial: '1000',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: 'K1',
      descripcion_punto: 'BM',
      vplus: { hS: String(hS), hM: String(hM), hI: String(hI), lectura: '' },
    }
  }

  it('bloquea agregar cuando Δ > 2 mm', () => {
    const gate = validarBorradorParaAgregar(
      borradorConVplus(1.5, 1.25, 1.05),
      [],
      'automatico',
      'BM-INI',
      { modoApertura: true, circuitoAbierto: true },
    )
    assert.equal(gate.ok, false)
    assert.match(gate.msg, /\|S−M\|=/)
    assert.ok(gate.erroresHilos?.length)
  })

  it('permite agregar cuando Δ ≤ 2 mm', () => {
    const gate = validarBorradorParaAgregar(
      borradorConVplus(1.4, 1.2, 1.002),
      [],
      'automatico',
      'BM-INI',
      { modoApertura: true, circuitoAbierto: true },
    )
    assert.equal(gate.ok, true, gate.msg)
  })

  it('recolectarDiagnosticosHilosFila separa errores y avisos', () => {
    const { avisosHilos, erroresHilos } = recolectarDiagnosticosHilosFila({
      vplus: { hS: 1.5, hM: 1.25, hI: 1.05 }, // sep bloqueante
      vi: { hS: 0.5, hM: 0.8, hI: 0.5 }, // orden aviso
      vminus: { hS: '', hM: '', hI: '' },
    }, 'automatico')
    assert.equal(erroresHilos.length, 1)
    assert.match(erroresHilos[0], /^V\+:/)
    assert.equal(avisosHilos.length, 1)
    assert.match(avisosHilos[0], /^Vi:/)
  })
})

describe('UI — mensaje de separación una sola vez', () => {
  it('HilosInputs ya no repite el prefijo corto bajo los campos', () => {
    assert.doesNotMatch(sharedSrc, /diagMsg\)\.split\(':'\)/)
  })

  it('panel muestra un solo aviso compacto por bloque y deshabilita Agregar si bloquea', () => {
    assert.match(ingresoSrc, /AlertaHilos title=\{diag\.msg\} compact/)
    assert.match(ingresoSrc, /filaHilosSeparacionBloqueante/)
    assert.match(ingresoSrc, /hilosBloqueantes/)
    assert.match(ingresoSrc, /niv-hilos-sep-bloqueo/)
    // No banner que repite el mismo msg de diagnóstico
    assert.doesNotMatch(ingresoSrc, /hilosAvisos\[0\]/)
  })
})
