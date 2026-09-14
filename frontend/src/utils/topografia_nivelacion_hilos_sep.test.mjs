/**
 * Separación S/M/I: mensaje corto + tooltip, bloqueo si Δ > 2 mm.
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
  mensajeSeparacionCorto,
  tooltipSeparacionDesigual,
  prepararBorradorBmInicial,
  recolectarDiagnosticosHilosFila,
  validarBorradorParaAgregar,
} from './topografia_nivelacion.js'

const dir = dirname(fileURLToPath(import.meta.url))
const sharedSrc = readFileSync(join(dir, '../components/topografia/nivelacionUiShared.jsx'), 'utf8')
const ingresoSrc = readFileSync(join(dir, '../components/topografia/NivelacionIngresoPanel.jsx'), 'utf8')

describe('mensajeSeparacionCorto + tooltip', () => {
  it('mensaje corto solo con S−M y M−I', () => {
    const msg = mensajeSeparacionCorto(0.25, 0.2)
    assert.equal(msg, 'S − M = 0.250 | M − I = 0.200')
    assert.doesNotMatch(msg, /Separación desigual|Corrija/)
  })

  it('tooltip incluye detalle de Δ y corrección', () => {
    const tip = tooltipSeparacionDesigual(0.25, 0.2)
    assert.match(tip, /\|S−M\|=0\.250 m/)
    assert.match(tip, /\|M−I\|=0\.200 m/)
    assert.match(tip, /50\.0 mm/)
    assert.match(tip, /Corrija HS, HM o HI/)
  })
})

describe('diagnosticoHilosIncongruentes — umbral 2 mm', () => {
  it('Δ < 2 mm: sin diagnóstico', () => {
    const d = diagnosticoHilosIncongruentes({ hS: 1.4, hM: 1.2, hI: 1.001 }, 'automatico')
    assert.equal(d, null)
  })

  it('Δ = 2 mm (= HILO_PAR_TOL): sin diagnóstico / no bloquea', () => {
    assert.equal(HILO_PAR_TOL, 0.002)
    const d = diagnosticoHilosIncongruentes({ hS: 1.4, hM: 1.2, hI: 1.002 }, 'automatico')
    assert.equal(d, null)
    assert.equal(hilosSeparacionBloqueante({ hS: 1.4, hM: 1.2, hI: 1.002 }, 'automatico'), false)
  })

  it('Δ > 2 mm: msg corto + tooltip detallado y bloqueante', () => {
    const d = diagnosticoHilosIncongruentes({ hS: 1.5, hM: 1.25, hI: 1.05 }, 'automatico')
    assert.ok(d)
    assert.equal(d.tipo, 'separacion')
    assert.equal(d.bloqueante, true)
    assert.equal(d.msg, 'S − M = 0.250 | M − I = 0.200')
    assert.match(d.tooltip, /Separación desigual/)
    assert.match(d.tooltip, /50\.0 mm/)
    assert.equal(hilosSeparacionBloqueante({ hS: 1.5, hM: 1.25, hI: 1.05 }, 'automatico'), true)
  })

  it('orden HM fuera de rango sigue siendo aviso no bloqueante', () => {
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
    assert.match(gate.msg, /S − M =/)
    assert.match(gate.msg, /M − I =/)
    assert.doesNotMatch(gate.msg, /Separación desigual/)
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
      vplus: { hS: 1.5, hM: 1.25, hI: 1.05 },
      vi: { hS: 0.5, hM: 0.8, hI: 0.5 },
      vminus: { hS: '', hM: '', hI: '' },
    }, 'automatico')
    assert.equal(erroresHilos.length, 1)
    assert.match(erroresHilos[0], /^V\+: S − M =/)
    assert.equal(avisosHilos.length, 1)
    assert.match(avisosHilos[0], /^Vi:/)
  })
})

describe('UI — mensaje corto + help tooltip', () => {
  it('AlertaHilos compacto tiene ícono de ayuda (?)', () => {
    assert.match(sharedSrc, /niv-alerta-hilos-help/)
    assert.match(sharedSrc, />\s*\?\s*</)
    assert.match(sharedSrc, /tip\s*=\s*null/)
  })

  it('panel pasa tip=diag.tooltip y mantiene bloqueo', () => {
    assert.match(ingresoSrc, /AlertaHilos title=\{diag\.msg\} tip=\{diag\.tooltip/)
    assert.match(ingresoSrc, /filaHilosSeparacionBloqueante/)
    assert.match(ingresoSrc, /hilosBloqueantes/)
    assert.match(ingresoSrc, /niv-hilos-sep-bloqueo/)
  })
})
